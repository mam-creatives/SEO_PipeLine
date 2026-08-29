import { createLogger } from '../core/logger.js'
import { discoverClients } from './discoverClients.js'
import { formatStatusTable, readClientStatus } from './statusPipeline.js'

const logger = createLogger('status')
const CONFIG_DIR = 'config'
const LOGS_DIR = 'logs'

/**
 * İnce giriş noktası — mantık `statusPipeline.ts`'te yaşar ve HİÇBİR test dosyasından
 * import edilmez (researchAll.ts/researchAllPipeline.ts ayrımıyla aynı desen — X.2'de
 * bunun tersi bir üretim hatasına yol açmıştı).
 */
const main = (): void => {
  const targets = discoverClients(CONFIG_DIR, LOGS_DIR)
  if (targets.length === 0) {
    logger.warn(`${CONFIG_DIR} altında hiç geçerli müşteri config'i bulunamadı.`)
    return
  }

  const rows = targets.map(readClientStatus)
  logger.info(formatStatusTable(rows))
}

main()
