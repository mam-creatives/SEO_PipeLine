import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { diagnoseCwv } from '../analysis/cwv/diagnose.js'
import { openDatabase, type Db } from '../storage/db.js'
import {
  insertRumSamples,
  MIN_RUM_SAMPLES,
  readFieldAudit,
  RumPayloadSchema,
  type RumSample,
} from './rumRepository.js'
import { buildCdnSnippet, buildNpmSnippet } from './snippet.js'

const URL_UNDER_TEST = 'https://ornekayakkabi.com.tr/'

const lcpSample = (value: number): RumSample => ({
  url: URL_UNDER_TEST,
  metric: 'LCP',
  value,
  rating: value <= 2500 ? 'good' : 'poor',
  navigationType: 'navigate',
  attribution: {
    target: 'section.hero > img',
    url: 'https://ornekayakkabi.com.tr/hero.jpg',
    timeToFirstByte: 200,
    resourceLoadDelay: 900,
    resourceLoadDuration: 300,
    elementRenderDelay: 100,
  },
})

const inpSample = (value: number): RumSample => ({
  url: URL_UNDER_TEST,
  metric: 'INP',
  value,
  rating: 'poor',
  navigationType: 'navigate',
  attribution: {
    interactionTarget: 'button.sepete-ekle',
    interactionType: 'pointer',
    inputDelay: 40,
    processingDuration: 420,
    presentationDelay: 40,
    longestScript: { sourceUrl: 'https://t.example/tag.js', duration: 380 },
  },
})

describe('RumPayloadSchema', () => {
  test('geçerli yükü kabul eder', () => {
    expect(RumPayloadSchema.safeParse([lcpSample(2400)]).success).toBe(true)
  })

  test('bilinmeyen metrik ve negatif değer reddedilir', () => {
    expect(RumPayloadSchema.safeParse([{ ...lcpSample(100), metric: 'FID' }]).success).toBe(false)
    expect(RumPayloadSchema.safeParse([{ ...lcpSample(-5) }]).success).toBe(false)
  })

  test('boş dizi reddedilir', () => {
    expect(RumPayloadSchema.safeParse([]).success).toBe(false)
  })
})

describe('readFieldAudit', () => {
  let db: Db

  beforeEach(() => {
    db = openDatabase(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  test('yetersiz örnekte null döner — az veriden teşhis üretilmez', () => {
    insertRumSamples(db, [lcpSample(3000), lcpSample(3200)])
    expect(readFieldAudit(db, URL_UNDER_TEST)).toBeNull()
  })

  test('75. persentil nearest-rank ile hesaplanır', () => {
    // 8 örnek: rank = ceil(0.75 * 8) = 6 → 6. değer (1 tabanlı) = 600
    insertRumSamples(db, [100, 200, 300, 400, 500, 600, 700, 800].map(lcpSample))
    expect(readFieldAudit(db, URL_UNDER_TEST)?.lcpMs).toBe(600)
  })

  test('p75 yavaş kuyruğu yakalar — ortalama yakalayamaz', () => {
    // 8 hızlı + 4 yavaş (%33 yavaş). Ortalama ~2400ms ile "orta" görünür,
    // ama kullanıcıların üçte biri 5sn+ bekliyor; p75 bunu ortaya çıkarır.
    const values = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 5000, 5200, 5400, 5600]
    insertRumSamples(db, values.map(lcpSample))
    expect(readFieldAudit(db, URL_UNDER_TEST)?.lcpMs).toBe(5000)
  })

  test('INP alan verisinden gelir ve teşhise dönüşür — lab bunu yapamaz', () => {
    insertRumSamples(db, Array.from({ length: MIN_RUM_SAMPLES }, () => inpSample(520)))
    const audit = readFieldAudit(db, URL_UNDER_TEST)
    expect(audit).not.toBeNull()
    expect(audit?.attribution?.source).toBe('field')
    expect(audit?.inpMs).toBe(520)

    const diagnosis = audit === null ? null : diagnoseCwv(audit)
    expect(diagnosis?.ratings.INP).toBe('poor')
    const finding = diagnosis?.findings.find((item) => item.phase === 'processingDuration')
    expect(finding?.culpritSelector).toBe('button.sepete-ekle')
    expect(finding?.explanation).toContain('https://t.example/tag.js')
  })

  test('web-vitals attribution alanları kayıpsız geri okunur', () => {
    insertRumSamples(db, Array.from({ length: MIN_RUM_SAMPLES }, () => lcpSample(4000)))
    const lcp = readFieldAudit(db, URL_UNDER_TEST)?.attribution?.lcp
    expect(lcp?.target).toBe('section.hero > img')
    expect(lcp?.resourceLoadDelay).toBe(900)
    expect(lcp?.url).toBe('https://ornekayakkabi.com.tr/hero.jpg')
  })

  test('başka URL adresinin örnekleri karışmaz', () => {
    insertRumSamples(
      db,
      Array.from({ length: MIN_RUM_SAMPLES }, () => ({ ...lcpSample(4000), url: 'https://baska.com.tr/' })),
    )
    expect(readFieldAudit(db, URL_UNDER_TEST)).toBeNull()
  })
})

describe('snippet üretimi', () => {
  test('her iki varyant da web-vitals attribution build modülünü ve endpoint adresini içerir', () => {
    const npm = buildNpmSnippet({ endpoint: 'https://x.tr/api/rum' })
    expect(npm).toContain("from 'web-vitals/attribution'")
    expect(npm).toContain('https://x.tr/api/rum')
    expect(npm).toContain('onINP(report)')

    const cdn = buildCdnSnippet({ endpoint: 'https://x.tr/api/rum' })
    expect(cdn).toContain('web-vitals.attribution.js')
    expect(cdn).toContain('sendBeacon')
  })
})
