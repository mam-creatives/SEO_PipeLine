import Database from 'better-sqlite3'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
  // Mock crawl sağlayıcısı müşteri anasayfasını bilinçli kusurlu üretir (title/h1/schema
  // yok) — bu satır o bölümün sessizce boş kalmadığını doğrular (Faz 1.3'teki dersle aynı).
  '### Site Denetimi (Crawler)',
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

    expect(outcome.mockCategories).toHaveLength(9)
    const markdown = readFileSync(outcome.markdownPath, 'utf-8')
    expect(markdown).toContain('MOCK MODE')
    for (const header of SECTION_HEADERS) {
      expect(markdown).toContain(header)
    }
    expect(markdown).toContain('İlk çalıştırma — karşılaştırma yok')

    // Teşhis yalnız başlık atmakla kalmamalı: suçlu element ve kopyalanabilir düzeltme de gelmeli
    expect(markdown).toContain('Suçlu element')
    expect(markdown).toContain('fetchpriority="high"')

    // Crawler bölümü de boş kalmamalı: mock müşteri anasayfasını title/h1'siz üretiyor
    expect(markdown).toContain('<title> etiketi eksik')
    expect(markdown).toContain('hiç <h1> yok')

    const html = readFileSync(outcome.htmlPath, 'utf-8')
    expect(html).toContain('MOCK MODE')
    expect(html).toContain('<title>')
    expect(html).toContain('cwv-card')

    // Regresyon nöbetçisi: collectFieldCwv veri üretiyor ama insertFieldCwv çağrılmazsa
    // (Faz 1.4'te fiilen olan hata) rapor yine de dolu görünür çünkü o run'ın KENDİ
    // collected verisinden render edilir — bug yalnız DB round-trip'inde görünür.
    const db = new Database(join(scratchDir, 'seo.db'), { readonly: true })
    try {
      const row = db.prepare('SELECT COUNT(*) AS n FROM field_cwv WHERE runId = 1').get() as { n: number }
      expect(row.n).toBeGreaterThan(0)
    } finally {
      db.close()
    }
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

  test('codePath yapılandırılmışsa Kod Denetimi bölümü dolu gelir (Faz 3)', async () => {
    // Faz 1.3/2.11'deki dersle aynı: sağlayıcı/dosya kategorisi mock modda hiç tetiklenmezse
    // rapor bölümü sessizce boş kalabilir. config/project.json'daki gerçek codePath'i
    // kullanmak yerine (taşınabilirlik: bu path yalnız bu makinede var) kendi kusurlu
    // fixture'ını üretip ayrı bir config dosyasıyla çalıştırıyoruz.
    const codeDir = join(scratchDir, 'kod-fixture')
    mkdirSync(codeDir, { recursive: true })
    writeFileSync(codeDir + '/.htaccess', 'RewriteEngine On')
    writeFileSync(
      codeDir + '/index.php',
      [
        '<head>',
        '<meta name="robots" content="all" />',
        '<meta name="robots" content="index, follow" />',
        '<meta name="googlebot" content="all" />',
        '</head>',
      ].join('\n'),
    )

    const configPath = join(scratchDir, 'kod-project.json')
    writeFileSync(
      configPath,
      JSON.stringify({
        domain: 'kod-ornek.com',
        brandName: 'Kod Örnek',
        brandTokens: ['kod ornek'],
        seedKeywords: ['örnek keyword'],
        codePath: codeDir,
      }),
    )

    const codeScratchDir = mkdtempSync(join(tmpdir(), 'seo-pipeline-code-test-'))
    try {
      const outcome = await runResearch({
        configPath,
        dbPath: join(codeScratchDir, 'seo.db'),
        reportsDir: join(codeScratchDir, 'reports'),
        envFilePath: join(codeScratchDir, 'yok.env'),
      })
      const markdown = readFileSync(outcome.markdownPath, 'utf-8')
      expect(markdown).toContain('### Kod Denetimi')
      expect(markdown).toContain('çakışan/yinelenen robots direktifi')
      expect(markdown).toContain('index.php')
    } finally {
      rmSync(codeScratchDir, { recursive: true, force: true })
    }
  }, 20000)
})
