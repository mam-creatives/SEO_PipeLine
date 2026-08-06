/**
 * Sınırlı eşzamanlılıkla eşleme.
 *
 * `Promise.all` tüm işleri aynı anda başlatır; Lighthouse gibi her çağrıda ayrı
 * bir Chrome süreci açan işlerde bu kaynak tükenmesine ve toplu başarısızlığa yol
 * açar (7 URL denendiğinde fiilen yaşandı). Sonuçlar girdi sırasını korur.
 */
export const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<readonly R[]> => {
  if (items.length === 0) return []

  const results = new Array<R>(items.length)
  // Havuzdaki işçilerin paylaştığı imleç — yerel ve tek iş parçacıklı,
  // bu yüzden mutasyon burada güvenli ve deyimsel.
  let cursor = 0

  const runWorker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      const item = items[index]
      if (item === undefined) continue
      results[index] = await worker(item)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runWorker))
  return results
}
