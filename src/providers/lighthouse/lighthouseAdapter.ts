import type { ClsAttribution, CwvAttribution, LcpAttribution } from '../../core/cwv.js'
import { ProviderError, summarizeZodError } from '../../core/errors.js'
import { estimateImpact, type Finding, type FindingEffort, type FindingSeverity } from '../../core/findings.js'
import { err, ok, type Result } from '../../core/result.js'
import type { TechAudit } from '../../core/types.js'
import {
  asRecord,
  detailItems,
  isNodeDetail,
  isSubpartRow,
  LighthouseResultSchema,
  numberOrNull,
  stringOrNull,
  type LighthouseAudits,
} from './lighthouseSchema.js'

const KIB = 1024

const auditNumber = (audits: LighthouseAudits, id: string): number | null =>
  numberOrNull(audits[id]?.numericValue)

const auditDetails = (audits: LighthouseAudits, id: string): unknown => audits[id]?.details

/** `<img src="...">` snippet'inden kaynak URL'ini çıkarır. */
const srcFromSnippet = (snippet: string | null): string | null => {
  if (snippet === null) return null
  const match = /src="([^"]+)"/.exec(snippet)
  return match?.[1] ?? null
}

/**
 * LCP faz kırılımı. Lighthouse 13 bunu `lcp-breakdown-insight` altında verir ve
 * `subpart` anahtarları web-vitals attribution alan adlarıyla birebir aynıdır
 * (timeToFirstByte / resourceLoadDelay / resourceLoadDuration / elementRenderDelay).
 * Metin LCP'de kaynak fazları hiç görünmez — o durumda `url` null kalır ve
 * teşhis motoru "font geç keşfediliyor" dalına girer.
 */
const extractLcpAttribution = (audits: LighthouseAudits): LcpAttribution | null => {
  const items = detailItems(auditDetails(audits, 'lcp-breakdown-insight'))
  if (items.length === 0) return null

  const durations = new Map<string, number>()
  for (const item of items) {
    for (const row of detailItems(item)) {
      if (isSubpartRow(row)) durations.set(row.subpart, row.duration)
    }
  }
  if (durations.size === 0) return null

  const node = items.find(isNodeDetail)
  const hasResourcePhases = durations.has('resourceLoadDelay') || durations.has('resourceLoadDuration')

  return {
    target: stringOrNull(node?.selector ?? null),
    url: hasResourcePhases ? srcFromSnippet(stringOrNull(node?.snippet ?? null)) : null,
    timeToFirstByte: durations.get('timeToFirstByte') ?? 0,
    resourceLoadDelay: durations.get('resourceLoadDelay') ?? 0,
    resourceLoadDuration: durations.get('resourceLoadDuration') ?? 0,
    elementRenderDelay: durations.get('elementRenderDelay') ?? 0,
  }
}

/**
 * CLS suçlusu. Lighthouse kaymanın ZAMANINI vermez; lab koşusunda etkileşim olmadığı
 * için tüm kaymalar yükleme aşamasındadır — `largestShiftTime` 0 bırakılır ve teşhis
 * motoru doğru şekilde "yükleme kaynaklı kayma" dalına girer.
 */
const extractClsAttribution = (audits: LighthouseAudits): ClsAttribution | null => {
  const items = detailItems(auditDetails(audits, 'layout-shifts'))
  if (items.length === 0) return null

  const scored = items.map((item) => {
    const record = asRecord(item)
    return {
      score: numberOrNull(record['score']) ?? 0,
      node: isNodeDetail(record['node']) ? record['node'] : null,
    }
  })
  const largest = scored.reduce((best, current) => (current.score > best.score ? current : best))

  return {
    largestShiftTarget: stringOrNull(largest.node?.selector ?? null),
    largestShiftValue: largest.score,
    largestShiftTime: 0,
    loadState: 'loading',
  }
}

const formatKib = (bytes: number): string => `${Math.round(bytes / KIB).toLocaleString('tr-TR')} KB`

