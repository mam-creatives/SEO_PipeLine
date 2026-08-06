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
