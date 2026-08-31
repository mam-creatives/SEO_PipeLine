import { createLogger } from '../core/logger.js'
import { discoverClients } from './discoverClients.js'
import { hasHelpFlag } from './help.js'
import { formatStatusTable, readClientStatus } from './statusPipeline.js'

const logger = createLogger('status')
const CONFIG_DIR = 'config'
const LOGS_DIR = 'logs'

const USAGE = `Kullanım: npm run status

config/ altındaki her müşteri için son çalıştırma özetini (tarih, run sayısı, keyword
kapsamı) tek bir tabloda gösterir. Yeni veri toplamaz.

  --help, -h   bu metni gösterir`

/**
 * İnce giriş noktası — mantık `statusPipeline.ts`'te yaşar ve HİÇBİR test dosyasından
 * import edilmez (researchAll.ts/researchAllPipeline.ts ayrımıyla aynı desen — X.2'de
 * bunun tersi bir üretim hatasına yol açmıştı).
 */
const main = (): void => {
  if (hasHelpFlag(process.argv.slice(2))) {
    console.log(USAGE)
    return
  }
  const targets = discoverClients(CONFIG_DIR, LOGS_DIR)
  if (targets.length === 0) {
    logger.warn(`${CONFIG_DIR} altında hiç geçerli müşteri config'i bulunamadı.`)
    return
  }

  const rows = targets.map(readClientStatus)
  logger.info(formatStatusTable(rows))
}

main()
