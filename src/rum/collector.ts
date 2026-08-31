import { createServer, type IncomingMessage, type Server } from 'node:http'
import { createLogger } from '../core/logger.js'
import type { Db } from '../storage/db.js'
import { insertRumSamples, RumPayloadSchema } from './rumRepository.js'

const logger = createLogger('rum')

/** Tarayıcıdan gelen yükün üst sınırı — sınırsız gövde okumak açık bir DoS yüzeyidir. */
const MAX_BODY_BYTES = 64 * 1024

/**
 * Dış denetim bulgusu (2026-08-31) — bu endpoint kimliksiz, herkese açık ve oran
 * sınırsızdı; `rum.ts` `allowOrigin: '*'`yi sabit geçiriyordu. Bir "paylaşılan sır" bu
 * endpoint için YANLIŞ araç: kod tarayıcıda çalışan bir snippet'e gömülür, sayfa
 * kaynağını görebilen HERKES sırrı da görür — gerçek bir kimlik doğrulaması olmaz.
 * Doğru sınır: (1) origin allowlist — yalnız müşterinin KENDİ site(leri) CORS ile
 * yanıtı okuyabilir VE sunucu tarafında da 403 ile reddedilir (yalnız CORS başlığı
 * değil), (2) IP başına basit bir bellek-içi oran sınırı.
 */
const RATE_LIMIT_WINDOW_MS = 60_000
/** Bir sayfa görüntülemesi başına birden fazla metrik (LCP/CLS/INP/TTFB) beacon'ı gidebilir — cömert bir üst sınır. */
const RATE_LIMIT_MAX_REQUESTS_PER_WINDOW = 120

const readBody = async (
  stream: AsyncIterable<Buffer>,
): Promise<{ readonly ok: true; readonly body: string } | { readonly ok: false; readonly reason: string }> => {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of stream) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) return { ok: false, reason: 'Gövde çok büyük' }
    chunks.push(chunk)
  }
  return { ok: true, body: Buffer.concat(chunks).toString('utf-8') }
}

/**
 * IP başına sabit-pencereli oran sınırı — tek süreçli, self-host bir araç için yeterli.
 * Not: Map süresiz büyüyebilir (görülen her IP kalıcı bir giriş tutar) — bu aracın
 * "geliştirme/self-host toplayıcı" konumuyla tutarlı bilinçli bir basitleştirme; gerçek
 * bir üretim ölçeğinde (çok sayıda benzersiz IP) Redis tabanlı bir çözüme geçilmeli.
 */
const createRateLimiter = () => {
  const hits = new Map<string, { count: number; windowStart: number }>()
  return (key: string): boolean => {
    const now = Date.now()
    const entry = hits.get(key)
    if (entry === undefined || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      hits.set(key, { count: 1, windowStart: now })
      return true
    }
    entry.count += 1
    return entry.count <= RATE_LIMIT_MAX_REQUESTS_PER_WINDOW
  }
}

const clientKey = (request: IncomingMessage): string => request.socket.remoteAddress ?? 'bilinmeyen'

export interface CollectorOptions {
  readonly port: number
  /**
   * İzin verilen origin'ler (ör. ["https://ornek.com", "https://www.ornek.com"]).
   * BOŞ dizi = geliştirme modu: kısıtlama yok, her origin kabul edilir ('*' davranışı).
   * Doluysa hem CORS başlığı hem de sunucu-taraflı kabul/red BU listeye göre çalışır —
   * yalnızca tarayıcıyı değil, curl/script gibi CORS'a uymayan istemcileri de sınırlar.
   */
  readonly allowedOrigins: readonly string[]
}

/**
 * web-vitals snippet'inin gönderdiği beacon'ları toplayan minimal endpoint.
 *
 * Bu bir geliştirme/self-host toplayıcısıdır — üretimde kendi uygulamanın içine rota
 * olarak koymak (ör. Next.js /api/rum) daha doğrudur. `allowedOrigins` boş bırakılmadığı
 * sürece hem origin allowlist hem IP başına oran sınırı uygulanır.
 */
export const createRumCollector = (db: Db, options: CollectorOptions): Server => {
  const isRateLimited = createRateLimiter()

  return createServer((request, response) => {
    const requestOrigin = request.headers.origin
    const isOriginAllowed = options.allowedOrigins.length === 0 || (requestOrigin !== undefined && options.allowedOrigins.includes(requestOrigin))

    if (!isOriginAllowed) {
      response.writeHead(403).end('İzin verilmeyen origin')
      return
    }

    const cors = {
      'Access-Control-Allow-Origin': options.allowedOrigins.length === 0 ? '*' : (requestOrigin as string),
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    }

    if (request.method === 'OPTIONS') {
      response.writeHead(204, cors).end()
      return
    }
    if (request.method !== 'POST') {
      response.writeHead(405, cors).end('Yalnız POST')
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

      try {
        const parsed = RumPayloadSchema.safeParse(JSON.parse(read.body))
        if (!parsed.success) {
          // Geçersiz yükü sessizce yutmuyoruz: 400 döndürüp logluyoruz ki
          // snippet ile şema arasındaki uyumsuzluk fark edilsin.
          logger.warn(`Geçersiz RUM yükü reddedildi: ${parsed.error.issues[0]?.message ?? 'bilinmeyen'}`)
          response.writeHead(400, cors).end('Geçersiz yük')
          return
        }
        insertRumSamples(db, parsed.data)
        response.writeHead(204, cors).end()
      } catch (error) {
        logger.error('RUM örneği işlenemedi', error)
        response.writeHead(500, cors).end('Sunucu hatası')
      }
    })()
  })
}
