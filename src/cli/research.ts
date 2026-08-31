import { loadProjectConfig } from '../config/loadConfig.js'
import { createLogger } from '../core/logger.js'
import { resolveCliPaths } from './args.js'
import { hasHelpFlag } from './help.js'
import { runResearch } from './researchPipeline.js'

const logger = createLogger('cli')

const USAGE = `Kullanım: npm run research -- [--config <yol>] [--code <yol>]

Tam araştırma döngüsünü çalıştırır: keyword/SERP/backlink/CWV/AI görünürlük/GSC/crawler
verisini toplar, veritabanına kaydeder, önceki çalıştırmayla karşılaştırır, Markdown+HTML
rapor üretir.

  --config <yol>   config/project.json yerine kullanılacak müşteri config dosyası
  --code <yol>     config'teki "codePath"i geçici olarak ezer (kod denetimi için)
  --help, -h       bu metni gösterir`

const main = async (): Promise<void> => {
  const argv = process.argv.slice(2)
  if (hasHelpFlag(argv)) {
    console.log(USAGE)
    return
  }
  try {
    const paths = resolveCliPaths(argv, (configPath) => loadProjectConfig(configPath).domain)
    const outcome = await runResearch({
      configPath: paths.configPath,
      dbPath: paths.dbPath,
      reportsDir: 'reports',
      ...(paths.codePathOverride === undefined ? {} : { codePathOverride: paths.codePathOverride }),
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
