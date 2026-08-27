import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { runResearch } from './researchPipeline.js'

/**
 * Uçtan uca smoke test: tam mock pipeline'ı geçici dizinde iki kez çalıştırır.
 * Ortamdaki gerçek API anahtarları temizlenir ki test her makinede mock modda koşsun.
 */
const ENV_KEYS = [
  'SERPAPI_KEY',
  'DATAFORSEO_LOGIN',
  'DATAFORSEO_PASSWORD',
  'PAGESPEED_API_KEY',
  'GSC_CLIENT_EMAIL',
  'GSC_PRIVATE_KEY',
  'ANTHROPIC_API_KEY',
] as const

const SECTION_HEADERS = [
  '## Yönetici Özeti',
  '## Fırsatlar',
  '## Rakip Haritası',
  '## Küme Görünümü',
  '## Teknik Sorunlar',
  '## AI Görünürlüğü',
  '## Gerçek Arama Performansı',
  '## Son Çalıştırmadan Bu Yana Değişenler',
  // Teşhis bölümü bir kez sessizce düşmüştü (import vardı, kullanım yoktu ve
  // noUnusedLocals kapalı olduğu için typecheck yakalamadı) — bu satır nöbetçi.
  '### Core Web Vitals Teşhisi',
  // Mock GSC sağlayıcısı ilk sorgu için deterministik olarak iki sayfa üretir
  // (mockProviders.ts) — bu satır o bölümün sessizce boş kalmadığını doğrular.
  '### Sayfa Yamyamlığı',
  '### Gerçek Kullanıcı Verisi (CrUX)',
]

describe('runResearch (uçtan uca, mock mod)', () => {
  let scratchDir: string

  beforeAll(() => {
    scratchDir = mkdtempSync(join(tmpdir(), 'seo-pipeline-test-'))
    for (const key of ENV_KEYS) vi.stubEnv(key, '')
  })

  afterAll(() => {
    vi.unstubAllEnvs()
    rmSync(scratchDir, { recursive: true, force: true })
  })

  test('ilk çalıştırma: rapor üretilir, MOCK banner ve tüm bölümler var', async () => {
    const outcome = await runResearch({
      configPath: 'config/project.json',
      dbPath: join(scratchDir, 'seo.db'),
      reportsDir: join(scratchDir, 'reports'),
      envFilePath: join(scratchDir, 'yok.env'),
    })

    expect(outcome.mockCategories).toHaveLength(8)
    const markdown = readFileSync(outcome.markdownPath, 'utf-8')
    expect(markdown).toContain('MOCK MODE')
    for (const header of SECTION_HEADERS) {
      expect(markdown).toContain(header)
    }
    expect(markdown).toContain('İlk çalıştırma — karşılaştırma yok')

    // Teşhis yalnız başlık atmakla kalmamalı: suçlu element ve kopyalanabilir düzeltme de gelmeli
    expect(markdown).toContain('Suçlu element')
    expect(markdown).toContain('fetchpriority="high"')

    const html = readFileSync(outcome.htmlPath, 'utf-8')
    expect(html).toContain('MOCK MODE')
    expect(html).toContain('<title>')
    expect(html).toContain('cwv-card')
  }, 20000)

  test('ikinci çalıştırma: diff bölümü karşılaştırma yapar', async () => {
    const outcome = await runResearch({
      configPath: 'config/project.json',
      dbPath: join(scratchDir, 'seo.db'),
      reportsDir: join(scratchDir, 'reports'),
      envFilePath: join(scratchDir, 'yok.env'),
    })

    expect(outcome.runId).toBe(2)
    const markdown = readFileSync(outcome.markdownPath, 'utf-8')
    expect(markdown).toContain('Karşılaştırma: #1')
    expect(markdown).not.toContain('İlk çalıştırma — karşılaştırma yok')
  }, 20000)
})
