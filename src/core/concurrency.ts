/**
 * Sınırlı eşzamanlılıkla eşleme.
 *
 * `Promise.all` tüm işleri aynı anda başlatır; Lighthouse gibi her çağrıda ayrı
 * bir Chrome süreci açan işlerde bu kaynak tükenmesine ve toplu başarısızlığa yol
 * açar (7 URL denendiğinde fiilen yaşandı). Sonuçlar girdi sırasını korur.
 *
 * `onProgress` (2026-08-31, Faz C, opsiyonel) — dış denetim bulgusu: 300 sayfa +
 * 7 Lighthouse dakikalarca sessizlik demekti, toplam 5 log satırı. Verilirse her
 * iş bitince `(tamamlanan, toplam)` ile çağrılır — `collectTechAudits`/`crawlSite`
 * bağlanır, diğer 3 çağrı yeri (backlink/indexing/CrUX) değişmeden çalışmaya devam eder.
 */
export const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
  onProgress?: (completed: number, total: number) => void,
): Promise<readonly R[]> => {
  if (items.length === 0) return []

  const results = new Array<R>(items.length)
  // Havuzdaki işçilerin paylaştığı imleç — yerel ve tek iş parçacıklı,
  // bu yüzden mutasyon burada güvenli ve deyimsel.
  let cursor = 0
  let completed = 0

  const runWorker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      const item = items[index]
      if (item === undefined) continue
      results[index] = await worker(item)
      completed += 1
      onProgress?.(completed, items.length)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runWorker))
  return results
}
