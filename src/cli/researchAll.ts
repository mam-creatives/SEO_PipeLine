import { createLogger } from '../core/logger.js'
import { discoverClients } from './discoverClients.js'
import { formatSummary, runAllClients } from './researchAllPipeline.js'

const logger = createLogger('research-all')
const CONFIG_DIR = 'config'
const LOGS_DIR = 'logs'

/**
 * İnce giriş noktası — mantık `researchAllPipeline.ts`'te yaşar. Bu dosya BİLEREK
 * test edilmez ve HİÇBİR test dosyasından import edilmez (research.ts/researchPipeline.ts
 * ayrımıyla aynı desen): `void main()` modül yüklenir yüklenmez çalışır, bu dosyayı
 * import etmek gerçek çocuk süreçler başlatır.
 */
const main = async (): Promise<void> => {
  const targets = discoverClients(CONFIG_DIR, LOGS_DIR)
  if (targets.length === 0) {
    logger.warn(`${CONFIG_DIR} altında hiç geçerli müşteri config'i bulunamadı.`)
    return
  }

  logger.info(`${targets.length} müşteri bulundu: ${targets.map((target) => target.domain).join(', ')}`)
  const results = await runAllClients(targets)
  logger.info(formatSummary(results))

  if (results.some((result) => result.exitCode !== 0)) {
    process.exitCode = 1
  }
}

void main()
