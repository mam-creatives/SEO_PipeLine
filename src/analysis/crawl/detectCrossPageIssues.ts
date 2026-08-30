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

/**
 * Sayfalar-arası (çapraz) bulgular — `detectOnPageIssues`'un aksine tek sayfaya değil,
 * kümülatif kalıplara bakar (Faz 4.2b). Saf fonksiyon; grup başına, gruptaki HER sayfa için
 * ayrı bir `Finding` üretir (`Finding.url` tek alan olduğu için mevcut per-page desenle
 * uyumlu, `Finding` tipine dokunulmadı) — `evidence` alanında kardeş URL'ler listelenir.
 */
export const detectCrossPageIssues = (pages: readonly CrawledPage[]): readonly Finding[] => {
  const evaluable = pages.filter(isEvaluable)
  return [...duplicateTitleFindings(evaluable), ...duplicateH1Findings(evaluable)]
}
