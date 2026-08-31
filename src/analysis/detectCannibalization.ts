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

/**
 * Dış denetim bulgusu (2026-08-31, Faz C) — önceden (sorgu, ikincil sayfa) çifti başına bir
 * `Finding` üretiliyordu: canlı `run13`'te 26 bulgu, 233 satır, ve aynı 3 cümlelik açıklama
 * TAM METNİYLE 26 kez tekrarlanıyordu. Bu bir render değil dedektör sorunuydu — dedektör
 * zaten sorguya göre grupluyordu, sonra `flatMap` ile tekrar dağıtıyordu. Artık sorgu başına
 * TEK bulgu: birincil sayfa + TÜM ikincil sayfalar tek `evidence`/`fixSnippet`'te.
 */
const cannibalizationFinding = (query: string, primary: GscRow, secondaries: readonly GscRow[]): Finding => {
  const shares = secondaries.map((secondary) => secondary.impressions / primary.impressions)
  const topShare = Math.max(...shares)
  const evidence = [
    `"${primary.page}" ${primary.impressions} gösterim`,
    ...secondaries.map(
      (secondary, index) => `"${secondary.page}" ${secondary.impressions} gösterim (%${Math.round((shares[index] ?? 0) * 100)})`,
    ),
  ].join(', ')
  const pageCount = secondaries.length + 1

  return {
    category: 'content',
    severity: 'high',
    url: primary.page,
    culpritSelector: null,
    title: `"${query}" sorgusunda sayfa yamyamlığı (cannibalization)`,
    explanation:
      `"${query}" sorgusunda ${pageCount} sayfa aynı anda gösterime giriyor: "${primary.page}" ve ` +
      `${secondaries.length} sayfa daha. Google sayfalar arasında kararsız kalıyor, hepsi birbirinin ` +
      `sıralama gücünü bölüyor. Çözüm: ikincil sayfaları birincile yönlendirin ya da içeriği birleştirip canonical verin.`,
    evidence,
    impact: estimateImpact('high', topShare),
    effort: 'medium',
    fixSnippet: secondaries
      .map((secondary) => `<link rel="canonical" href="${primary.page}"> <!-- "${secondary.page}" sayfasına eklenir -->`)
      .join('\n'),
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
    const secondaries = sorted
      .slice(1)
      .filter((secondary) => secondary.impressions / primary.impressions >= SECONDARY_IMPRESSION_SHARE_THRESHOLD)
    if (secondaries.length === 0) return []
    return [cannibalizationFinding(query, primary, secondaries)]
  })
}
