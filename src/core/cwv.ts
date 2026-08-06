/**
 * GoogleChrome/web-vitals "attribution build" (v5) veri modeli.
 *
 * Alan adları kütüphaneyle BİREBİR aynı tutulur, çünkü iki ayrı kaynak bu tek şemayı doldurur:
 *  - field (RUM): sayfaya gömülen web-vitals/attribution snippet'i, gerçek kullanıcılardan
 *  - lab: Lighthouse / PageSpeed Insights — aynı 4 LCP fazını üretir
 *
 * Eşikler kütüphanenin LCPThresholds / INPThresholds / CLSThresholds sabitleriyle aynıdır.
 */

export type CwvMetricName = 'LCP' | 'INP' | 'CLS' | 'TTFB'

export type CwvRating = 'good' | 'needs-improvement' | 'poor'

/** Verinin gerçek kullanıcıdan mı laboratuvardan mı geldiği — yorumu değiştirir (lab INP ölçemez). */
export type CwvSource = 'lab' | 'field'

/** web-vitals: LCPAttribution */
export interface LcpAttribution {
  /** Suçlu elementin CSS seçicisi */
  readonly target: string | null
  /** LCP bir görselse kaynağın URL'i; metin LCP'de null olur (kaynak web fontudur) */
  readonly url: string | null
  readonly timeToFirstByte: number
  readonly resourceLoadDelay: number
  readonly resourceLoadDuration: number
  readonly elementRenderDelay: number
}

/** web-vitals: INPAttribution */
export interface InpAttribution {
  readonly interactionTarget: string | null
  readonly interactionType: 'pointer' | 'keyboard' | null
  readonly inputDelay: number
  readonly processingDuration: number
  readonly presentationDelay: number
  /** longestScript özetinden: en uzun süren script'in kaynağı */
  readonly longestScriptUrl: string | null
  readonly longestScriptDuration: number | null
}

/** web-vitals: CLSAttribution */
export interface ClsAttribution {
  readonly largestShiftTarget: string | null
  readonly largestShiftValue: number
  /** Sayfa başlangıcından itibaren ms — erken kayma yükleme, geç kayma enjeksiyon kaynaklıdır */
  readonly largestShiftTime: number
  readonly loadState: string | null
}

/** web-vitals: TTFBAttribution — TTFB baskınsa hangi alt fazın suçlu olduğunu söyler */
export interface TtfbAttribution {
  readonly waitingDuration: number
  readonly cacheDuration: number
  readonly dnsDuration: number
  readonly connectionDuration: number
  readonly requestDuration: number
}

/** tech_audits.attribution sütununa JSON olarak yazılan birleşik yapı */
export interface CwvAttribution {
  readonly source: CwvSource
  readonly lcp: LcpAttribution | null
  readonly inp: InpAttribution | null
  readonly cls: ClsAttribution | null
  readonly ttfb: TtfbAttribution | null
}

/**
 * web-vitals resmi eşikleri: value <= good → 'good', value <= poor → 'needs-improvement',
 * üstü → 'poor'. TTFB eşikleri web.dev'in TTFB rehberinden.
 */
export const CWV_RATING_THRESHOLDS: Readonly<
  Record<CwvMetricName, { readonly good: number; readonly poor: number }>
> = {
  LCP: { good: 2500, poor: 4000 },
  INP: { good: 200, poor: 500 },
  CLS: { good: 0.1, poor: 0.25 },
  TTFB: { good: 800, poor: 1800 },
}

/**
 * web.dev "Optimize LCP" faz bütçeleri: LCP süresinin çoğunluğu belgeyi ve
 * LCP kaynağını indirmeye gitmeli; keşif ve boyama gecikmeleri minimal olmalı.
 */
export const LCP_PHASE_BUDGETS = {
  timeToFirstByte: 0.4,
  resourceLoadDelay: 0.1,
  resourceLoadDuration: 0.4,
  elementRenderDelay: 0.1,
} as const

/** INP'de tek bir faz bunun üstündeyse "baskın" sayılır ve teşhis ona odaklanır. */
export const INP_PHASE_DOMINANCE = 0.5

/** Bu süreden önceki layout shift'ler yükleme, sonrakiler enjeksiyon/etkileşim kaynaklı sayılır. */
export const CLS_LOAD_PHASE_MS = 2500

export const rateMetric = (metric: CwvMetricName, value: number): CwvRating => {
  const threshold = CWV_RATING_THRESHOLDS[metric]
  if (value <= threshold.good) return 'good'
  if (value <= threshold.poor) return 'needs-improvement'
  return 'poor'
}

export type LcpPhaseName = keyof typeof LCP_PHASE_BUDGETS

export type PhaseShares<K extends string> = Readonly<Record<K, number>>

const sharesOf = <K extends string>(values: Readonly<Record<K, number>>): PhaseShares<K> => {
  const entries = Object.entries(values) as [K, number][]
  const total = entries.reduce((sum, [, value]) => sum + Math.max(value, 0), 0)
  // Fazlar toplamı 0 ise (bozuk/eksik veri) pay hesaplanamaz — hepsi 0 döner ve
  // hiçbir kural tetiklenmez. Sessizce yanlış teşhis üretmektense hiç üretmemek doğru.
  const safeTotal = total > 0 ? total : 1
  return Object.fromEntries(
    entries.map(([key, value]) => [key, Math.max(value, 0) / safeTotal]),
  ) as PhaseShares<K>
}

/**
 * Faz paylarını fazların TOPLAMINA böler, rapor edilen metrik değerine değil.
 * Böylece fazlar metriğe tam eşit toplanmadığında (yaygın) paylar yine tutarlı kalır.
 */
export const lcpPhaseShares = (attribution: LcpAttribution): PhaseShares<LcpPhaseName> =>
  sharesOf({
    timeToFirstByte: attribution.timeToFirstByte,
    resourceLoadDelay: attribution.resourceLoadDelay,
    resourceLoadDuration: attribution.resourceLoadDuration,
    elementRenderDelay: attribution.elementRenderDelay,
  })

export type InpPhaseName = 'inputDelay' | 'processingDuration' | 'presentationDelay'

export const inpPhaseShares = (attribution: InpAttribution): PhaseShares<InpPhaseName> =>
  sharesOf({
    inputDelay: attribution.inputDelay,
    processingDuration: attribution.processingDuration,
    presentationDelay: attribution.presentationDelay,
  })

export type TtfbPhaseName = keyof TtfbAttribution

/** TTFB'nin en uzun alt fazını döndürür — "sunucu yavaş" yerine "DNS yavaş" diyebilmek için. */
export const dominantTtfbPhase = (
  attribution: TtfbAttribution,
): { readonly phase: TtfbPhaseName; readonly ms: number } => {
  const entries = Object.entries(attribution) as [TtfbPhaseName, number][]
  const [phase, ms] = entries.reduce((best, current) => (current[1] > best[1] ? current : best))
  return { phase, ms }
}
