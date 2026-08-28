import { describe, expect, test } from 'vitest'
import { ProviderError } from '../../core/errors.js'
import { err, ok } from '../../core/result.js'
import { buildCruxRequestBody, cruxResponseToFieldCwv, withRequestedUrl } from './cruxProvider.js'
import { dataForSeoResponseToBacklinkProfile, dataForSeoResponseToMetrics } from './dataForSeoProviders.js'
import { geminiResponseToAnswer } from './geminiAiVisibilityProvider.js'
import { matchSiteUrl, signServiceAccountJwt } from './gscAuth.js'
import { buildDateRange, buildGscRequestBody, gscResponseToRows } from './gscProvider.js'
import { inspectionResponseToIndexStatus } from './gscUrlInspectionProvider.js'
import { serpApiResponseToSnapshot } from './serpApiProvider.js'

describe('serpApiResponseToSnapshot', () => {
  // Yapı, gerçek bir SerpApi yanıtından alındı ("dijital ajans" sorgusu).
  const response = {
    organic_results: [
      { position: 1, link: 'https://www.armadigital.com.tr/' },
      { position: 2, link: 'https://fevkalade.com.tr/hizmetler' },
      { position: 4, link: 'https://tr.linkedin.com/company/x' },
    ],
    ai_overview: { block: true },
  }

  test('domain kökü çıkarılır ve www atılır', () => {
    const result = serpApiResponseToSnapshot(response, 'dijital ajans')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.entries.map((entry) => entry.domain)).toEqual([
        'armadigital.com.tr',
        'fevkalade.com.tr',
        'tr.linkedin.com',
      ])
    }
  })

  test('pozisyonlar yoğun yeniden numaralandırılır — SerpApi boşluğu taşınmaz', () => {
    const result = serpApiResponseToSnapshot(response, 'dijital ajans')
    // Kaynakta 1,2,4 var; UNIQUE(runId,keyword,position) kısıtı için 1,2,3 olmalı
    expect(result.ok && result.value.entries.map((entry) => entry.position)).toEqual([1, 2, 3])
  })

  test('SERP özellikleri varlıklarından türetilir', () => {
    const withOverview = serpApiResponseToSnapshot(response, 'q')
    expect(withOverview.ok && withOverview.value.hasAiOverview).toBe(true)
    expect(withOverview.ok && withOverview.value.hasFeaturedSnippet).toBe(false)

    const withSnippet = serpApiResponseToSnapshot({ organic_results: [], answer_box: {} }, 'q')
    expect(withSnippet.ok && withSnippet.value.hasFeaturedSnippet).toBe(true)
  })

  test('boş organic_results meşrudur, eksik olması değil', () => {
    expect(serpApiResponseToSnapshot({ organic_results: [] }, 'q').ok).toBe(true)
    const missing = serpApiResponseToSnapshot({ search_metadata: {} }, 'q')
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error.message).toContain('organic_results yok')
  })

  test('SerpApi hata alanı yüzeye çıkar', () => {
    const result = serpApiResponseToSnapshot({ error: 'Invalid API key' }, 'q')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('Invalid API key')
  })
})

describe('dataForSeoResponseToMetrics', () => {
  const envelope = (result: unknown) => ({ status_code: 20000, tasks: [{ status_code: 20000, result }] })

  test('girdi kardinalitesi korunur — veri bulunmayan keyword volume 0 alır', () => {
    // DataForSEO `competition`'ı string enum döndürür; sayısal karşılığı competition_index (0..100)
    const raw = envelope([
      { keyword: 'dijital ajans', search_volume: 2400, competition: 'MEDIUM', competition_index: 42, cpc: 12.5 },
    ])
    const result = dataForSeoResponseToMetrics(raw, ['dijital ajans', 'bulunmayan kelime'])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toHaveLength(2)
      expect(result.value[0]).toEqual({ keyword: 'dijital ajans', volume: 2400, difficulty: 0.42, cpc: 12.5 })
      expect(result.value[1]).toEqual({ keyword: 'bulunmayan kelime', volume: 0, difficulty: 0, cpc: 0 })
    }
  })

  test('null alanlar 0 olur, sıra girdiye göre korunur', () => {
    const raw = envelope([{ keyword: 'b', search_volume: null, competition: null, cpc: null }])
    const result = dataForSeoResponseToMetrics(raw, ['a', 'b'])
    expect(result.ok && result.value.map((metric) => metric.keyword)).toEqual(['a', 'b'])
    expect(result.ok && result.value[1]?.volume).toBe(0)
  })

  test('doğrulanmamış hesap hatası eyleme dönüştürülebilir mesaj verir', () => {
    const raw = { status_code: 40104, status_message: 'Please verify your account' }
    const result = dataForSeoResponseToMetrics(raw, ['a'])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('app.dataforseo.com')
  })
})

