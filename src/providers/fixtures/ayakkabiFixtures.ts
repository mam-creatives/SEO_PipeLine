/**
 * Türkçe "ayakkabı" ailesi sentetik örnek verisi.
 * Hem mock sağlayıcıların hem de testlerin TEK veri kaynağı.
 * `CLIENT` placeholder'ı çalışma anında config.domain ile değiştirilir.
 */

export const CLIENT_PLACEHOLDER = 'CLIENT'

export interface KeywordFixture {
  readonly keyword: string
  readonly volume: number
  readonly difficulty: number
  readonly cpc: number
  readonly serpDomains: readonly string[]
  readonly hasFeaturedSnippet: boolean
  readonly hasAiOverview: boolean
}

export const AYAKKABI_KEYWORDS: readonly KeywordFixture[] = [
  {
    keyword: 'ayakkabı',
    volume: 90500,
    difficulty: 0.92,
    cpc: 5.8,
    serpDomains: ['trendyol.com', 'hepsiburada.com', 'flo.com.tr', 'n11.com', 'derimod.com.tr', 'amazon.com.tr', 'sneakscloud.com', 'eksisozluk.com', 'ayakkabidunyasi.com.tr', 'ciceksepeti.com'],
    hasFeaturedSnippet: false,
    hasAiOverview: true,
  },
  {
    keyword: 'spor ayakkabı',
    volume: 49500,
    difficulty: 0.85,
    cpc: 4.9,
    serpDomains: ['trendyol.com', 'flo.com.tr', 'hepsiburada.com', 'sneakscloud.com', 'n11.com', 'spx.com.tr', 'korayspor.com', 'amazon.com.tr', 'instreet.com.tr', 'superstep.com.tr'],
    hasFeaturedSnippet: false,
    hasAiOverview: true,
  },
  {
    keyword: 'ayakkabı fiyatları',
    volume: 12100,
    difficulty: 0.6,
    cpc: 3.1,
    serpDomains: ['trendyol.com', 'hepsiburada.com', 'flo.com.tr', 'n11.com', 'akakce.com', 'cimri.com', 'derimod.com.tr', 'CLIENT', 'epey.com', 'ayakkabidunyasi.com.tr'],
    hasFeaturedSnippet: false,
    hasAiOverview: false,
  },
  {
    keyword: 'kadın ayakkabı',
    volume: 33100,
    difficulty: 0.8,
    cpc: 4.4,
    serpDomains: ['trendyol.com', 'flo.com.tr', 'derimod.com.tr', 'inci.com.tr', 'hotic.com.tr', 'hepsiburada.com', 'n11.com', 'amazon.com.tr', 'ninewest.com.tr', 'greyder.com'],
    hasFeaturedSnippet: false,
    hasAiOverview: true,
  },
  {
    keyword: 'erkek spor ayakkabı',
    volume: 8100,
    difficulty: 0.65,
    cpc: 3.8,
    serpDomains: ['flo.com.tr', 'trendyol.com', 'sneakscloud.com', 'korayspor.com', 'hepsiburada.com', 'spx.com.tr', 'CLIENT', 'superstep.com.tr', 'n11.com', 'instreet.com.tr'],
    hasFeaturedSnippet: false,
    hasAiOverview: false,
  },
  {
    keyword: 'en iyi koşu ayakkabısı',
    volume: 5400,
    difficulty: 0.5,
    cpc: 2.9,
    serpDomains: ['onedio.com', 'runkolik.com', 'sneakscloud.com', 'eksisozluk.com', 'korayspor.com', 'hurriyet.com.tr', 'adidas.com.tr', 'spx.com.tr', 'superstep.com.tr', 'milliyet.com.tr'],
    hasFeaturedSnippet: true,
    hasAiOverview: true,
  },
  {
    keyword: 'ucuz ayakkabı',
    volume: 6600,
    difficulty: 0.45,
    cpc: 1.8,
    serpDomains: ['n11.com', 'trendyol.com', 'hepsiburada.com', 'CLIENT', 'flo.com.tr', 'ayakkabidunyasi.com.tr', 'cimri.com', 'akakce.com', 'sahibinden.com', 'defacto.com.tr'],
    hasFeaturedSnippet: false,
    hasAiOverview: false,
  },
  {
    keyword: 'rahat yürüyüş ayakkabısı',
    volume: 4400,
    difficulty: 0.4,
    cpc: 2.4,
    serpDomains: ['onedio.com', 'flo.com.tr', 'sneakscloud.com', 'greyder.com', 'skechers.com.tr', 'CLIENT', 'hotic.com.tr', 'derimod.com.tr', 'eksisozluk.com', 'polaris.com.tr'],
    hasFeaturedSnippet: true,
    hasAiOverview: true,
  },
  {
    keyword: 'deri ayakkabı',
    volume: 9900,
    difficulty: 0.55,
    cpc: 3.4,
    serpDomains: ['derimod.com.tr', 'flo.com.tr', 'hotic.com.tr', 'cabani.com.tr', 'CLIENT', 'trendyol.com', 'greyder.com', 'kemaltanca.com.tr', 'hepsiburada.com', 'inci.com.tr'],
    hasFeaturedSnippet: false,
    hasAiOverview: false,
  },
  {
    keyword: 'ayakkabı nasıl temizlenir',
    volume: 3600,
    difficulty: 0.25,
    cpc: 0.4,
    serpDomains: ['onedio.com', 'eksisozluk.com', 'hurriyet.com.tr', 'milliyet.com.tr', 'flo.com.tr', 'CLIENT', 'evtemizligi.com', 'sabah.com.tr', 'wikihow.com', 'sneakscloud.com'],
    hasFeaturedSnippet: true,
    hasAiOverview: true,
  },
  {
    keyword: 'ayakkabı numarası nasıl ölçülür',
    volume: 1900,
    difficulty: 0.2,
    cpc: 0.3,
    serpDomains: ['flo.com.tr', 'onedio.com', 'CLIENT', 'hepsiburada.com', 'eksisozluk.com', 'hurriyet.com.tr', 'wikihow.com', 'derimod.com.tr', 'milliyet.com.tr', 'n11.com'],
    hasFeaturedSnippet: true,
    hasAiOverview: false,
  },
  {
    keyword: 'deri ayakkabı bakımı nasıl yapılır',
    volume: 1300,
    difficulty: 0.18,
    cpc: 0.5,
    serpDomains: ['derimod.com.tr', 'CLIENT', 'onedio.com', 'kemaltanca.com.tr', 'hurriyet.com.tr', 'eksisozluk.com', 'flo.com.tr', 'evtemizligi.com', 'wikihow.com', 'sabah.com.tr'],
    hasFeaturedSnippet: true,
    hasAiOverview: true,
  },
  {
    keyword: 'İstanbul ayakkabı mağazası',
    volume: 2400,
    difficulty: 0.35,
    cpc: 1.9,
    serpDomains: ['flo.com.tr', 'derimod.com.tr', 'hotic.com.tr', 'CLIENT', 'kemaltanca.com.tr', 'inci.com.tr', 'sahibinden.com', 'foursquare.com', 'n11.com', 'eksisozluk.com'],
    hasFeaturedSnippet: false,
    hasAiOverview: false,
  },
  {
    keyword: 'ayakkabı mağazası nerede',
    volume: 880,
    difficulty: 0.3,
    cpc: 1.2,
    serpDomains: ['flo.com.tr', 'CLIENT', 'derimod.com.tr', 'hotic.com.tr', 'foursquare.com', 'eksisozluk.com', 'onedio.com', 'kemaltanca.com.tr', 'inci.com.tr', 'sahibinden.com'],
    hasFeaturedSnippet: false,
    hasAiOverview: false,
  },
  {
    keyword: 'örnek ayakkabı indirim',
    volume: 720,
    difficulty: 0.15,
    cpc: 0.9,
    serpDomains: ['CLIENT', 'trendyol.com', 'hepsiburada.com', 'akakce.com', 'cimri.com', 'flo.com.tr', 'n11.com', 'instagram.com', 'facebook.com', 'eksisozluk.com'],
    hasFeaturedSnippet: false,
    hasAiOverview: false,
  },
]

