import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadProjectConfig } from '../config/loadConfig.js'
import { createLogger } from '../core/logger.js'
import { slugify } from '../core/text.js'

const logger = createLogger('discover-clients')

export interface ClientTarget {
  readonly configPath: string
  readonly domain: string
  readonly slug: string
  readonly dbPath: string
  readonly logPath: string
}

/**
 * `configDir` altındaki her `*.json` dosyasını bir müşteri config'i olarak dener.
 *
 * Ayrıştırılamayan/doğrulanamayan bir dosya TÜM keşfi düşürmez — collectors'ın
 * kısmi-hata felsefesiyle aynı (bkz. runAllCollectors.ts): uyarıyla atlanır,
 * diğer müşteriler etkilenmez.
 *
 * `slug`/`dbPath`, `resolveCliPaths`'in `--config` verildiğinde türettiği yolla
 * BİREBİR aynı olmalı (args.ts: `data/${slugify(domain)}.db`) — ikisi ayrışırsa
 * `status` komutu yanlış DB'ye bakar. Bu yüzden kopyalanmaz, aynı `slugify` çağrılır.
 *
 * `logPath` günün tarihini içerir (`reports/`in `<tarih>_<domain>` deseniyle aynı,
 * bkz. writeReports.ts) — bir orkestratör koşusunun tüm müşterileri aynı tarihte
 * loglanır, çağrı anında sabitlenir.
 */
export const discoverClients = (configDir: string, logsDir: string): readonly ClientTarget[] => {
  let fileNames: string[]
  try {
    fileNames = readdirSync(configDir).filter((name) => name.endsWith('.json'))
  } catch (cause) {
    logger.warn(`Config dizini okunamadı: ${configDir} (${(cause as Error).message})`)
    return []
  }

  const dateLabel = new Date().toISOString().slice(0, 10)
  const targets: ClientTarget[] = []
  for (const fileName of [...fileNames].sort()) {
    const configPath = join(configDir, fileName)
    try {
      const { domain } = loadProjectConfig(configPath)
      const slug = slugify(domain)
      targets.push({
        configPath,
        domain,
        slug,
        dbPath: `data/${slug}.db`,
        logPath: join(logsDir, `${dateLabel}_${slug}.log`),
      })
    } catch (cause) {
      logger.warn(`Config atlandı, doğrulanamadı: ${configPath} (${(cause as Error).message})`)
    }
  }
  return targets
}
