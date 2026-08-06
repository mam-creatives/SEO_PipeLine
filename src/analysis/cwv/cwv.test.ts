import { describe, expect, test } from 'vitest'
import {
  dominantTtfbPhase,
  lcpPhaseShares,
  rateMetric,
  type ClsAttribution,
  type CwvAttribution,
  type InpAttribution,
  type LcpAttribution,
} from '../../core/cwv.js'
import type { TechAudit } from '../../core/types.js'
import { diagnoseCls } from './clsRules.js'
import { diagnoseCwv } from './diagnose.js'
import { diagnoseInp } from './inpRules.js'
import { diagnoseLcp } from './lcpRules.js'
import { sortFindings, type CwvFinding } from './types.js'

const lcp = (overrides: Partial<LcpAttribution> = {}): LcpAttribution => ({
  target: 'h1 > span',
  url: null,
  timeToFirstByte: 0,
  resourceLoadDelay: 0,
  resourceLoadDuration: 0,
  elementRenderDelay: 0,
  ...overrides,
})

const inp = (overrides: Partial<InpAttribution> = {}): InpAttribution => ({
  interactionTarget: 'button.cta',
  interactionType: 'pointer',
  inputDelay: 0,
  processingDuration: 0,
  presentationDelay: 0,
  longestScriptUrl: null,
  longestScriptDuration: null,
  ...overrides,
})

const cls = (overrides: Partial<ClsAttribution> = {}): ClsAttribution => ({
  largestShiftTarget: 'div.hero',
  largestShiftValue: 0.18,
  largestShiftTime: 900,
  loadState: 'loading',
  ...overrides,
})

const audit = (overrides: Partial<TechAudit> = {}): TechAudit => ({
  url: 'https://ornek.tr/',
  lcpMs: 3900,
  inpMs: 260,
  cls: 0.18,
  performanceScore: 54,
  issues: [],
  ...overrides,
})

const attribution = (overrides: Partial<CwvAttribution> = {}): CwvAttribution => ({
  source: 'lab',
  lcp: null,
  inp: null,
  cls: null,
  ttfb: null,
  ...overrides,
})

const phases = (findings: readonly CwvFinding[]): readonly string[] => findings.map((finding) => finding.phase)

describe('rateMetric — bant sınırları', () => {
  test('LCP: 2500 dahil good, 2501 needs-improvement, 4000 dahil needs-improvement, 4001 poor', () => {
    expect(rateMetric('LCP', 2500)).toBe('good')
    expect(rateMetric('LCP', 2501)).toBe('needs-improvement')
    expect(rateMetric('LCP', 4000)).toBe('needs-improvement')
    expect(rateMetric('LCP', 4001)).toBe('poor')
  })

  test('CLS: 0.1 dahil good, 0.25 dahil needs-improvement, üstü poor', () => {
    expect(rateMetric('CLS', 0.1)).toBe('good')
    expect(rateMetric('CLS', 0.25)).toBe('needs-improvement')
    expect(rateMetric('CLS', 0.26)).toBe('poor')
  })

  test('INP ve TTFB kendi eşiklerini kullanır', () => {
    expect(rateMetric('INP', 200)).toBe('good')
    expect(rateMetric('INP', 501)).toBe('poor')
    expect(rateMetric('TTFB', 800)).toBe('good')
    expect(rateMetric('TTFB', 1801)).toBe('poor')
  })
})

describe('lcpPhaseShares', () => {
  test('paylar 1.0 toplar', () => {
    const shares = lcpPhaseShares(
      lcp({ timeToFirstByte: 500, resourceLoadDelay: 250, resourceLoadDuration: 200, elementRenderDelay: 50 }),
    )
    const total =
      shares.timeToFirstByte + shares.resourceLoadDelay + shares.resourceLoadDuration + shares.elementRenderDelay
    expect(total).toBeCloseTo(1)
    expect(shares.timeToFirstByte).toBeCloseTo(0.5)
  })

  test('tüm fazlar 0 ise (bozuk veri) paylar 0 olur, NaN üretmez', () => {
    const shares = lcpPhaseShares(lcp())
    expect(shares.timeToFirstByte).toBe(0)
    expect(Number.isNaN(shares.elementRenderDelay)).toBe(false)
  })
})

