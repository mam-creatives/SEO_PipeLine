import { createLogger } from '../core/logger.js'
import { runResearch } from './researchPipeline.js'

const logger = createLogger('cli')

const main = async (): Promise<void> => {
  try {
    const outcome = await runResearch({
      configPath: 'config/project.json',
      dbPath: 'data/seo.db',
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