describe('dataForSeoResponseToBacklinkProfile', () => {
  test('rank 0..1000 ölçeğinden domainAuthority 0..100 ölçeğine indirilir', () => {
    const raw = {
      status_code: 20000,
      tasks: [{ status_code: 20000, result: [{ referring_domains: 120, backlinks: 4300, rank: 380 }] }],
    }
    const result = dataForSeoResponseToBacklinkProfile(raw, 'mamcreatives.com')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.domainAuthority).toBe(38)
      expect(result.value.domain).toBe('mamcreatives.com')
      expect(result.value.refDomains).toBe(120)
    }
  })

  test('boş sonuç sessizce sıfır profil üretmez', () => {
    const raw = { status_code: 20000, tasks: [{ status_code: 20000, result: [] }] }
    expect(dataForSeoResponseToBacklinkProfile(raw, 'x.com').ok).toBe(false)
  })
})

describe('geminiResponseToAnswer', () => {
  test('parçalar birleştirilip AiAnswer üretilir', () => {
    const raw = { candidates: [{ content: { parts: [{ text: 'MAM Creatives' }, { text: ' önerilir.' }] } }] }
    const result = geminiResponseToAnswer(raw, 'en iyi ajans?')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.text).toBe('MAM Creatives önerilir.')
      expect(result.value.model).toContain('gemini')
    }
  })

  test('boş cevap hata döner — "marka geçmiyor" diye kaydedilmez', () => {
    const raw = { candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] }
    const result = geminiResponseToAnswer(raw, 'q')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('MAX_TOKENS')
  })

  test('güvenlik filtresi ayrı bir hata olarak bildirilir', () => {
    const result = geminiResponseToAnswer({ promptFeedback: { blockReason: 'SAFETY' } }, 'q')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('SAFETY')
  })
})

describe('GSC yardımcıları', () => {
  test('matchSiteUrl domain mülkünü URL önekine tercih eder', () => {
    const sites = ['https://www.mamcreatives.com/', 'sc-domain:mamcreatives.com']
    expect(matchSiteUrl(sites, 'mamcreatives.com')).toBe('sc-domain:mamcreatives.com')
  })

  test('yalnız URL öneki varsa onu bulur (www farkına rağmen)', () => {
    expect(matchSiteUrl(['https://www.mamcreatives.com/'], 'mamcreatives.com')).toBe('https://www.mamcreatives.com/')
  })

  test('eşleşme yoksa null döner', () => {
    expect(matchSiteUrl(['sc-domain:baska.com'], 'mamcreatives.com')).toBeNull()
    expect(matchSiteUrl([], 'mamcreatives.com')).toBeNull()
  })

  test('tarih aralığı veri gecikmesini düşer ve 28 gün kapsar', () => {
    const range = buildDateRange(Date.parse('2026-08-06T00:00:00Z'))
    expect(range.endDate).toBe('2026-08-03')
    expect(range.startDate).toBe('2026-07-07')
  })

  test('gscResponseToRows alanları yeniden adlandırır ve ctr 4 haneye yuvarlanır', () => {
    const raw = {
      rows: [
        { keys: ['dijital ajans', '/hizmetler'], clicks: 12, impressions: 340, ctr: 0.03529411764, position: 8.4 },
      ],
    }
    const result = gscResponseToRows(raw)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value[0]).toEqual({
        query: 'dijital ajans',
        page: '/hizmetler',
        clicks: 12,
        impressions: 340,
        ctr: 0.0353,
        avgPosition: 8.4,
      })
    }
  })

  test('rows yoksa boş liste döner (veri yok, hata değil)', () => {
    const result = gscResponseToRows({})
    expect(result.ok && result.value).toEqual([])
  })

  test('keys[1] (page) yoksa satır atlanır — query eksikliğiyle aynı muamele', () => {
    const raw = { rows: [{ keys: ['tek boyutlu sorgu'], clicks: 1, impressions: 10, ctr: 0.1, position: 5 }] }
    const result = gscResponseToRows(raw)
    expect(result.ok && result.value).toEqual([])
  })

  test('buildGscRequestBody query ve page boyutlarını birlikte ister', () => {
    const body = JSON.parse(buildGscRequestBody('2026-01-01', '2026-01-28')) as { dimensions: string[] }
    expect(body.dimensions).toEqual(['query', 'page'])
  })

  test('geçersiz PEM ile imzalama fırlatır — sağlayıcı bunu yakalayıp Result üretir', () => {
    expect(() => signServiceAccountJwt('a@b.com', 'GEÇERSİZ ANAHTAR')).toThrow()
  })
})

