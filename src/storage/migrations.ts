import type { Database } from 'better-sqlite3'
import { StorageError } from '../core/errors.js'

/**
 * Sıralı migration listesi. Her giriş bir kez uygulanır; PRAGMA user_version ile takip edilir.
 * Run = değişmez (immutable) anlık görüntü: fact tabloları yalnız INSERT alır, UPDATE yok.
 */
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    startedAt TEXT NOT NULL,
    finishedAt TEXT,
    status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
    configHash TEXT NOT NULL,
    mockCategories TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE keyword_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    runId INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    volume INTEGER NOT NULL,
    difficulty REAL NOT NULL,
    cpc REAL NOT NULL,
    intent TEXT NOT NULL,
    clusterId TEXT NOT NULL,
    clientRank INTEGER,
    UNIQUE (runId, keyword)
  );

  CREATE TABLE serp_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    runId INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    position INTEGER NOT NULL,
    domain TEXT NOT NULL,
    url TEXT NOT NULL,
    hasFeaturedSnippet INTEGER NOT NULL DEFAULT 0,
    hasAiOverview INTEGER NOT NULL DEFAULT 0,
    UNIQUE (runId, keyword, position)
  );

  CREATE TABLE backlinks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    runId INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    refDomains INTEGER NOT NULL,
    backlinkCount INTEGER NOT NULL,
    domainAuthority REAL NOT NULL,
    UNIQUE (runId, domain)
  );

  CREATE TABLE tech_audits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    runId INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    lcpMs REAL NOT NULL,
    inpMs REAL NOT NULL,
    cls REAL NOT NULL,
    performanceScore REAL NOT NULL,
    issues TEXT NOT NULL DEFAULT '[]',
    UNIQUE (runId, url)
  );

  CREATE TABLE ai_visibility_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    runId INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    model TEXT NOT NULL,
    sampleIndex INTEGER NOT NULL,
    clientMentioned INTEGER NOT NULL,
    competitorsMentioned TEXT NOT NULL DEFAULT '[]',
    answerExcerpt TEXT NOT NULL DEFAULT '',
    UNIQUE (runId, query, model, sampleIndex)
  );

  CREATE TABLE gsc_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    runId INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    clicks INTEGER NOT NULL,
    impressions INTEGER NOT NULL,
    ctr REAL NOT NULL,
    avgPosition REAL NOT NULL,
    UNIQUE (runId, query)
  );

  CREATE TABLE competitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    runId INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    appearanceRate REAL NOT NULL,
    classification TEXT NOT NULL,
    isRealCompetitor INTEGER NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('seed', 'discovered')),
    UNIQUE (runId, domain)
  );

  CREATE INDEX idx_keyword_snapshots_run ON keyword_snapshots(runId);
  CREATE INDEX idx_serp_results_run ON serp_results(runId);
  CREATE INDEX idx_ai_samples_run ON ai_visibility_samples(runId);
  `,
  // v2 — web-vitals attribution kırılımı (metriğin NEDEN kötü olduğu) + eksik kalan tech indeksi.
  // Eski satırlar '{}' ile gelir ve okuma tarafında null'a çözülür.
  `
  ALTER TABLE tech_audits ADD COLUMN attribution TEXT NOT NULL DEFAULT '{}';
  CREATE INDEX idx_tech_audits_run ON tech_audits(runId);
  `,
  // v3 — web-vitals RUM örnekleri. Bilerek runId'ye BAĞLI DEĞİL: alan verisi
  // gerçek kullanıcılardan sürekli akar, çalıştırmalardan bağımsızdır.
  // Lab'ın ölçemediği INP'nin tek kaynağı budur.
  `
  CREATE TABLE rum_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receivedAt TEXT NOT NULL,
    url TEXT NOT NULL,
    metric TEXT NOT NULL,
    value REAL NOT NULL,
    rating TEXT NOT NULL,
    navigationType TEXT,
    attribution TEXT NOT NULL DEFAULT '{}'
  );

  CREATE INDEX idx_rum_samples_lookup ON rum_samples(url, metric, receivedAt);
  `,
  // v4 — Lighthouse SEO kategorisi (document-title, meta-description, canonical, ...).
  // Ek istek/anahtar/kota gerektirmez: performans denetimiyle aynı Lighthouse koşusundan gelir.
  // seoScore null olabilir (SEO kategorisi çalışmadıysa); seoFindings 'attribution' ile aynı desen.
  `
  ALTER TABLE tech_audits ADD COLUMN seoScore REAL;
  ALTER TABLE tech_audits ADD COLUMN seoFindings TEXT NOT NULL DEFAULT '[]';
  `,
  // v5 — GSC URL Inspection: indeksleme durumu, canonical seçimi, robots durumu.
  // Yalnız müşterinin kendi sayfaları için mevcut (servis hesabı rakip mülke erişemez).
  `
  CREATE TABLE index_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    runId INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    coverageState TEXT NOT NULL,
    robotsTxtState TEXT NOT NULL,
    indexingState TEXT NOT NULL,
    pageFetchState TEXT NOT NULL,
    googleCanonical TEXT,
    userCanonical TEXT,
    lastCrawlTime TEXT,
    UNIQUE (runId, url)
  );

  CREATE INDEX idx_index_status_run ON index_status(runId);
  `,
  // v6 — GSC 'page' boyutu: aynı sorguda birden fazla sayfanın gösterime girdiği
  // durum (yamyamlık/cannibalization) artık görünür. UNIQUE (runId, query) →
  // (runId, query, page) SQLite'ta ALTER ile değişmiyor, tablo yeniden kurulur.
  // Eski satırlara page = '' verilir — "sayfa bilinmiyor" demek, detectCannibalization
  // boş page'i eler, veri kaybolmaz (INSERT...SELECT ile önce kopyalanır).
  `
  CREATE TABLE gsc_metrics_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    runId INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    page TEXT NOT NULL DEFAULT '',
    clicks INTEGER NOT NULL,
    impressions INTEGER NOT NULL,
    ctr REAL NOT NULL,
    avgPosition REAL NOT NULL,
    UNIQUE (runId, query, page)
  );

  INSERT INTO gsc_metrics_new (id, runId, query, page, clicks, impressions, ctr, avgPosition)
  SELECT id, runId, query, '', clicks, impressions, ctr, avgPosition FROM gsc_metrics;

  DROP TABLE gsc_metrics;
  ALTER TABLE gsc_metrics_new RENAME TO gsc_metrics;

  CREATE INDEX idx_gsc_metrics_run ON gsc_metrics(runId);
  `,
  // v7 — CrUX (Chrome UX Report) alan verisi: gerçek kullanıcı p75 ölçümü, rakipler
  // dahil. formFactor şimdilik hep 'ALL_FORM_FACTORS' (cihaz bazlı sorgu yok, tek
  // çağrı) ama şema ileride cihaz kırılımına açık kalsın diye UNIQUE'e dahil.
  // lcpMs/inpMs/cls ayrı ayrı null olabilir — CrUX yetersiz trafikte metriği sessizce
  // atlar, 404 değil "veri yok" demektir.
  `
  CREATE TABLE field_cwv (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    runId INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    formFactor TEXT NOT NULL,
    lcpMs REAL,
    inpMs REAL,
    cls REAL,
    UNIQUE (runId, url, formFactor)
  );

  CREATE INDEX idx_field_cwv_run ON field_cwv(runId);
  `,
  // v8 — Faz 2 crawler: ham on-page veri (pages) + iç link grafiği kenarları (page_links).
  // Bulgular (title/H1/canonical eksik, kırık link, öksüz sayfa vb.) BURADA saklanmaz —
  // indexingFindings/cannibalizationFindings'le aynı felsefe: her run'da ham veriden
  // yeniden hesaplanır (detectOnPageIssues/detectLinkIssues/detectCrawlabilityIssues).
  // `pages.internalLinks` alanı burada YOK — round-trip'te internalLinks hep boş döner,
  // asıl link grafiği ayrı page_links tablosunda; mevcut run'ın canlı bulgu tespiti zaten
  // DB'den değil bellekteki CollectedData'dan çalışıyor, bu kayıp bir şey kaybettirmiyor.
  `
  CREATE TABLE pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    runId INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    statusCode INTEGER,
    finalUrl TEXT,
    fetchError TEXT,
    title TEXT,
    metaDescription TEXT,
    canonicalUrl TEXT,
    h1s TEXT NOT NULL DEFAULT '[]',
    headingOrder TEXT NOT NULL DEFAULT '[]',
    hasSchemaOrg INTEGER NOT NULL,
    schemaTypes TEXT NOT NULL DEFAULT '[]',
    ogComplete INTEGER NOT NULL,
    imagesMissingAlt INTEGER NOT NULL,
    wordCount INTEGER NOT NULL,
    metaRobots TEXT,
    externalLinkCount INTEGER NOT NULL,
    UNIQUE (runId, url)
  );

  CREATE TABLE page_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    runId INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    sourceUrl TEXT NOT NULL,
    targetUrl TEXT NOT NULL,
    anchorText TEXT NOT NULL DEFAULT '',
    isInternal INTEGER NOT NULL,
    UNIQUE (runId, sourceUrl, targetUrl)
  );

  CREATE INDEX idx_pages_run ON pages(runId);
  CREATE INDEX idx_page_links_run ON page_links(runId);
  `,
  // Faz 4.1 — CSR sahte-bulgu koruması: bkz. crawlHtmlParser.ts detectLikelyClientRendered.
  `
  ALTER TABLE pages ADD COLUMN likelyClientRendered INTEGER NOT NULL DEFAULT 0;
  `,
  // Faz 4.2 — tıklama derinliği (BFS seviyesi): bkz. crawlSite.ts collectCrawl.
  `
  ALTER TABLE pages ADD COLUMN depth INTEGER NOT NULL DEFAULT 0;
  `,
  // Faz 4.3 — hreflang etiketleri (canlı crawl): bkz. crawlHtmlParser.ts hreflangsOf.
  `
  ALTER TABLE pages ADD COLUMN hreflangs TEXT NOT NULL DEFAULT '[]';
  `,
  // Faz 4.4 — "rakipte var, sende yok" keyword'leri (DataForSEO Labs domain_intersection).
  // field_cwv/page_links'teki aynı UNIQUE(runId, doğalAnahtar) deseni — Faz X.2'deki
  // field_cwv UNIQUE hatasından ders alınarak baştan dedupe'lu tasarlandı.
  `
  CREATE TABLE keyword_gaps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    runId INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    competitorDomain TEXT NOT NULL,
    competitorPosition INTEGER NOT NULL,
    volume INTEGER,
    UNIQUE (runId, keyword, competitorDomain)
  );

  CREATE INDEX idx_keyword_gaps_run ON keyword_gaps(runId);
  `,
  // Faz 5.1 — HTTP yanıt başlıkları: X-Robots-Tag (HTML'de izi olmayan indeksleme engeli),
  // Content-Type, Link header hreflang'ları, mevcut güvenlik başlıklarının adları.
  // bkz. crawlHeaderParser.ts.
  `
  ALTER TABLE pages ADD COLUMN xRobotsTag TEXT;
  ALTER TABLE pages ADD COLUMN contentType TEXT;
  ALTER TABLE pages ADD COLUMN headerHreflangs TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE pages ADD COLUMN securityHeaders TEXT NOT NULL DEFAULT '[]';
  `,
  // Faz 5.2 — yönlendirme zinciri: fetch()'in otomatik takibi yerine elle izlenir.
  // bkz. crawlProvider.ts fetchText.
  `
  ALTER TABLE pages ADD COLUMN redirectChain TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE pages ADD COLUMN redirectLoop INTEGER NOT NULL DEFAULT 0;
  `,
  // Faz 5.3 — schema.org alan doğrulaması: her JSON-LD bloğunun VAR OLAN alan adları (değerler
  // değil). schemaTypes zaten vardı ama hiçbir kuralda kullanılmıyordu (ölü veri) — bu sütun
  // kural motorunun "zorunlu alan eksik mi" kontrolü yapabilmesini sağlar. bkz. crawlHtmlParser.ts.
  `
  ALTER TABLE pages ADD COLUMN schemaFields TEXT NOT NULL DEFAULT '[]';
  `,
  // Faz 5.4 — keyword ↔ içerik köprüsü: sayfanın görünür body metni (kırpılmış, bkz.
  // config/constants.ts MAX_BODY_TEXT_LENGTH). wordCount yalnız SAYIYI tutuyordu; "hedef
  // keyword bu sayfada geçiyor mu" sorusu ham metin olmadan cevaplanamaz.
  `
  ALTER TABLE pages ADD COLUMN bodyText TEXT NOT NULL DEFAULT '';
  `,
  // Faz 5.5 — tarama yüzeyi genişlemesi: viewport meta, <html lang>, karma içerik (mixed
  // content), boyutsuz görsel sayısı. bkz. crawlHtmlParser.ts.
  `
  ALTER TABLE pages ADD COLUMN viewportMeta TEXT;
  ALTER TABLE pages ADD COLUMN langAttribute TEXT;
  ALTER TABLE pages ADD COLUMN mixedContentCount INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE pages ADD COLUMN imagesMissingDimensions INTEGER NOT NULL DEFAULT 0;
  `,
  // Dış denetim bulgusu (2026-08-31, BLOKER 3) — sitemapUrls hiç kalıcı değildi (v8 yorumu),
  // bu yüzden önceki run'ın bulguları `snapshotToCollectedData`'dan yeniden hesaplanırken
  // sitemap her zaman boş dönüyordu ve taranabilirlik/öksüz-sayfa bulguları her koşuda
  // sahte biçimde "🆕 yeni" işaretleniyordu. Diğer fact tablolarıyla aynı desen — açık
  // runId index'i EKLENMEDİ (UNIQUE(runId, url) zaten runId'yi soldan kapsayan bir
  // autoindex üretir, bkz. dış denetim bulgusu Faz B/12).
  `
  CREATE TABLE sitemap_urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    runId INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    UNIQUE (runId, url)
  );
  `,
]

export const applyMigrations = (db: Database): void => {
  const currentVersion = db.pragma('user_version', { simple: true }) as number
  if (currentVersion > MIGRATIONS.length) {
    throw new StorageError(
      `Veritabanı şeması bu koddan daha yeni (v${currentVersion} > v${MIGRATIONS.length}). Kodu güncelleyin.`,
    )
  }
  const pending = MIGRATIONS.slice(currentVersion)
  for (const [offset, migration] of pending.entries()) {
    const targetVersion = currentVersion + offset + 1
    try {
      db.transaction(() => {
        db.exec(migration)
        db.pragma(`user_version = ${targetVersion}`)
      })()
    } catch (cause) {
      throw new StorageError(`Migration v${targetVersion} uygulanamadı`, { cause })
    }
  }
}
