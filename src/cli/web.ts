import { loadEnv } from '../config/env.js'
import { createLogger } from '../core/logger.js'
import { openDailyBudget } from '../web/rateLimit.js'
import { createWebServer } from '../web/server.js'
import { hasHelpFlag } from './help.js'

const logger = createLogger('web')
const DEFAULT_PORT = 8080
const DAILY_BUDGET_DB_PATH = 'data/web-rate-limit.db'
const SERP_DAILY_BUDGET = 8

const USAGE = `Kullanım: npm run web -- [port] [--origins <origin1,origin2>]

Versiyon A: kamuya açık, hafif SEO ön-kontrol web aracını başlatır. Ziyaretçi yalnızca
domain + kendi AI-görünürlük sorularını girer; GSC/DataForSEO/tam site taraması yok.
Hiçbir tarama ana müşteri veritabanına (data/<müşteri>.db) yazılmaz.

  [port]              varsayılan 8080
  --origins <liste>   virgülle ayrılmış izin verilen origin'ler (ör. https://mamcreatives.com)
                       verilmezse geliştirme modu: her origin kabul edilir
  --help, -h          bu metni gösterir`

const parseOrigins = (argv: readonly string[]): readonly string[] => {
  const index = argv.indexOf('--origins')
  const raw = index === -1 ? undefined : argv[index + 1]
  if (raw === undefined) return []
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
}

const main = (): void => {
  const argv = process.argv.slice(2)
  if (hasHelpFlag(argv)) {
    console.log(USAGE)
    return
  }

  // Dış denetim bulgusu (2026-09-02) — `--origins` verilmediğinde `indexOf` -1 döner,
  // `-1 + 1 = 0` olduğu için ilk pozisyonel argüman (port) YANLIŞLIKLA "origins değeri"
  // sanılıp atlanıyordu — port asla okunmuyor, hep DEFAULT_PORT'a düşülüyordu.
  const originsIndex = argv.indexOf('--origins')
  const portArg = argv.find((arg, index) => !arg.startsWith('--') && (originsIndex === -1 || index !== originsIndex + 1))
  const port = Number(portArg ?? DEFAULT_PORT)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    logger.error(`Geçersiz port: ${portArg}`)
    process.exitCode = 1
    return
  }

  const allowedOrigins = parseOrigins(argv)
  if (allowedOrigins.length === 0) {
    logger.warn('--origins verilmedi — geliştirme modu, TÜM origin\'ler kabul edilecek. Üretimde mutlaka verin.')
  }

  const env = loadEnv()
  const serpBudget = env.SERPAPI_KEY !== undefined ? openDailyBudget(DAILY_BUDGET_DB_PATH, SERP_DAILY_BUDGET) : null

  const server = createWebServer({ allowedOrigins, env, serpBudget })
  server.listen(port, () => {
    logger.info(`Versiyon A web aracı http://localhost:${port}/ adresinde dinliyor. Durdurmak için Ctrl+C.`)
  })

  const shutdown = (): void => {
    server.close(() => {
      serpBudget?.close()
      process.exit(0)
    })
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main()