describe('diagnoseLcp — faz bütçeleri', () => {
  test('TTFB tam %40 iken bulgu YOK, %50 iken bulgu VAR (sınır kapsayıcı değil)', () => {
    const atBudget = diagnoseLcp(3000, lcp({ timeToFirstByte: 400, resourceLoadDuration: 600 }), null)
    expect(phases(atBudget)).not.toContain('timeToFirstByte')

    const overBudget = diagnoseLcp(3000, lcp({ timeToFirstByte: 500, resourceLoadDuration: 500 }), null)
    expect(phases(overBudget)).toContain('timeToFirstByte')
  })

  test('metin LCP (url null) font preload önerir, görsel LCP fetchpriority önerir', () => {
    const textLcp = diagnoseLcp(3000, lcp({ resourceLoadDelay: 900, resourceLoadDuration: 100 }), null)
    const textFinding = textLcp.find((finding) => finding.phase === 'resourceLoadDelay')
    expect(textFinding?.title).toContain('web fontunu')
    expect(textFinding?.fixSnippet).toContain('rel="preload"')
    expect(textFinding?.fixSnippet).toContain('as="font"')

    const imageLcp = diagnoseLcp(
      3000,
      lcp({ url: 'https://ornek.tr/hero.jpg', resourceLoadDelay: 900, resourceLoadDuration: 100 }),
      null,
    )
    const imageFinding = imageLcp.find((finding) => finding.phase === 'resourceLoadDelay')
    expect(imageFinding?.title).toContain('görseli')
    expect(imageFinding?.fixSnippet).toContain('fetchpriority="high"')
    expect(imageFinding?.fixSnippet).toContain('hero.jpg')
  })

  test('ağır kaynak resourceLoadDuration bulgusu üretir ve modern format önerir', () => {
    const findings = diagnoseLcp(
      4200,
      lcp({ url: 'https://ornek.tr/x.jpg', resourceLoadDuration: 3800, timeToFirstByte: 400 }),
      null,
    )
    const finding = findings.find((item) => item.phase === 'resourceLoadDuration')
    expect(finding?.fixSnippet).toContain('image/avif')
    expect(finding?.severity).toBe('critical')
  })

  test('geç boyama elementRenderDelay bulgusu üretir ve animasyon tuzağını anlatır', () => {
    const findings = diagnoseLcp(3000, lcp({ elementRenderDelay: 900, timeToFirstByte: 100 }), null)
    const finding = findings.find((item) => item.phase === 'elementRenderDelay')
    expect(finding?.explanation).toContain('opaklık')
    expect(finding?.fixSnippet).toContain('prefers-reduced-motion')
  })

  test('TTFB attribution varsa baskın alt fazı isimlendirir', () => {
    const findings = diagnoseLcp(3000, lcp({ timeToFirstByte: 900, resourceLoadDuration: 100 }), {
      waitingDuration: 700,
      cacheDuration: 10,
      dnsDuration: 120,
      connectionDuration: 60,
      requestDuration: 10,
    })
    expect(findings.find((item) => item.phase === 'timeToFirstByte')?.explanation).toContain('backend')
  })

  test('boş attribution hiç bulgu üretmez — uydurma teşhis yok', () => {
    expect(diagnoseLcp(9000, lcp(), null)).toEqual([])
  })

  test('ciddiyet LCP değerinden gelir', () => {
    const heavy = lcp({ resourceLoadDuration: 900, timeToFirstByte: 100 })
    expect(diagnoseLcp(5000, heavy, null)[0]?.severity).toBe('critical')
    expect(diagnoseLcp(3000, heavy, null)[0]?.severity).toBe('high')
    expect(diagnoseLcp(2000, heavy, null)[0]?.severity).toBe('medium')
  })
})

describe('diagnoseInp', () => {
  test('baskın faz inputDelay ise ana thread bulgusu üretir', () => {
    const findings = diagnoseInp(400, inp({ inputDelay: 300, processingDuration: 50, presentationDelay: 50 }))
    expect(phases(findings)).toEqual(['inputDelay'])
    expect(findings[0]?.fixSnippet).toContain('scheduler.yield')
  })

  test('baskın faz processingDuration ise en uzun script adlandırılır', () => {
    const findings = diagnoseInp(
      400,
      inp({
        processingDuration: 320,
        inputDelay: 40,
        presentationDelay: 40,
        longestScriptUrl: 'https://t.example/tag.js',
        longestScriptDuration: 210,
      }),
    )
    expect(findings[0]?.explanation).toContain('https://t.example/tag.js')
    expect(findings[0]?.explanation).toContain('210ms')
  })

  test('hiçbir faz baskın değilse bulgu yok', () => {
    expect(diagnoseInp(300, inp({ inputDelay: 100, processingDuration: 100, presentationDelay: 100 }))).toEqual([])
  })
})