interface SeoAuditCopy {
  readonly severity: FindingSeverity
  readonly effort: FindingEffort
  readonly title: string
  readonly explanation: string
  readonly fixSnippet: string
}

/**
 * Lighthouse SEO kategorisinin otomatik puanlanan (`scoreDisplayMode: 'binary'`) on audit'i.
 * `structured-data` bilerek dışarıda: `scoreDisplayMode: 'manual'`, hiçbir zaman otomatik
 * puanlanmaz — `score` her zaman null gelir, bulgu üretmek yanlış olurdu.
 * Gerçek mamcreatives.com koşusuna karşı doğrulandı (audit id'leri ve `details` şekli).
 */
const SEO_AUDIT_COPY: Readonly<Record<string, SeoAuditCopy>> = {
  'is-crawlable': {
    severity: 'critical',
    effort: 'small',
    title: 'Arama motorları sayfayı taramasını engelleyen bir direktif buldu',
    explanation:
      'Sayfa "noindex" meta etiketi, X-Robots-Tag başlığı veya robots.txt disallow kuralı yüzünden ' +
      'taranamıyor olabilir. Bu, sayfanın Google indeksinden tamamen dışlanması demektir — düzeltilmeden ' +
      'diğer tüm SEO çalışmaları anlamsız kalır.',
    fixSnippet:
      `<!-- HTML meta etiketini kontrol et -->\n<meta name="robots" content="index, follow">\n\n` +
      `# HTTP başlığını kontrol et\ncurl -sI https://example.com/ | grep -i x-robots-tag`,
  },
  'document-title': {
    severity: 'high',
    effort: 'trivial',
    title: 'Sayfada <title> etiketi eksik veya boş',
    explanation:
      'Arama sonuçlarında gösterilen başlık ve tıklama oranını (CTR) en çok etkileyen tek etikettir. ' +
      'Eksikse Google kendi başlığını üretir — marka ve anahtar kelime kontrolü kaybedilir.',
    fixSnippet: `<title>Anahtar Kelime | Marka Adı</title>`,
  },
  'meta-description': {
    severity: 'medium',
    effort: 'trivial',
    title: 'Sayfada meta description eksik',
    explanation:
      "Google bu alanı SERP özetinde gösterir; boşsa sayfa içeriğinden rastgele bir parça seçer — CTR'yi " +
      'doğrudan etkiler. 150-160 karakter, sayfaya özgü ve harekete geçirici olmalı.',
    fixSnippet: `<meta name="description" content="Sayfaya özgü, 150-160 karakter, harekete geçirici bir özet.">`,
  },
  'http-status-code': {
    severity: 'critical',
    effort: 'large',
    title: 'Sayfa başarısız bir HTTP durum kodu döndürüyor',
    explanation: '4xx/5xx yanıt veren bir sayfa arama motorları tarafından taranamaz ve indekslenemez.',
    fixSnippet: `curl -sI https://example.com/ | head -1`,
  },
  'link-text': {
    severity: 'low',
    effort: 'small',
    title: 'Bağlantı metinleri açıklayıcı değil',
    explanation:
      '"buraya tıkla", "devamını oku" gibi genel ifadeler hem kullanıcıya hem arama motoruna bağlantının ' +
      'hedefi hakkında bilgi vermez — anchor metni bir sıralama sinyalidir.',
    fixSnippet:
      `<!-- KÖTÜ -->\n<a href="/hizmetler">buraya tıkla</a>\n\n` +
      `<!-- İYİ -->\n<a href="/hizmetler">Dijital pazarlama hizmetlerimiz</a>`,
  },
  'crawlable-anchors': {
    severity: 'high',
    effort: 'small',
    title: 'Bağlantılar taranabilir değil',
    explanation:
      'href="javascript:void(0)" gibi bağlantılar tarayıcı için tıklanabilir ama arama motoru için ' +
      'görünmezdir — o linkin götürdüğü sayfa hiç keşfedilemez.',
    fixSnippet:
      `<!-- KÖTÜ: tarama motoru bu linki takip edemez -->\n` +
      `<a href="javascript:void(0);" onclick="toggleMenu()">Kurumsal</a>\n\n` +
      `<!-- İYİ: gerçek href + davranış ayrı -->\n` +
      `<a href="/kurumsal" onclick="toggleMenu(event)">Kurumsal</a>`,
  },
  'robots-txt': {
    severity: 'high',
    effort: 'small',
    title: 'robots.txt geçersiz',
    explanation:
      "Söz dizimi hataları arama motorunun robots.txt'i yanlış yorumlamasına, istemeden tüm siteyi ya da " +
      'kritik bölümleri engellemesine yol açabilir.',
    fixSnippet: `User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml`,
  },
  'image-alt': {
    severity: 'medium',
    effort: 'medium',
    title: 'Görsellerde alt metni eksik',
    explanation:
      'alt metni hem erişilebilirlik hem görsel arama (Google Images) için gereklidir; eksikse görsel ' +
      'hiçbir bağlamda indekslenemez.',
    fixSnippet: `<img src="/urun.jpg" alt="Ürünün açıklayıcı, anahtar kelime içeren metni">`,
  },
  hreflang: {
    severity: 'medium',
    effort: 'medium',
    title: 'hreflang etiketleri hatalı',
    explanation:
      "Karşılıklı olmayan (reciprocal olmayan) hreflang etiketleri veya eksik x-default, Google'ın yanlış " +
      'dil/bölge sürümünü göstermesine yol açar.',
    fixSnippet:
      `<link rel="alternate" hreflang="tr" href="https://example.com/tr/" />\n` +
      `<link rel="alternate" hreflang="en" href="https://example.com/en/" />\n` +
      `<link rel="alternate" hreflang="x-default" href="https://example.com/" />`,
  },
  canonical: {
    severity: 'high',
    effort: 'small',
    title: 'canonical etiketi hatalı veya çelişkili',
    explanation:
      "Birden fazla ya da başka bir domaine işaret eden canonical, Google'ın hangi URL'i sıralayacağına " +
      'kendi kararını vermesine yol açar — genelde istenmeyen bir sayfa öne çıkar.',
    fixSnippet: `<link rel="canonical" href="https://example.com/hedef-sayfa/">`,
  },
}