describe('inspectionResponseToIndexStatus', () => {
  test('indexStatusResult alanları IndexStatus alanlarına birebir eşlenir', () => {
    const raw = {
      inspectionResult: {
        indexStatusResult: {
          coverageState: 'Submitted and indexed',
          robotsTxtState: 'ALLOWED',
          indexingState: 'INDEXING_ALLOWED',
          pageFetchState: 'SUCCESSFUL',
          googleCanonical: 'https://ornek.com/',
          userCanonical: 'https://ornek.com/',
          lastCrawlTime: '2026-08-01T00:00:00Z',
        },
      },
    }
    const result = inspectionResponseToIndexStatus(raw, 'https://ornek.com/')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({
        url: 'https://ornek.com/',
        coverageState: 'Submitted and indexed',
        robotsTxtState: 'ALLOWED',
        indexingState: 'INDEXING_ALLOWED',
        pageFetchState: 'SUCCESSFUL',
        googleCanonical: 'https://ornek.com/',
        userCanonical: 'https://ornek.com/',
        lastCrawlTime: '2026-08-01T00:00:00Z',
      })
    }
  })

  test('eksik alanlar UNSPECIFIED/null olarak doldurulur, uydurulmaz', () => {
    const raw = { inspectionResult: { indexStatusResult: {} } }
    const result = inspectionResponseToIndexStatus(raw, 'https://ornek.com/')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.indexingState).toBe('INDEXING_STATE_UNSPECIFIED')
      expect(result.value.googleCanonical).toBeNull()
    }
  })

  test('indexStatusResult hiç yoksa hata döner', () => {
    const result = inspectionResponseToIndexStatus({ inspectionResult: {} }, 'https://ornek.com/')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('indexStatusResult yok')
  })
})

