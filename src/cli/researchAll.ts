import { loadEnv } from '../config/env.js'
import { createLogger } from '../core/logger.js'
import { formatRunSummary, resolveTelegramConfig, sendTelegramMessage, shouldNotify } from '../notify/telegram.js'
import { discoverClients } from './discoverClients.js'
import { hasHelpFlag } from './help.js'
import { formatSummary, runAllClients, type ClientRunResult } from './researchAllPipeline.js'

const logger = createLogger('research-all')
const CONFIG_DIR = 'config'
const LOGS_DIR = 'logs'

const USAGE = `Kullanım: npm run research-all

config/ altındaki HER geçerli müşteri config'i için sırayla \`npm run research\` çalıştırır
(paralel değil — Lighthouse süreç içi paralel koşamaz). Sonunda Telegram yapılandırılmışsa
başarısız müşteriler için bildirim gönderir.

  --help, -h   bu metni gösterir`

/**
 * En az bir müşteri başarısız olduysa ve Telegram yapılandırılmışsa bildirir.
 * Gönderim başarısız olsa bile batch 'başarısız' sayılmaz — yalnız loglanır
 * (bkz. telegram.ts sendTelegramMessage yorumu).
 */
const notifyIfNeeded = async (results: readonly ClientRunResult[]): Promise<void> => {
  if (!shouldNotify(results)) return

  const telegramConfig = resolveTelegramConfig(loadEnv('.env'))
  if (telegramConfig === null) return

  const sent = await sendTelegramMessage(telegramConfig, formatRunSummary(results))
  if (!sent.ok) {
    logger.error('Telegram bildirimi gönderilemedi.', sent.error)
  }
}

/**
 * İnce giriş noktası — mantık `researchAllPipeline.ts`'te yaşar. Bu dosya BİLEREK
 * test edilmez ve HİÇBİR test dosyasından import edilmez (research.ts/researchPipeline.ts
 * ayrımıyla aynı desen): `void main()` modül yüklenir yüklenmez çalışır, bu dosyayı
 * import etmek gerçek çocuk süreçler başlatır.
 */
const main = async (): Promise<void> => {
  if (hasHelpFlag(process.argv.slice(2))) {
    console.log(USAGE)
    return
  }
  const targets = discoverClients(CONFIG_DIR, LOGS_DIR)
  if (targets.length === 0) {
    logger.warn(`${CONFIG_DIR} altında hiç geçerli müşteri config'i bulunamadı.`)
    return
  }

  logger.info(`${targets.length} müşteri bulundu: ${targets.map((target) => target.domain).join(', ')}`)
  const results = await runAllClients(targets)
  logger.info(formatSummary(results))
  await notifyIfNeeded(results)

  if (results.some((result) => result.exitCode !== 0)) {
    process.exitCode = 1
  }
}

void main()
