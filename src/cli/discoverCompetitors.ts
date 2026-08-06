import { discoverCompetitors } from '../analysis/discoverCompetitors.js'
import { collectSerps } from '../collectors/collectors.js'
import { loadEnv } from '../config/env.js'
import { loadProjectConfig } from '../config/loadConfig.js'
import { createLogger } from '../core/logger.js'
import { selectProviders } from '../providers/registry.js'

const logger = createLogger('discover')

/** Yalnız SERP toplayıp rakip keşfi çalıştırır, konsola tablo basar. DB'ye yazmaz. */
const main = async (): Promise<void> => {
  try {
    const config = loadProjectConfig('config/project.json')
    const providers = selectProviders(loadEnv(), config)
    if (providers.mockCategories.length > 0) {
      logger.warn('⚠ MOCK MODE — sonuçlar sentetik SERP verisine dayanıyor.')
    }

    const serpResult = await collectSerps(providers, config)
    if (!serpResult.ok) {
      logger.error(`SERP toplanamadı: ${serpResult.error.message}`)
      process.exitCode = 1
      return
    }

    const competitors = discoverCompetitors(serpResult.value, config)
    const header = `${'DOMAIN'.padEnd(28)} ${'ORAN'.padStart(6)}  ${'SINIF'.padEnd(12)} ${'GERÇEK?'.padEnd(8)} KAYNAK`
    console.log(`\n${header}\n${'-'.repeat(header.length)}`)
    for (const competitor of competitors) {
      console.log(
        `${competitor.domain.padEnd(28)} ${`%${Math.round(competitor.appearanceRate * 100)}`.padStart(6)}  ${competitor.classification.padEnd(12)} ${(competitor.isRealCompetitor ? 'evet' : '—').padEnd(8)} ${competitor.source}`,
      )
    }
    const realCount = competitors.filter((competitor) => competitor.isRealCompetitor).length
    console.log(`\n${competitors.length} domain incelendi, ${realCount} gerçek rakip.\n`)
  } catch (error) {
    logger.error('Rakip keşfi başarısız oldu.', error)
    process.exitCode = 1
  }
}

void main()
