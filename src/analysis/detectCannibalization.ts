import { estimateImpact, type Finding } from '../core/findings.js'
import type { GscRow } from '../core/types.js'

/**
 * İkincil sayfanın gösterimi birincilinkinin bu oranını geçerse yamyamlık sayılır.
 * Altında kalan gösterim gürültüdür (ör. eski bir sayfa 1-2 kez rastgele göründü) —
 * her tek gösterimlik çakışmayı bulguya çevirmek raporu okunamaz kılardı.
 */
const SECONDARY_IMPRESSION_SHARE_THRESHOLD = 0.2

/** Aynı sorguda gösterime giren sayfa sayısı — birincil hariç kalan ikincil sayfa sayısı. */
const secondaryPageCount = (pages: readonly { readonly page: string; readonly impressions: number }[]): number =>
  Math.max(pages.length - 1, 0)

const cannibalizationFinding = (query: string, primary: GscRow, secondary: GscRow): Finding => {
  const share = secondary.impressions / primary.impressions
  return {
    category: 'content',
    severity: 'high',
    url: primary.page,
    culpritSelector: null,
    title: `"${query}" sorgusunda sayfa yamyamlığı (cannibalization)`,
    explanation:
      `"${query}" sorgusunda hem "${primary.page}" hem "${secondary.page}" gösterime giriyor. ` +
      `Google iki sayfa arasında kararsız kalıyor, ikisi de birbirinin sıralama gücünü bölüyor. ` +
      `Çözüm: sayfalardan birini diğerine yönlendirin ya da içeriği birleştirip canonical verin.`,
    evidence: `"${primary.page}" ${primary.impressions} gösterim, "${secondary.page}" ${secondary.impressions} gösterim (%${Math.round(share * 100)})`,
    impact: estimateImpact('high', share),
    effort: 'medium',
    fixSnippet: `<link rel="canonical" href="${primary.page}"> <!-- "${secondary.page}" sayfasına eklenir -->`,
  }
}

/**
 * Aynı sorguda ≥2 sayfa gösterim alıyorsa (boş page ve tek-sayfalı sorgular hariç)
 * bulgu üretir — saf fonksiyon. `page: ''` satırları (v6 öncesi göç edilmiş eski veri,
 * "sayfa bilinmiyor" demek) hiçbir zaman tetiklemez.
 */
export const detectCannibalization = (rows: readonly GscRow[]): readonly Finding[] => {
  const byQuery = new Map<string, GscRow[]>()
  for (const row of rows) {
    if (row.page === '') continue
    const existing = byQuery.get(row.query) ?? []
    byQuery.set(row.query, [...existing, row])
  }

  return [...byQuery.entries()].flatMap(([query, pages]) => {
    if (secondaryPageCount(pages) === 0) return []
    const sorted = [...pages].sort((a, b) => b.impressions - a.impressions)
    const primary = sorted[0]
    if (primary === undefined) return []
    return sorted
      .slice(1)
      .filter((secondary) => secondary.impressions / primary.impressions >= SECONDARY_IMPRESSION_SHARE_THRESHOLD)
      .map((secondary) => cannibalizationFinding(query, primary, secondary))
  })
}
