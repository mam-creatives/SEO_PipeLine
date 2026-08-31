import { collectSourceCode } from '../codeaudit/collectSourceCode.js'
import type { ProjectConfig } from '../config/schema.js'
import type { RunSnapshot, SerpSnapshot } from '../core/types.js'
import type { CollectedData } from './runAllCollectors.js'

/**
 * Faz 5.6 — bir DB snapshot'ını sanki yeni toplanmış gibi `CollectedData`'ya çevirir.
 * `report.ts`'in yeniden-render akışı ve `diffRuns`'ın bulgu-bazlı karşılaştırması (önceki
 * run'ın bulgularını yeniden hesaplamak için) ikisi de bunu kullanır — önceden report.ts
 * içinde tek seferlik inline yazılıyordu, ikinci kullanım yeri çıkınca DRY için çıkarıldı.
 *
 * Dış denetim düzeltmesi (2026-08-31, BLOKER 3) — `sitemapUrls`/`crawlSeedUrls`/`sourceFiles`/
 * `detectedStacks` önceden HER ZAMAN boş dönüyordu (üçü DB'de kalıcı değildi, dördüncüsü hiç
 * türetilmiyordu). Sonuç: önceki run'ın bulguları yeniden hesaplanırken kod denetimi ve
 * taranabilirlik/öksüz-sayfa bulguları her koşuda sahte biçimde "🆕 yeni" işaretleniyor,
 * asla "✅ düzeldi" olamıyordu (`diffRuns.ts` `findingKey` eşleşmesi hiç tutmuyordu).
 * Üçü artık gerçek veriden türetiliyor:
 *
 * - `sitemapUrls` — migrations.ts v18 ile kalıcı, doğrudan `snapshot`'tan okunur.
 * - `crawlSeedUrls` — `snapshot.serps` zaten kalıcı; `deriveAuditUrls` (analiz katmanının
 *   `selectAuditUrls`'i, DI ile enjekte edilir — `runAllCollectors.ts`'in `CollectorDeps`
 *   deseniyle aynı gerekçe: collectors → analysis bağımlılığı oluşmasın) ile üretim koşusuyla
 *   AYNI formülle yeniden hesaplanır.
 * - `sourceFiles`/`detectedStacks` — `config.codePath` bir run-spesifik veri değil, YEREL
 *   DİSKTEKİ GÜNCEL kaynak ağacı; `collectSourceCode` ağ I/O'su yapmadan senkron okur
 *   (zaten `runAllCollectors.ts`'in kullandığı aynı fonksiyon). Kod hiç değişmediyse mevcut
 *   run ile aynı sonucu üretir (doğru dedupe); değiştiyse gerçek bir "yeni/düzelen bulgu"
 *   yansıtır — bu, run zamanındaki donmuş bir görüntüden daha doğrudur.
 *
 * `sitemapUrls` hâlâ yeniden ÇEKİLMEZ (ağ I/O'su gerektirir) — `report.ts`'in "yeni veri
 * TOPLAMADAN" ilkesini ihlal ederdi; bu yüzden persist edilen değer kullanılır.
 */
export const snapshotToCollectedData = (
  snapshot: RunSnapshot,
  config: ProjectConfig,
  deriveAuditUrls: (serps: readonly SerpSnapshot[]) => readonly string[],
): CollectedData => {
  const clientAuditUrls = deriveAuditUrls(snapshot.serps)
  const { sourceFiles, detectedStacks } = collectSourceCode(config.codePath)
  return {
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
    sitemapUrls: snapshot.sitemapUrls,
    crawlSeedUrls: [...new Set([`https://${config.domain}/`, ...clientAuditUrls])],
    sourceFiles,
    detectedStacks,
    failedBranches: [],
  }
}