/** Bilinen domain'lerin backlink profilleri; listede olmayanlar hash'ten türetilir. */
export const BACKLINK_FIXTURES: Readonly<
  Record<string, { readonly refDomains: number; readonly backlinkCount: number; readonly domainAuthority: number }>
> = {
  CLIENT: { refDomains: 85, backlinkCount: 640, domainAuthority: 22 },
  'flo.com.tr': { refDomains: 12400, backlinkCount: 890000, domainAuthority: 71 },
  'derimod.com.tr': { refDomains: 5400, backlinkCount: 210000, domainAuthority: 58 },
  'hotic.com.tr': { refDomains: 2900, backlinkCount: 98000, domainAuthority: 49 },
  'sneakscloud.com': { refDomains: 1900, backlinkCount: 64000, domainAuthority: 44 },
  'kemaltanca.com.tr': { refDomains: 1600, backlinkCount: 52000, domainAuthority: 41 },
  'inci.com.tr': { refDomains: 1200, backlinkCount: 39000, domainAuthority: 38 },
}

/** Müşteri sitesi kasıtlı olarak yavaş — raporun "Teknik Sorunlar" bölümü demo'da dolu görünsün. */
export const CLIENT_TECH_AUDIT = {
  lcpMs: 3900,
  inpMs: 260,
  cls: 0.18,
  performanceScore: 54,
  /**
   * Sentetik attribution — LCP toplamıyla tutarlı (900+800+1600+600 = 3900ms).
   * Mock modda teşhis bölümünün boş kalmaması için; gerçek ölçüm değildir.
   * `source: 'field'` seçildi ki mock demo INP teşhisini de gösterebilsin.
   */
  attribution: {
    source: 'field',
    lcp: {
      target: 'section.hero > img.banner',
      url: 'https://ornekayakkabi.com.tr/img/hero.jpg',
      timeToFirstByte: 900,
      resourceLoadDelay: 800,
      resourceLoadDuration: 1600,
      elementRenderDelay: 600,
    },
    inp: {
      interactionTarget: 'button.sepete-ekle',
      interactionType: 'pointer',
      inputDelay: 180,
      processingDuration: 50,
      presentationDelay: 30,
      longestScriptUrl: 'https://ornekayakkabi.com.tr/js/chat-widget.js',
      longestScriptDuration: 140,
    },
    cls: {
      largestShiftTarget: 'div.urun-listesi > figure',
      largestShiftValue: 0.14,
      largestShiftTime: 1400,
      loadState: 'loading',
    },
    ttfb: {
      waitingDuration: 620,
      cacheDuration: 5,
      dnsDuration: 180,
      connectionDuration: 80,
      requestDuration: 15,
    },
  },
  issues: [
    'Görsel boyutları (width/height) belirtilmemiş — layout shift kaynağı',
    'Render-blocking JavaScript ana thread\'i kilitliyor',
    'Ana görsel lazy-load edilmiş — LCP gecikiyor',
  ],
} as const

