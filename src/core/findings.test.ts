import { describe, expect, test } from 'vitest'
import { dedupeWidespreadFindings, estimateImpact, sortFindings, withMockFlag, type Finding } from './findings.js'

const makeFinding = (overrides: Partial<Finding> = {}): Finding => ({
  category: 'onpage',
  severity: 'critical',
  url: 'https://ornek.com/',
  culpritSelector: null,
  title: '<title> etiketi eksik',
  explanation: 'test açıklaması',
  evidence: 'test kanıtı',
  impact: 70,
  effort: 'trivial',
  fixSnippet: null,
  ...overrides,
})

describe('sortFindings', () => {
  test('ciddiyete göre sıralar: critical > high > medium > low', () => {
    const findings = [
      makeFinding({ severity: 'low', title: 'a' }),
      makeFinding({ severity: 'critical', title: 'b' }),
      makeFinding({ severity: 'medium', title: 'c' }),
      makeFinding({ severity: 'high', title: 'd' }),
    ]
    expect(sortFindings(findings).map((f) => f.title)).toEqual(['b', 'd', 'c', 'a'])
  })

  test('eşit ciddiyette phaseShare büyükten küçüğe sıralanır', () => {
    const findings = [
      makeFinding({ title: 'a', phaseShare: 0.2 }),
      makeFinding({ title: 'b', phaseShare: 0.8 }),
    ]
    expect(sortFindings(findings).map((f) => f.title)).toEqual(['b', 'a'])
  })

  test('orijinal diziyi mutasyona uğratmaz', () => {
    const findings = [makeFinding({ severity: 'low' }), makeFinding({ severity: 'critical' })]
    const original = [...findings]
    sortFindings(findings)
    expect(findings).toEqual(original)
  })
})

describe('estimateImpact', () => {
  test('phaseShare yoksa yalnız ciddiyet tabanını döner', () => {
    expect(estimateImpact('critical')).toBe(70)
    expect(estimateImpact('high')).toBe(45)
    expect(estimateImpact('medium')).toBe(25)
    expect(estimateImpact('low')).toBe(10)
  })

  test('phaseShare varsa bonus ekler, 100\'ü aşmaz', () => {
    expect(estimateImpact('high', 0.5)).toBe(60)
    expect(estimateImpact('critical', 1)).toBe(100)
  })
})

describe('withMockFlag', () => {
  test('isMock:false iken yeni obje üretmez (no-op)', () => {
    const findings = [makeFinding()]
    expect(withMockFlag(findings, false)).toBe(findings)
  })

  test('isMock:true iken her bulguyu damgalar', () => {
    const findings = [makeFinding(), makeFinding({ title: 'ikinci' })]
    const result = withMockFlag(findings, true)
    expect(result.every((f) => f.isMock === true)).toBe(true)
  })
})

// Dış denetim bulgusu (2026-08-31, ORTA 7) — canlı bir koşuda (300 sayfa) aynı şablon hatası
// onlarca sayfada TAM METNİYLE tekrarlanıp 3.5 MB'lık kullanılamaz bir rapor + yönetici
// özetinde 5 URL varyantı üretti. Hem crawlSection.ts hem ruleSynthesizer.ts bu fonksiyonu
// paylaşır — tek yerden test edilir.
describe('dedupeWidespreadFindings', () => {
  test('eşiği (3) AŞMAYAN grup dokunulmadan kalır', () => {
    const findings = [makeFinding({ url: 'https://ornek.com/a' }), makeFinding({ url: 'https://ornek.com/b' })]
    expect(dedupeWidespreadFindings(findings)).toEqual(findings)
  })

  test('eşiği AŞAN grup tek bulguya toplanır, url:null olur', () => {
    const findings = Array.from({ length: 6 }, (_, i) => makeFinding({ url: `https://ornek.com/sayfa-${i + 1}` }))
    const result = dedupeWidespreadFindings(findings)
    expect(result).toHaveLength(1)
    expect(result[0]?.url).toBeNull()
  })

  test('toplanmış bulgunun evidence\'ı sayı + ilk 5 URL + kalan sayıyı içerir', () => {
    const findings = Array.from({ length: 7 }, (_, i) => makeFinding({ url: `https://ornek.com/sayfa-${i + 1}` }))
    const result = dedupeWidespreadFindings(findings)
    expect(result[0]?.evidence).toContain('7 sayfada tespit edildi')
    expect(result[0]?.evidence).toContain('sayfa-1')
    expect(result[0]?.evidence).toContain('sayfa-5')
    expect(result[0]?.evidence).not.toContain('sayfa-6')
    expect(result[0]?.evidence).toContain('(+2 daha)')
  })

  test('farklı (category, title) şablonları ayrı gruplanır', () => {
    const groupA = Array.from({ length: 4 }, (_, i) => makeFinding({ title: 'A', url: `https://ornek.com/a-${i}` }))
    const groupB = Array.from({ length: 4 }, (_, i) => makeFinding({ title: 'B', url: `https://ornek.com/b-${i}` }))
    const result = dedupeWidespreadFindings([...groupA, ...groupB])
    expect(result).toHaveLength(2)
  })

  test('içinde zaten url:null olan bir bulgu varsa grup toplanmaz (savunmacı)', () => {
    const findings = [
      ...Array.from({ length: 5 }, (_, i) => makeFinding({ url: `https://ornek.com/sayfa-${i + 1}` })),
      makeFinding({ url: null }),
    ]
    expect(dedupeWidespreadFindings(findings)).toHaveLength(6)
  })

  test('boş diziyi boş döner', () => {
    expect(dedupeWidespreadFindings([])).toEqual([])
  })
})
