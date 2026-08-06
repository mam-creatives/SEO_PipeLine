import { createServer, type Server } from 'node:http'
import { createLogger } from '../core/logger.js'
import type { Db } from '../storage/db.js'
import { insertRumSamples, RumPayloadSchema } from './rumRepository.js'

const logger = createLogger('rum')

/** Tarayıcıdan gelen yükün üst sınırı — sınırsız gövde okumak açık bir DoS yüzeyidir. */
const MAX_BODY_BYTES = 64 * 1024

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

export interface CollectorOptions {
  readonly port: number
  /** Tarayıcı isteği başka kaynaktan gelirse CORS gerekir; '*' yalnız geliştirme içindir. */
  readonly allowOrigin: string
}

/**
 * web-vitals snippet'inin gönderdiği beacon'ları toplayan minimal endpoint.
 *
 * Bu bir geliştirme/self-host toplayıcısıdır: kimlik doğrulama yoktur, herkes örnek
 * gönderebilir. Üretimde kendi uygulamanın içine rota olarak koymak (ör. Next.js
 * /api/rum) ve oran sınırlaması eklemek daha doğrudur.
 */
export const createRumCollector = (db: Db, options: CollectorOptions): Server =>
  createServer((request, response) => {
    const cors = {
      'Access-Control-Allow-Origin': options.allowOrigin,
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
