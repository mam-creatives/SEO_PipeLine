import { loadProjectConfig } from '../config/loadConfig.js'
import { createLogger } from '../core/logger.js'
import { resolveCliPaths } from './args.js'
import { runResearch } from './researchPipeline.js'

const logger = createLogger('cli')

const main = async (): Promise<void> => {
  try {
    const paths = resolveCliPaths(process.argv.slice(2), (configPath) => loadProjectConfig(configPath).domain)
    const outcome = await runResearch({
      configPath: paths.configPath,
      dbPath: paths.dbPath,
      reportsDir: 'reports',
    })
    logger.info(outcome.headline)
    logger.info(`Markdown: ${outcome.markdownPath}`)
    logger.info(`HTML:     ${outcome.htmlPath}`)
  } catch (error) {
    logger.error('Araştırma çalıştırması başarısız oldu.', error)
    process.exitCode = 1
  }
}

void main()
