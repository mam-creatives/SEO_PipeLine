import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { openDatabase, type Db } from '../storage/db.js'
import { createRumCollector } from './collector.js'

const validSample = [
  { url: 'https://ornek.com/', metric: 'LCP' as const, value: 2100, rating: 'good' as const },
]

describe('createRumCollector', () => {
  let db: Db

  beforeEach(() => {
    db = openDatabase(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  /** Sunucuyu ephemeral bir portta başlatır, gerçek atanan port numarasını döner. */
  const startServer = (allowedOrigins: readonly string[]): { readonly baseUrl: string; readonly close: () => Promise<void> } => {
    const server = createRumCollector(db, { port: 0, allowedOrigins })
    server.listen(0)
    const port = (server.address() as AddressInfo).port
    return {
      baseUrl: `http://127.0.0.1:${port}`,
      close: () => new Promise((resolve) => server.close(() => resolve())),
    }
  }

  // Dış denetim bulgusu (2026-08-31) — allowedOrigins:['*'] yerine bu artık AÇIK bir dizi;
  // boş dizi = geliştirme modu (kısıtlama yok), doluysa hem CORS başlığı hem sunucu-taraflı
  // 403 reddi bu listeye göre çalışır.
  describe('origin allowlist', () => {
    test('boş allowedOrigins (geliştirme modu) — her origin kabul edilir, CORS \'*\' döner', async () => {
      const { baseUrl, close } = startServer([])
      try {
        const response = await fetch(`${baseUrl}/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'https://herhangi-bir-site.com' },
          body: JSON.stringify(validSample),
        })
        expect(response.status).toBe(204)
        expect(response.headers.get('access-control-allow-origin')).toBe('*')
      } finally {
        await close()
      }
    })

    test('allowlist doluyken izin verilen origin kabul edilir, CORS o origin\'i yansıtır', async () => {
      const { baseUrl, close } = startServer(['https://ornek.com'])
      try {
        const response = await fetch(`${baseUrl}/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'https://ornek.com' },
          body: JSON.stringify(validSample),
        })
        expect(response.status).toBe(204)
        expect(response.headers.get('access-control-allow-origin')).toBe('https://ornek.com')
      } finally {
        await close()
      }
    })

    test('allowlist doluyken izin verilmeyen origin 403 alır', async () => {
      const { baseUrl, close } = startServer(['https://ornek.com'])
      try {
        const response = await fetch(`${baseUrl}/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'https://kotu-niyetli-site.com' },
          body: JSON.stringify(validSample),
        })
        expect(response.status).toBe(403)
      } finally {
        await close()
      }
    })

    test('allowlist doluyken Origin başlığı hiç yoksa 403 alır', async () => {
      const { baseUrl, close } = startServer(['https://ornek.com'])
      try {
        const response = await fetch(`${baseUrl}/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validSample),
        })
        expect(response.status).toBe(403)
      } finally {
        await close()
      }
    })
  })

  test('OPTIONS preflight 204 + CORS başlıklarıyla yanıtlanır', async () => {
    const { baseUrl, close } = startServer([])
    try {
      const response = await fetch(`${baseUrl}/`, { method: 'OPTIONS' })
      expect(response.status).toBe(204)
      expect(response.headers.get('access-control-allow-methods')).toContain('POST')
    } finally {
      await close()
    }
  })

  test('GET gibi başka bir metot 405 alır', async () => {
    const { baseUrl, close } = startServer([])
    try {
      const response = await fetch(`${baseUrl}/`, { method: 'GET' })
      expect(response.status).toBe(405)
    } finally {
      await close()
    }
  })

  test('geçersiz yük 400 alır, veri yazılmaz', async () => {
    const { baseUrl, close } = startServer([])
    try {
      const response = await fetch(`${baseUrl}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ url: 'not-a-url', metric: 'LCP', value: -1, rating: 'good' }]),
      })
      expect(response.status).toBe(400)
      const count = db.prepare('SELECT COUNT(*) AS n FROM rum_samples').get() as { n: number }
      expect(count.n).toBe(0)
    } finally {
      await close()
    }
  })

  test('geçerli yük 204 alır, veri DB\'ye yazılır', async () => {
    const { baseUrl, close } = startServer([])
    try {
      const response = await fetch(`${baseUrl}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSample),
      })
      expect(response.status).toBe(204)
      const count = db.prepare('SELECT COUNT(*) AS n FROM rum_samples').get() as { n: number }
      expect(count.n).toBe(1)
    } finally {
      await close()
    }
  })

  test('64 KB\'ı aşan gövde 413 alır', async () => {
    const { baseUrl, close } = startServer([])
    try {
      const oversized = [{ url: 'https://ornek.com/', metric: 'LCP', value: 1, rating: 'good', attribution: 'x'.repeat(70_000) }]
      const response = await fetch(`${baseUrl}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(oversized),
      })
      expect(response.status).toBe(413)
    } finally {
      await close()
    }
  })

  // Dış denetim bulgusu (2026-08-31) — bu endpoint kimliksiz, herkese açık ve ORAN
  // SINIRSIZDI; birisi flood ederse DB'yi sonsuza dek büyütebilirdi.
  test('IP başına dakikada 120 isteği aşan istekler 429 alır', async () => {
    const { baseUrl, close } = startServer([])
    try {
      let lastStatus = 0
      for (let i = 0; i < 121; i += 1) {
        const response = await fetch(`${baseUrl}/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validSample),
        })
        lastStatus = response.status
      }
      expect(lastStatus).toBe(429)
    } finally {
      await close()
    }
  }, 20000)
})
