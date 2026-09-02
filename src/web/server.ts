import { createServer, type IncomingMessage, type Server } from 'node:http'
import { z } from 'zod'
import { createLogger } from '../core/logger.js'
import type { Env } from '../config/schema.js'
import { createCrawlProvider } from '../providers/real/crawlProvider.js'
import { createGeminiAiVisibilityProvider } from '../providers/real/geminiAiVisibilityProvider.js'
import { createLighthouseProvider } from '../providers/real/lighthouseProvider.js'
import { createPageSpeedProvider } from '../providers/real/pageSpeedProvider.js'
import { createSerpApiProvider } from '../providers/real/serpApiProvider.js'
import { DOMAIN_PATTERN, GEO_QUESTION_MAX_COUNT, GEO_QUESTION_MAX_LENGTH, MAX_REQUEST_BODY_BYTES } from './constants.js'
import { runLiteAnalysis, type LiteAnalysisDeps } from './liteAnalysis.js'
import { renderLiteReportHtml } from './liteReport.js'
import { createIpRateLimiter, type DailyBudget } from './rateLimit.js'

const logger = createLogger('web')

const AnalyzeRequestSchema = z.object({
  domain: z.string().regex(DOMAIN_PATTERN, 'Geçersiz domain'),
  geoQuestions: z.array(z.string().trim().min(1).max(GEO_QUESTION_MAX_LENGTH)).min(1).max(GEO_QUESTION_MAX_COUNT),
})

const readBody = async (
  stream: AsyncIterable<Buffer>,
): Promise<{ readonly ok: true; readonly body: string } | { readonly ok: false; readonly reason: string }> => {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of stream) {
    size += chunk.length
    if (size > MAX_REQUEST_BODY_BYTES) return { ok: false, reason: 'Gövde çok büyük' }
    chunks.push(chunk)
  }
  return { ok: true, body: Buffer.concat(chunks).toString('utf-8') }
}

const clientKey = (request: IncomingMessage): string => request.socket.remoteAddress ?? 'bilinmeyen'

/**
 * `.env`'deki anahtarlara göre `LiteAnalysisDeps`'i doldurur — `crawlPage` hariç (o hep
 * gerçek sağlayıcı, SSRF koruması `liteAnalysis.ts` içinde zaten var). Anahtar yoksa
 * ilgili alan `null` — `liteAnalysis.ts` bunu "bu bölüm atlandı" olarak ele alır, hata
 * SAYMAZ (kamuya açık bir ziyaretçi hiçbir API anahtarı yapılandırmadığını bilemez).
 */
const buildDeps = (env: Env, serpBudget: DailyBudget | null): Omit<LiteAnalysisDeps, 'crawlPage'> => {
  const pageSpeedApiKey = env.PAGESPEED_API_KEY
  const auditUrl =
    pageSpeedApiKey !== undefined
      ? createPageSpeedProvider(pageSpeedApiKey).auditUrl
      : env.TECH_AUDIT_PROVIDER === 'lighthouse'
        ? createLighthouseProvider().auditUrl
        : null

  const geminiApiKey = env.GEMINI_API_KEY
  const askGeo = geminiApiKey !== undefined ? (query: string) => createGeminiAiVisibilityProvider(geminiApiKey).askQuery(query, 0) : null

  const serpApiKey = env.SERPAPI_KEY
  const fetchSerp = serpApiKey !== undefined ? createSerpApiProvider(serpApiKey).fetchSerp : null

  return { auditUrl, askGeo, fetchSerp, serpBudget: fetchSerp !== null ? serpBudget : null }
}