/** AI cevaplarında marka adı ↔ domain eşlemesi (mention tespiti için). */
export const BRAND_NAME_BY_DOMAIN: Readonly<Record<string, string>> = {
  'flo.com.tr': 'FLO',
  'derimod.com.tr': 'Derimod',
  'hotic.com.tr': 'Hotiç',
  'sneakscloud.com': 'Sneaks Cloud',
  'kemaltanca.com.tr': 'Kemal Tanca',
  'inci.com.tr': 'İnci',
}

/** Bilinmeyen keyword'ler için SERP üretiminde kullanılan domain havuzu. */
export const GENERIC_SERP_POOL: readonly string[] = [
  'trendyol.com',
  'hepsiburada.com',
  'n11.com',
  'flo.com.tr',
  'derimod.com.tr',
  'onedio.com',
  'eksisozluk.com',
  'hotic.com.tr',
  'sneakscloud.com',
  'amazon.com.tr',
]

/** Mock GSC verisi — yalnız müşterinin gerçekten trafik aldığı sorgular. */
export const GSC_FIXTURES: readonly {
  readonly query: string
  readonly clicks: number
  readonly impressions: number
  readonly avgPosition: number
}[] = [
  { query: 'örnek ayakkabı', clicks: 320, impressions: 4100, avgPosition: 1.2 },
  { query: 'örnek ayakkabı indirim', clicks: 95, impressions: 1400, avgPosition: 1.8 },
  { query: 'deri ayakkabı bakımı nasıl yapılır', clicks: 74, impressions: 2900, avgPosition: 2.4 },
  { query: 'ayakkabı numarası nasıl ölçülür', clicks: 41, impressions: 3300, avgPosition: 3.6 },
  { query: 'ucuz ayakkabı', clicks: 28, impressions: 5200, avgPosition: 4.9 },
  { query: 'deri ayakkabı', clicks: 19, impressions: 4800, avgPosition: 5.7 },
]
