import type { RunSnapshot } from '../core/types.js'
import type { CollectedData } from './runAllCollectors.js'

/**
 * Faz 5.6 — bir DB snapshot'ını sanki yeni toplanmış gibi `CollectedData`'ya çevirir.
 * `report.ts`'in yeniden-render akışı ve `diffRuns`'ın bulgu-bazlı karşılaştırması (önceki
 * run'ın bulgularını yeniden hesaplamak için) ikisi de bunu kullanır — önceden report.ts
 * içinde tek seferlik inline yazılıyordu, ikinci kullanım yeri çıkınca DRY için çıkarıldı.
 *
 * sitemapUrls/crawlSeedUrls/sourceFiles/detectedStacks DB'de KALICI DEĞİL (bkz. migrations.ts
 * v8 ve runAllCollectors.ts yorumları) — bu dördü her zaman boş döner; ilgili bulgular
 * (taranabilirlik karşılaştırması, öksüz-sayfa istisnası, kod denetimi) snapshot'tan yeniden
 * üretilemez, bu beklenen bir sınırdır.
 */
export const snapshotToCollectedData = (snapshot: RunSnapshot): CollectedData => ({
  keywords: snapshot.keywords,
  serps: snapshot.serps,
  backlinks: snapshot.backlinks,
  techAudits: snapshot.techAudits,
  aiSamples: snapshot.aiSamples,
  gscRows: snapshot.gscRows,
  indexStatuses: snapshot.indexStatuses,
  fieldCwv: snapshot.fieldCwv,
  crawledPages: snapshot.pages,
  keywordGaps: snapshot.keywordGaps,
  sitemapUrls: [],
  crawlSeedUrls: [],
  sourceFiles: [],
  detectedStacks: [],
  failedBranches: [],
})