/** İlk `node` detayının CSS seçicisi — audit'in suçladığı somut element. */
const firstCulprit = (details: unknown): string | null => {
  const items = detailItems(details)
  for (const item of items) {
    const record = asRecord(item)
    const node = isNodeDetail(record['node']) ? record['node'] : isNodeDetail(item) ? item : null
    const selector = stringOrNull(node?.selector ?? null)
    if (selector !== null) return selector
  }
  return null
}

/**
 * Lighthouse SEO audit'lerini rapor bulgusuna çevirir. Yalnız `score === 0` olanlar
 * (gerçekten başarısız, otomatik puanlanmış) bulgu üretir — `null` (manual/notApplicable)
 * veya `1` (geçti) sessizce atlanır.
 *
 * `evidence` önce audit'in kendi `explanation`'ını kullanır (Lighthouse'un tek satırlık
 * somut sebebi); yoksa etkilenen element sayısına düşer — uydurma kanıt üretilmez.
 */
export const extractSeoFindings = (audits: LighthouseAudits, url: string): readonly Finding[] =>
  Object.entries(SEO_AUDIT_COPY).flatMap(([id, copy]) => {
    const audit = audits[id]
    if (audit === undefined || audit.score !== 0) return []

    const itemCount = detailItems(audit.details).length
    const evidence =
      stringOrNull(audit.explanation ?? null) ?? (itemCount > 0 ? `${itemCount} elementte tespit edildi` : copy.title)

    return [
      {
        category: 'onpage',
        severity: copy.severity,
        url,
        culpritSelector: firstCulprit(audit.details),
        title: copy.title,
        explanation: `${copy.explanation} (${evidence})`,
        evidence,
        impact: estimateImpact(copy.severity),
        effort: copy.effort,
        fixSnippet: copy.fixSnippet,
      },
    ]
  })

