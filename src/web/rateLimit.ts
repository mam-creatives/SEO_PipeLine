import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const IP_RATE_LIMIT_WINDOW_MS = 60_000
/** Hafif, kamuya açık bir araç için cömert değil — kötüye kullanımı caydıracak kadar sıkı. */
const IP_MAX_REQUESTS_PER_WINDOW = 3

/** `src/rum/collector.ts`'teki `createRateLimiter` ile birebir aynı desen — IP başına sabit pencere. */
export const createIpRateLimiter = (
  windowMs: number = IP_RATE_LIMIT_WINDOW_MS,
  maxPerWindow: number = IP_MAX_REQUESTS_PER_WINDOW,
) => {
  const hits = new Map<string, { count: number; windowStart: number }>()
  return (key: string): boolean => {
    const now = Date.now()
    const entry = hits.get(key)
    if (entry === undefined || now - entry.windowStart > windowMs) {
      hits.set(key, { count: 1, windowStart: now })
      return true
    }
    entry.count += 1
    return entry.count <= maxPerWindow
  }
}

export interface DailyBudget {
  /** Kota varsa 1 tüketir ve true döner; kota bittiyse HİÇBİR ŞEY yapmadan false döner. */
  readonly tryConsume: () => boolean
  readonly remaining: () => number
  readonly close: () => void
}

const todayKey = (): string => new Date().toISOString().slice(0, 10)

/**
 * Dış denetim bulgusu (2026-09-02, Versiyon A) — IP-bazlı sınır TEK bir kötüye kullanıcıyı
 * durdurur ama SerpApi'nin ücretsiz kotası (250/ay ≈ günde ~8) HESAP GENELİNDE paylaşılır;
 * çok sayıda farklı IP'den gelen meşru trafik bile kotayı bir günde tüketebilir. Bu sayaç
 * güne özel, yeniden başlatmalar arasında hayatta kalsın diye küçük/bağımsız bir SQLite
 * dosyasında tutulur — ana `data/<müşteri>.db` dosyalarıyla KARIŞTIRILMAZ; plan bilerek
 * ziyaretçi taramalarının ajansın gerçek müşteri veritabanına hiç yazılmamasını istiyor.
 */
export const openDailyBudget = (dbPath: string, dailyLimit: number): DailyBudget => {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.exec('CREATE TABLE IF NOT EXISTS daily_budget (day TEXT PRIMARY KEY, used INTEGER NOT NULL DEFAULT 0)')

  const readUsed = (day: string): number => {
    const row = db.prepare('SELECT used FROM daily_budget WHERE day = ?').get(day) as { used: number } | undefined
    return row?.used ?? 0
  }

  return {
    tryConsume: (): boolean => {
      const day = todayKey()
      if (readUsed(day) >= dailyLimit) return false
      db.prepare('INSERT INTO daily_budget (day, used) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET used = used + 1').run(day)
      return true
    },
    remaining: (): number => Math.max(dailyLimit - readUsed(todayKey()), 0),
    close: (): void => {
      db.close()
    },
  }
}
