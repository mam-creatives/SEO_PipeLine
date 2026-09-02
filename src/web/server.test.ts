import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, test } from 'vitest'
import { createWebServer } from './server.js'

/** Sunucuyu ephemeral bir portta başlatır, gerçek atanan port numarasını döner — rum/collector.test.ts ile aynı desen. */
const startServer = (allowedOrigins: readonly string[]): { readonly baseUrl: string; readonly close: () => Promise<void> } => {
  const server = createWebServer({ allowedOrigins, env: {}, serpBudget: null })
  server.listen(0)
  const port = (server.address() as AddressInfo).port
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

let close: (() => Promise<void>) | null = null

afterEach(async () => {
  if (close !== null) await close()
  close = null
})

describe('createWebServer', () => {
  test('GET / statik formu 200 ile döner', async () => {
    const server = startServer([])
    close = server.close
    const response = await fetch(`${server.baseUrl}/`)
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('<form')
  })

  test('OPTIONS preflight 204 + CORS başlıklarıyla yanıtlanır', async () => {
    const server = startServer([])
    close = server.close
    const response = await fetch(`${server.baseUrl}/api/analyze`, { method: 'OPTIONS' })
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-methods')).toContain('POST')
  })

  test('bilinmeyen bir yol 404 alır', async () => {
    const server = startServer([])
    close = server.close
    const response = await fetch(`${server.baseUrl}/bilinmeyen`)
    expect(response.status).toBe(404)
  })

  // Dış denetim bulgusu (2026-09-02, Versiyon A) — kamuya açık bir formda origin allowlist
  // yalnız CORS başlığı DEĞİL, sunucu-taraflı 403 ile de uygulanmalı (rum/collector.ts'teki
  // aynı gerekçe: CORS'a uymayan istemcileri de sınırlar).
  describe('origin allowlist', () => {
    test('allowlist doluyken izin verilmeyen origin 403 alır', async () => {
      const server = startServer(['https://ornek.com'])
      close = server.close
      const response = await fetch(`${server.baseUrl}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://kotu-niyetli-site.com' },
        body: JSON.stringify({ domain: 'ornek.com', geoQuestions: ['Soru?'] }),
      })
      expect(response.status).toBe(403)
    })

    test('allowlist doluyken Origin başlığı hiç yoksa 403 alır', async () => {
      const server = startServer(['https://ornek.com'])
      close = server.close
      const response = await fetch(`${server.baseUrl}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: 'ornek.com', geoQuestions: ['Soru?'] }),
      })
      expect(response.status).toBe(403)
    })
  })

  describe('istek doğrulama', () => {
    test('geçersiz domain formatı 400 alır', async () => {
      const server = startServer([])
      close = server.close
      const response = await fetch(`${server.baseUrl}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: 'https://ornek.com', geoQuestions: ['Soru?'] }),
      })
      expect(response.status).toBe(400)
    })

    test('geoQuestions boşsa 400 alır', async () => {
      const server = startServer([])
      close = server.close
      const response = await fetch(`${server.baseUrl}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: 'ornek.com', geoQuestions: [] }),
      })
      expect(response.status).toBe(400)
    })

    test('geoQuestions 5\'ten fazlaysa 400 alır', async () => {
      const server = startServer([])
      close = server.close
      const response = await fetch(`${server.baseUrl}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: 'ornek.com', geoQuestions: ['1', '2', '3', '4', '5', '6'] }),
      })
      expect(response.status).toBe(400)
    })

    test('geçersiz JSON gövdesi 400 alır', async () => {
      const server = startServer([])
      close = server.close
      const response = await fetch(`${server.baseUrl}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'bu json değil {{{',
      })
      expect(response.status).toBe(400)
    })

    test('64 KB\'ı aşan gövde 413 alır', async () => {
      const server = startServer([])
      close = server.close
      const response = await fetch(`${server.baseUrl}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: 'ornek.com', geoQuestions: ['x'.repeat(20_000)] }),
      })
      expect(response.status).toBe(413)
    })
  })

  // Dış denetim bulgusu (2026-09-02) — kamuya açık bir uç nokta kimliksizdir; oran
  // sınırı olmadan bir kötüye kullanıcı sınırsız Lighthouse/Gemini/SerpApi çağrısı tetikleyebilir.
  test('IP başına dakikada 3 isteği aşan istekler 429 alır', async () => {
    const server = startServer([])
    close = server.close
    let lastStatus = 0
    for (let i = 0; i < 4; i += 1) {
      const response = await fetch(`${server.baseUrl}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: 'ornek.com', geoQuestions: [] }), // bilerek geçersiz — rate limit body doğrulamasından ÖNCE çalışmalı
      })
      lastStatus = response.status
    }
    expect(lastStatus).toBe(429)
  })
})