/** Lighthouse insight'larını rapordaki serbest metin sorun listesine çevirir. */
const extractIssues = (audits: LighthouseAudits): readonly string[] => {
  const imageIssues = detailItems(auditDetails(audits, 'image-delivery-insight')).flatMap((item) => {
    const record = asRecord(item)
    const url = stringOrNull(record['url'])
    const totalBytes = numberOrNull(record['totalBytes'])
    if (url === null || totalBytes === null) return []
    const wastedBytes = numberOrNull(record['wastedBytes'])
    const reasons = detailItems(record['subItems'])
      .map((sub) => stringOrNull(asRecord(sub)['reason']))
      .filter((reason): reason is string => reason !== null)
    const savings = wastedBytes === null ? '' : `, ${formatKib(wastedBytes)} tasarruf edilebilir`
    const detail = reasons.length > 0 ? ` — ${reasons.join(' ')}` : ''
    return [`Optimize edilmemiş görsel (${formatKib(totalBytes)}${savings}): ${url}${detail}`]
  })

  const renderBlocking = detailItems(auditDetails(audits, 'render-blocking-insight')).flatMap((item) => {
    const record = asRecord(item)
    const url = stringOrNull(record['url'])
    if (url === null) return []
    const bytes = numberOrNull(record['totalBytes'])
    return [`Render engelleyen kaynak${bytes === null ? '' : ` (${formatKib(bytes)})`}: ${url}`]
  })

  // document-latency-insight bir "checklist"tir: value=false olan maddeler başarısız kontrollerdir.
  const latencyChecks = Object.values(asRecord(asRecord(auditDetails(audits, 'document-latency-insight'))['items']))
    .flatMap((check) => {
      const record = asRecord(check)
      const label = stringOrNull(record['label'])
      return record['value'] === false && label !== null ? [`Belge gecikmesi: ${label}`] : []
    })

  return [...imageIssues, ...renderBlocking, ...latencyChecks]
}

/**
 * Lighthouse `lhr` → TechAudit + web-vitals attribution.
 *
 * Aynı fonksiyon hem lokal Lighthouse hem PageSpeed Insights için kullanılır;
 * PSI yanıtındaki `lighthouseResult` alanı birebir aynı şemadır.
 *
 * INP burada 0 bırakılır: lab ortamı INP ölçemez (gerçek etkileşim gerekir).
 * `attribution.inp` null kaldığı için teşhis motoru INP'yi hiç değerlendirmez —
 * TBT'yi INP diye raporlamak yanıltıcı olurdu.
 */
export const lighthouseResultToTechAudit = (
  raw: unknown,
  providerName: string,
): Result<TechAudit, ProviderError> => {
  const parsed = LighthouseResultSchema.safeParse(raw)
  if (!parsed.success) {
    return err(
      new ProviderError(providerName, `Lighthouse yanıtı beklenen şemaya uymuyor: ${summarizeZodError(parsed.error.issues)}`),
    )
  }

  const result = parsed.data
  const audits = result.audits
  const lcpMs = auditNumber(audits, 'largest-contentful-paint')
  const cls = auditNumber(audits, 'cumulative-layout-shift')

  if (lcpMs === null || cls === null) {
    return err(
      new ProviderError(
        providerName,
        `Çekirdek metrikler eksik (LCP: ${lcpMs}, CLS: ${cls}) — denetim güvenilir değil, boş veriyle devam edilmiyor.`,
      ),
    )
  }

  const score = result.categories.performance.score
  const attribution: CwvAttribution = {
    source: 'lab',
    lcp: extractLcpAttribution(audits),
    inp: null,
    cls: extractClsAttribution(audits),
    ttfb: null,
  }

  const seoScore = result.categories.seo?.score ?? null
  const url = result.finalDisplayedUrl ?? result.requestedUrl ?? ''

  return ok({
    url,
    lcpMs,
    inpMs: 0,
    cls,
    performanceScore: score === null ? 0 : Math.round(score * 100),
    issues: extractIssues(audits),
    attribution,
    seoScore: seoScore === null ? null : Math.round(seoScore * 100),
    seoFindings: extractSeoFindings(audits, url),
  })
}
