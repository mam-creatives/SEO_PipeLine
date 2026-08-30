import { estimateImpact, type Finding } from '../../core/findings.js'
import type { CrawledPage } from '../../core/types.js'

/** Yalnız gerçekten alınmış sayfalar değerlendirilir — 4xx/5xx'in boş title'ı "duplicate" saymaz. */
const isEvaluable = (page: CrawledPage): boolean => page.statusCode !== null && page.statusCode >= 200 && page.statusCode < 300

/**
 * `keyOf` null dönerse sayfa hiçbir gruba girmez — bu, title/H1 eksikliğinin (Faz 4.1'de
 * CSR şüphesiyle zaten ayrı ele alınan bir durum) yanlışlıkla "duplicate" sayılmasını
 * doğal olarak engeller: eksik değer zaten bu fonksiyona hiç girmiyor.
 */
const groupBy = (pages: readonly CrawledPage[], keyOf: (page: CrawledPage) => string | null): ReadonlyMap<string, readonly CrawledPage[]> => {
  const groups = new Map<string, CrawledPage[]>()
  for (const page of pages) {
    const key = keyOf(page)
    if (key === null) continue
    const existing = groups.get(key)
    if (existing === undefined) groups.set(key, [page])
    else existing.push(page)
  }
  return groups
}

const siblingUrls = (group: readonly CrawledPage[], page: CrawledPage): string => group.filter((p) => p.url !== page.url).map((p) => p.url).join(', ')

const duplicateTitleFindings = (pages: readonly CrawledPage[]): readonly Finding[] => {
  const groups = groupBy(pages, (page) => (page.title === null || page.title === '' ? null : page.title))
  return [...groups.values()]
    .filter((group) => group.length >= 2)
    .flatMap((group) =>
      group.map(
        (page): Finding => ({
          category: 'onpage',
          severity: 'medium',
          url: page.url,
          culpritSelector: 'title',
          title: `Aynı title'ı ${group.length} sayfa paylaşıyor`,
          explanation:
            'Birden fazla sayfa aynı <title> etiketini kullanıyor — Google hangi sayfanın bu içerik için ' +
            'birincil olduğuna kendi karar verir, bu genelde istenmeyen bir sayfayı öne çıkarır ya da ' +
            'sayfaları birbirine karşı rekabet ettirir.',
          evidence: `Aynı title'ı paylaşan diğer sayfalar: ${siblingUrls(group, page)}`,
          impact: estimateImpact('medium'),
          effort: 'small',
          fixSnippet: null,
        }),
      ),
    )
}

const duplicateH1Findings = (pages: readonly CrawledPage[]): readonly Finding[] => {
  const groups = groupBy(pages, (page) => {
    const first = page.h1s[0]
    return first === undefined || first === '' ? null : first
  })
  return [...groups.values()]
    .filter((group) => group.length >= 2)
    .flatMap((group) =>
      group.map(
        (page): Finding => ({
          category: 'onpage',
          severity: 'low',
          url: page.url,
          culpritSelector: 'h1',
          title: `Aynı H1'i ${group.length} sayfa paylaşıyor`,
          explanation:
            'Birden fazla sayfa aynı birincil başlığı (H1) kullanıyor — sayfaların birbirinden ayrışan, ' +
            'kendine özgü bir konusu olduğu belirsizleşir.',
          evidence: `Aynı H1'i paylaşan diğer sayfalar: ${siblingUrls(group, page)}`,
          impact: estimateImpact('low'),
          effort: 'small',
          fixSnippet: null,
        }),
      ),
    )
}

/** ISO 639-1 benzeri iki harfli (opsiyonel bölge etiketli, ör. "en-US") path öneki. */
const LOCALE_PATH_SEGMENT = /^[a-z]{2}(-[a-z]{2})?$/i

const localePrefixOf = (url: string): string | null => {
  let path: string
  try {
    path = new URL(url).pathname
  } catch {
    return null
  }
  const first = path.split('/').filter((segment) => segment !== '')[0]
  return first !== undefined && LOCALE_PATH_SEGMENT.test(first) ? first.toLowerCase() : null
}

/**
 * Faz 4.3 — canlı crawl karşılığı, `codeaudit/rules/php/missingHreflang.ts`'in aynı temkinli
 * mantığıyla: yalnız çok dilli routing SİNYALİ varsa (2+ farklı yerel-önekli path, ör. /tr/,
 * /en/) VE hiçbir sayfada hreflang yoksa fırlatılır — tek dilli TR-only bir sitede path'in
 * ilk segmenti tesadüfen iki harfli olsa bile (ör. "/tr/blog" TEK önekse) sinyal sayılmaz.
 */
const missingHreflangFinding = (pages: readonly CrawledPage[]): Finding | null => {
  const localePrefixes = new Set(pages.map((page) => localePrefixOf(page.url)).filter((prefix): prefix is string => prefix !== null))
  if (localePrefixes.size < 2) return null
  if (pages.some((page) => page.hreflangs.length > 0)) return null

  return {
    category: 'onpage',
    severity: 'medium',
    url: null,
    culpritSelector: 'link[rel="alternate"][hreflang]',
    title: 'Site çok dilli routing kullanıyor ama hiçbir sayfada hreflang yok',
    explanation:
      `Taranan sayfalarda ${[...localePrefixes].sort().join(', ')} gibi farklı dil önekleri bulundu ` +
      'ama hiçbir sayfada <link rel="alternate" hreflang="..."> etiketi yok. Google hangi dil ' +
      'sürümünü hangi kullanıcıya göstereceğini bu işaret olmadan kendi tahmin eder.',
    evidence: `Bulunan dil önekleri: ${[...localePrefixes].sort().join(', ')}`,
    impact: estimateImpact('medium'),
    effort: 'medium',
    fixSnippet: '<link rel="alternate" hreflang="tr" href="https://ornek.com/tr/sayfa" />\n<link rel="alternate" hreflang="en" href="https://ornek.com/en/page" />',
  }
}

/**
 * Sayfalar-arası (çapraz) bulgular — `detectOnPageIssues`'un aksine tek sayfaya değil,
 * kümülatif kalıplara bakar (Faz 4.2b/4.3). Saf fonksiyon; duplicate title/H1 grup başına
 * gruptaki HER sayfa için ayrı bir `Finding` üretir (`Finding.url` tek alan olduğu için
 * mevcut per-page desenle uyumlu, `Finding` tipine dokunulmadı) — `evidence` alanında kardeş
 * URL'ler listelenir. hreflang bulgusu ise site geneli TEK bir Finding (`url: null`).
 */
export const detectCrossPageIssues = (pages: readonly CrawledPage[]): readonly Finding[] => {
  const evaluable = pages.filter(isEvaluable)
  const hreflangFinding = missingHreflangFinding(evaluable)
  return [
    ...duplicateTitleFindings(evaluable),
    ...duplicateH1Findings(evaluable),
    ...(hreflangFinding === null ? [] : [hreflangFinding]),
  ]
}