describe('cruxResponseToFieldCwv', () => {
  // Yapı, CrUX API'sinin resmi records:queryRecord dokümantasyonundaki örnekten alındı.
  const raw = {
    record: {
      key: { url: 'https://ornek.com/' },
      metrics: {
        largest_contentful_paint: { percentiles: { p75: 2400 } },
        interaction_to_next_paint: { percentiles: { p75: 180 } },
        cumulative_layout_shift: { percentiles: { p75: 0.05 } },
      },
    },
  }

  test('p75 metrikleri FieldCwv alanlarına eşlenir', () => {
    const result = cruxResponseToFieldCwv(raw, 'https://ornek.com/')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({
        url: 'https://ornek.com/',
        formFactor: 'ALL_FORM_FACTORS',
        lcpMs: 2400,
        inpMs: 180,
        cls: 0.05,
      })
    }
  })

  test('bir metrik yetersiz trafikte eksikse null olur, uydurulmaz', () => {
    const raw2 = { record: { metrics: { largest_contentful_paint: { percentiles: { p75: 2400 } } } } }
    const result = cruxResponseToFieldCwv(raw2, 'https://ornek.com/')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.lcpMs).toBe(2400)
      expect(result.value.inpMs).toBeNull()
      expect(result.value.cls).toBeNull()
    }
  })

  // Gerçek mamcreatives.com yanıtına karşı doğrulandı: CLS'in p75'i, diğer
  // metriklerin aksine (number), STRING gelir — ondalık hassasiyeti korumak için.
  test('CLS p75 string gelirse (gerçek CrUX davranışı) number\'a çevrilir', () => {
    const raw2 = { record: { metrics: { cumulative_layout_shift: { percentiles: { p75: '0.00' } } } } }
    const result = cruxResponseToFieldCwv(raw2, 'https://ornek.com/')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.cls).toBe(0)
  })

  test('metrics alanı hiç yoksa hata döner', () => {
    const result = cruxResponseToFieldCwv({ record: {} }, 'https://ornek.com/')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('metrics alanı yok')
  })

  test('buildCruxRequestBody url ve origin anahtarlarını doğru üretir', () => {
    expect(JSON.parse(buildCruxRequestBody('url', 'https://ornek.com/x'))).toEqual({ url: 'https://ornek.com/x' })
    expect(JSON.parse(buildCruxRequestBody('origin', 'https://ornek.com'))).toEqual({ origin: 'https://ornek.com' })
  })
})

describe('withRequestedUrl', () => {
  // Regresyon: origin-fallback sonucu ham haliyle `url: origin` taşıyordu — aynı origin'e
  // düşen farklı sayfalar aynı (url, formFactor) anahtarını paylaşıp field_cwv'nin
  // UNIQUE(runId, url, formFactor) kısıtını ihlal ediyordu (gerçek bir çalıştırmada fiilen oldu).
  test('origin-fallback sonucunun url alanını istenen sayfa URL\'ine geri yazar', () => {
    const originResult = ok({ url: 'https://ornek.com', formFactor: 'ALL_FORM_FACTORS' as const, lcpMs: 2000, inpMs: 150, cls: 0.05 })
    const fixed = withRequestedUrl(originResult, 'https://ornek.com/hizmetlerimiz')
    expect(fixed.ok).toBe(true)
    if (fixed.ok) expect(fixed.value.url).toBe('https://ornek.com/hizmetlerimiz')
  })

  test('metrik değerlerine dokunmaz, yalnız url değişir', () => {
    const originResult = ok({ url: 'https://ornek.com', formFactor: 'ALL_FORM_FACTORS' as const, lcpMs: 2000, inpMs: 150, cls: 0.05 })
    const fixed = withRequestedUrl(originResult, 'https://ornek.com/blog/yazi')
    if (fixed.ok) {
      expect(fixed.value.lcpMs).toBe(2000)
      expect(fixed.value.inpMs).toBe(150)
      expect(fixed.value.cls).toBe(0.05)
    }
  })

  test('hata sonucunu olduğu gibi geçirir, dokunmaz', () => {
    const errorResult = err(new ProviderError('crux', 'test hatası'))
    const passed = withRequestedUrl(errorResult, 'https://ornek.com/x')
    expect(passed).toBe(errorResult)
  })

  test('iki farklı sayfa aynı origin\'e düşse bile artık farklı url taşır (UNIQUE ihlalinin kök nedeni düzeldi)', () => {
    const originResult = ok({ url: 'https://ornek.com', formFactor: 'ALL_FORM_FACTORS' as const, lcpMs: 2000, inpMs: 150, cls: 0.05 })
    const page1 = withRequestedUrl(originResult, 'https://ornek.com/')
    const page2 = withRequestedUrl(originResult, 'https://ornek.com/hizmetlerimiz')
    expect(page1.ok && page2.ok && page1.value.url !== page2.value.url).toBe(true)
  })
})