const FORM_HTML = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SEO Hızlı Kontrol</title>
<style>
  :root { color-scheme: light dark; --bg:#fff; --fg:#1a202c; --border:#e2e8f0; --accent:#2b6cb0; --card-bg:#f7fafc; }
  @media (prefers-color-scheme: dark) { :root { --bg:#16181d; --fg:#e2e8f0; --border:#2d3748; --accent:#63b3ed; --card-bg:#1e2229; } }
  body { font-family: -apple-system, 'Segoe UI', sans-serif; max-width: 520px; margin: 3rem auto; padding: 0 1rem; background: var(--bg); color: var(--fg); }
  h1 { font-size: 1.3rem; }
  label { display:block; margin-top: 1rem; font-size: .9rem; }
  input, button { font: inherit; padding: .5rem .6rem; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--fg); width: 100%; box-sizing: border-box; }
  button { margin-top: 1.25rem; background: var(--accent); color: #fff; border: none; cursor: pointer; }
  button:disabled { opacity: .6; cursor: default; }
  .question-row { display:flex; gap:.4rem; margin-top:.4rem; }
  .question-row input { flex:1; }
  .question-row button { width:auto; margin-top:0; background:var(--card-bg); color:var(--fg); }
  #status { margin-top:1rem; font-size:.85rem; color: var(--accent); }
</style>
</head>
<body>
<h1>SEO Hızlı Kontrol</h1>
<p>Domaininizi ve müşterilerinizin AI'ya sorabileceği 1-5 soruyu girin.</p>
<form id="f">
  <label>Domain<input type="text" id="domain" placeholder="ornek.com" required></label>
  <label>AI Görünürlük Soruları</label>
  <div id="questions"></div>
  <button type="button" id="addQuestion">+ Soru ekle</button>
  <button type="submit" id="submit">Analiz Et</button>
</form>
<div id="status"></div>
<script>
(function () {
  var questionsEl = document.getElementById('questions');
  var MAX_QUESTIONS = 5;

  function addQuestionRow() {
    if (questionsEl.children.length >= MAX_QUESTIONS) return;
    var row = document.createElement('div');
    row.className = 'question-row';
    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Örn: İstanbulda en iyi dijital ajans hangisi?';
    input.maxLength = 200;
    var remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '✕';
    remove.addEventListener('click', function () { row.remove(); });
    row.appendChild(input);
    row.appendChild(remove);
    questionsEl.appendChild(row);
  }
  addQuestionRow();
  document.getElementById('addQuestion').addEventListener('click', addQuestionRow);

  document.getElementById('f').addEventListener('submit', function (event) {
    event.preventDefault();
    var domain = document.getElementById('domain').value.trim();
    var geoQuestions = Array.prototype.slice.call(questionsEl.querySelectorAll('input'))
      .map(function (input) { return input.value.trim(); })
      .filter(function (value) { return value.length > 0; });
    if (geoQuestions.length === 0) {
      document.getElementById('status').textContent = 'En az 1 AI görünürlük sorusu girin.';
      return;
    }
    var submitBtn = document.getElementById('submit');
    submitBtn.disabled = true;
    document.getElementById('status').textContent = 'Analiz ediliyor… (30-60sn sürebilir)';
    fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: domain, geoQuestions: geoQuestions }),
    }).then(function (response) {
      return response.text().then(function (text) { return { ok: response.ok, text: text }; });
    }).then(function (result) {
      if (result.ok) {
        document.open();
        document.write(result.text);
        document.close();
      } else {
        document.getElementById('status').textContent = result.text;
        submitBtn.disabled = false;
      }
    }).catch(function () {
      document.getElementById('status').textContent = 'Beklenmeyen bir hata oluştu.';
      submitBtn.disabled = false;
    });
  });
})();
</script>
</body>
</html>`

export interface WebServerOptions {
  /** İzin verilen origin'ler — boş dizi = geliştirme modu (bkz. rum/collector.ts ile aynı desen). */
  readonly allowedOrigins: readonly string[]
  readonly env: Env
  readonly serpBudget: DailyBudget | null
}

/**
 * Versiyon A (kamuya açık hafif web aracı) HTTP sunucusu — çıplak `node:http`, yeni
 * bağımlılık YOK. `src/rum/collector.ts` deseniyle: origin allowlist (hem CORS başlığı
 * hem sunucu-taraflı 403), gövde boyutu sınırı, IP-başına oran sınırı, Zod doğrulama.
 * Test edilebilirlik için saf bir `createServer` fabrikası — gerçek çalıştırma
 * `src/cli/web.ts`'te (env yükleme, günlük bütçe DB'sini açma, `.listen()`).
 */
export const createWebServer = (options: WebServerOptions): Server => {
  const isRateLimited = createIpRateLimiter()

  return createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(FORM_HTML)
      return
    }

    // Dış denetim bulgusu (2026-09-02) — CORS başlığı `isOriginAllowed` kontrolünden ÖNCE
    // hesaplanırsa, allowlist doluyken Origin başlığı yoksa `requestOrigin` undefined kalır
    // ve `writeHead` bunu geçersiz başlık değeri sayıp sunucuyu ÇÖKERTİR (ERR_HTTP_INVALID_
    // HEADER_VALUE) — ret yanıtı bile dönemez. Doğru sıra: önce izin kontrolü (cors
    // BAŞLIKSIZ 403), cors nesnesi ancak izin onaylandıktan SONRA kurulur — o noktada
    // `requestOrigin` ya tanımsız değildir ya da allowlist zaten boştur ('*' kullanılır).
    const requestOrigin = request.headers.origin
    const isOriginAllowed =
      options.allowedOrigins.length === 0 || (requestOrigin !== undefined && options.allowedOrigins.includes(requestOrigin))
    if (!isOriginAllowed) {
      response.writeHead(403).end('İzin verilmeyen origin')
      return
    }

    const cors = {
      'Access-Control-Allow-Origin': options.allowedOrigins.length === 0 ? '*' : (requestOrigin as string),
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    }

    if (request.method === 'OPTIONS') {
      response.writeHead(204, cors).end()
      return
    }

    if (request.method !== 'POST' || request.url !== '/api/analyze') {
      response.writeHead(404, cors).end('Bulunamadı')
      return
    }
    if (!isRateLimited(clientKey(request))) {
      response.writeHead(429, cors).end('Çok fazla istek — bir dakika sonra tekrar deneyin')
      return
    }

    void (async () => {
      const read = await readBody(request)
      if (!read.ok) {
        response.writeHead(413, cors).end(read.reason)
        return
      }

      let parsedJson: unknown
      try {
        parsedJson = JSON.parse(read.body)
      } catch {
        response.writeHead(400, cors).end('Geçersiz JSON')
        return
      }

      const validated = AnalyzeRequestSchema.safeParse(parsedJson)
      if (!validated.success) {
        response.writeHead(400, cors).end('Geçersiz istek — domain ve 1-5 AI görünürlük sorusu gerekli')
        return
      }

      const deps: LiteAnalysisDeps = { crawlPage: createCrawlProvider().fetchPage, ...buildDeps(options.env, options.serpBudget) }
      const analysis = await runLiteAnalysis(validated.data.domain, validated.data.geoQuestions, deps)
      if (!analysis.ok) {
        logger.warn(`Analiz başarısız (${validated.data.domain}): ${analysis.error.message}`)
        response.writeHead(422, { ...cors, 'Content-Type': 'text/plain; charset=utf-8' }).end(`Analiz başarısız: ${analysis.error.message}`)
        return
      }

      response.writeHead(200, { ...cors, 'Content-Type': 'text/html; charset=utf-8' }).end(renderLiteReportHtml(analysis.value))
    })()
  })
}
