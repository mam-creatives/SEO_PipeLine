import { describe, expect, test } from 'vitest'
import { diagnoseCwv } from '../../analysis/cwv/diagnose.js'
import { AIZHO_LIGHTHOUSE_RESULT } from './fixtures/aizhoLighthouse.js'
import { lighthouseResultToTechAudit } from './lighthouseAdapter.js'

const PROVIDER = 'test'

const parseFixture = () => {
  const result = lighthouseResultToTechAudit(AIZHO_LIGHTHOUSE_RESULT, PROVIDER)
  if (!result.ok) throw new Error(`Fixture ayrıştırılamadı: ${result.error.message}`)
  return result.value
}

describe('lighthouseResultToTechAudit — gerçek Lighthouse 13 çıktısı', () => {
  test('çekirdek metrikler ve yönlendirme sonrası URL okunur', () => {
    const audit = parseFixture()
    expect(audit.url).toBe('https://aizho.me/vibes')
    expect(audit.lcpMs).toBeCloseTo(5966.246)
    expect(audit.cls).toBe(0)
    expect(audit.performanceScore).toBe(70)
  })

  test('LCP faz kırılımı ve suçlu element seçicisi çıkarılır', () => {
    const lcp = parseFixture().attribution?.lcp
    expect(lcp?.target).toBe('div.flex > div.flex > span.flex > span.px-5')
    expect(lcp?.timeToFirstByte).toBeCloseTo(334.931)
    expect(lcp?.elementRenderDelay).toBeCloseTo(2072.65)
  })

  test('metin LCP: kaynak fazları yok, url null kalır', () => {
    const lcp = parseFixture().attribution?.lcp
    expect(lcp?.url).toBeNull()
    expect(lcp?.resourceLoadDelay).toBe(0)
    expect(lcp?.resourceLoadDuration).toBe(0)
  })

  test('lab kaynağı INP üretmez — TBT, INP diye raporlanmaz', () => {
    const audit = parseFixture()
    expect(audit.attribution?.source).toBe('lab')
    expect(audit.attribution?.inp).toBeNull()
    expect(audit.inpMs).toBe(0)
  })

  test('kayma yoksa CLS attribution null olur', () => {
    expect(parseFixture().attribution?.cls).toBeNull()
  })

  test('insight audit satırları okunabilir sorun listesine çevrilir', () => {
    const issues = parseFixture().issues.join('\n')
    expect(issues).toContain('Optimize edilmemiş görsel')
    expect(issues).toContain('681f31a1')
    expect(issues).toContain('Render engelleyen kaynak')
    expect(issues).toContain('Had redirects')
    // Geçen kontroller sorun olarak listelenmemeli
    expect(issues).not.toContain('Applies text compression')
  })

  test('gerçek ölçüm doğru teşhise götürür: baskın faz elementRenderDelay', () => {
    const diagnosis = diagnoseCwv(parseFixture())
    expect(diagnosis?.ratings.LCP).toBe('poor')
    const renderDelay = diagnosis?.findings.find((finding) => finding.phase === 'elementRenderDelay')
    expect(renderDelay).toBeDefined()
    expect(renderDelay?.severity).toBe('critical')
    // 2072.65 / (334.931 + 2072.65) ≈ 0.86
    expect(renderDelay?.phaseShare).toBeCloseTo(0.86, 1)
    expect(renderDelay?.culpritSelector).toBe('div.flex > div.flex > span.flex > span.px-5')
  })
})

describe('lighthouseResultToTechAudit — hata durumları', () => {
  test('şemaya uymayan girdi hata döner, sessizce boş denetim üretmez', () => {
    const result = lighthouseResultToTechAudit({ nonsense: true }, PROVIDER)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('şemaya uymuyor')
  })

  test('çekirdek metrik eksikse hata döner', () => {
    const result = lighthouseResultToTechAudit(
      { categories: { performance: { score: 0.9 } }, audits: {} },
      PROVIDER,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('Çekirdek metrikler eksik')
  })

  test('insight audit yoksa attribution null kalır ama denetim yine üretilir', () => {
    const result = lighthouseResultToTechAudit(
      {
        categories: { performance: { score: 0.9 } },
        audits: {
          'largest-contentful-paint': { numericValue: 1800 },
          'cumulative-layout-shift': { numericValue: 0.02 },
        },
      },
      PROVIDER,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.attribution?.lcp).toBeNull()
      expect(result.value.issues).toEqual([])
      expect(diagnoseCwv(result.value)?.findings).toEqual([])
    }
  })
})