describe('diagnoseCls', () => {
  test('CLS iyi bandındaysa bulgu yok', () => {
    expect(diagnoseCls(0.05, cls())).toEqual([])
  })

  test('erken kayma yükleme bulgusu — boyut/font çözümü', () => {
    const findings = diagnoseCls(0.18, cls({ largestShiftTime: 900 }))
    expect(phases(findings)).toEqual(['loadShift'])
    expect(findings[0]?.fixSnippet).toContain('aspect-ratio')
  })

  test('geç kayma enjeksiyon bulgusu — yer ayırma çözümü', () => {
    const findings = diagnoseCls(0.3, cls({ largestShiftTime: 6000, largestShiftTarget: 'div.ad' }))
    expect(phases(findings)).toEqual(['lateShift'])
    expect(findings[0]?.severity).toBe('critical')
    expect(findings[0]?.fixSnippet).toContain('min-height')
  })
})

describe('diagnoseCwv', () => {
  test('attribution yoksa null döner', () => {
    expect(diagnoseCwv(audit())).toBeNull()
    expect(diagnoseCwv(audit({ attribution: null }))).toBeNull()
  })

  test('lab kaynağında INP değerlendirilmez (lab INP ölçemez)', () => {
    const diagnosis = diagnoseCwv(
      audit({
        attribution: attribution({ source: 'lab', lcp: lcp({ resourceLoadDuration: 900, timeToFirstByte: 100 }) }),
      }),
    )
    expect(diagnosis?.ratings.INP).toBeUndefined()
    expect(diagnosis?.ratings.LCP).toBe('needs-improvement')
    expect(phases(diagnosis?.findings ?? [])).not.toContain('inputDelay')
  })

  test('field kaynağında INP değerlendirilir', () => {
    const diagnosis = diagnoseCwv(
      audit({
        inpMs: 600,
        attribution: attribution({
          source: 'field',
          inp: inp({ inputDelay: 500, processingDuration: 50, presentationDelay: 50 }),
        }),
      }),
    )
    expect(diagnosis?.source).toBe('field')
    expect(diagnosis?.ratings.INP).toBe('poor')
    expect(phases(diagnosis?.findings ?? [])).toContain('inputDelay')
  })

  test('bulgular ciddiyete göre sıralanır — kritik CLS, orta LCP bulgusunun önüne geçer', () => {
    const diagnosis = diagnoseCwv(
      audit({
        lcpMs: 2000,
        cls: 0.4,
        attribution: attribution({
          lcp: lcp({ resourceLoadDuration: 900, timeToFirstByte: 100 }),
          cls: cls({ largestShiftTime: 6000 }),
        }),
      }),
    )
    expect(diagnosis?.findings[0]?.severity).toBe('critical')
    expect(diagnosis?.findings[0]?.metric).toBe('CLS')
  })

  test('TTFB derecesi LCP attribution içindeki timeToFirstByte alanından türetilir', () => {
    const diagnosis = diagnoseCwv(
      audit({ attribution: attribution({ lcp: lcp({ timeToFirstByte: 2000, resourceLoadDuration: 500 }) }) }),
    )
    expect(diagnosis?.ratings.TTFB).toBe('poor')
  })
})

describe('yardımcılar', () => {
  test('dominantTtfbPhase en uzun alt fazı seçer', () => {
    const dominant = dominantTtfbPhase({
      waitingDuration: 100,
      cacheDuration: 5,
      dnsDuration: 300,
      connectionDuration: 80,
      requestDuration: 20,
    })
    expect(dominant.phase).toBe('dnsDuration')
    expect(dominant.ms).toBe(300)
  })

  test('sortFindings girdiyi değiştirmez (immutability)', () => {
    const findings: CwvFinding[] = [
      { metric: 'LCP', severity: 'medium', phase: 'a', phaseShare: 0.2, culpritSelector: null, title: '', explanation: '', fixSnippet: null },
      { metric: 'CLS', severity: 'critical', phase: 'b', phaseShare: null, culpritSelector: null, title: '', explanation: '', fixSnippet: null },
    ]
    const sorted = sortFindings(findings)
    expect(sorted[0]?.phase).toBe('b')
    expect(findings[0]?.phase).toBe('a')
  })
})
