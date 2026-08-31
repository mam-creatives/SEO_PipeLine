import { loadProjectConfig } from '../config/loadConfig.js'
import { createLogger } from '../core/logger.js'
import { createRumCollector } from '../rum/collector.js'
import { countRumSamples, MIN_RUM_SAMPLES, readFieldAudit } from '../rum/rumRepository.js'
import { buildCdnSnippet, buildNpmSnippet } from '../rum/snippet.js'
import { openDatabase } from '../storage/db.js'

const logger = createLogger('rum')

const DEFAULT_PORT = 8787

const printUsage = (): void => {
  logger.error(
    'Kullanım:\n' +
      '  npm run rum -- snippet [endpoint]   web-vitals snippet kodunu yazdırır\n' +
      '  npm run rum -- serve [port]         beacon toplayıcıyı başlatır\n' +
      '  npm run rum -- status               toplanan örnekleri özetler',
  )
}

const main = (): void => {
  const command = process.argv[2]

  if (command === '--help' || command === '-h') {
    printUsage()
    return
  }

  if (command === 'snippet') {
    const endpoint = process.argv[3] ?? `http://localhost:${DEFAULT_PORT}/`
    console.log('\n--- npm ile (Next.js/Vite — önerilen) ---\n')
    console.log(buildNpmSnippet({ endpoint }))
    console.log('\n--- derleme adımı olmayan siteler için ---\n')
    console.log(buildCdnSnippet({ endpoint }))
    return
  }

  if (command === 'serve') {
    const port = Number(process.argv[3] ?? DEFAULT_PORT)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      logger.error(`Geçersiz port: ${process.argv[3]}`)
      process.exitCode = 1
      return
    }
    // Dış denetim bulgusu (2026-08-31) — önceden allowOrigin: '*' sabitti (herkese açık).
    // Artık config.domain'in apex + www varyantlarıyla sınırlı — hem CORS başlığı hem
    // sunucu-taraflı 403 reddi bu listeye göre çalışır (bkz. collector.ts yorumu).
    const config = loadProjectConfig('config/project.json')
    const allowedOrigins = [`https://${config.domain}`, `https://www.${config.domain}`]
    const db = openDatabase('data/seo.db')
    const server = createRumCollector(db, { port, allowedOrigins })
    server.listen(port, () => {
      logger.info(`RUM toplayıcı http://localhost:${port}/ adresinde dinliyor. Durdurmak için Ctrl+C.`)
    })
    const shutdown = (): void => {
      server.close(() => {
        db.close()
        process.exit(0)
      })
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
    return
  }

  if (command === 'status') {
    const config = loadProjectConfig('config/project.json')
    const db = openDatabase('data/seo.db')
    try {
      const total = countRumSamples(db)
      logger.info(`Toplam RUM örneği: ${total} (metrik başına en az ${MIN_RUM_SAMPLES} gerekiyor)`)
      for (const url of config.auditUrls) {
        const audit = readFieldAudit(db, url)
        if (audit === null) {
          console.log(`  ${url} — yeterli örnek yok`)
          continue
        }
        console.log(
          `  ${url} — LCP ${Math.round(audit.lcpMs)}ms · INP ${Math.round(audit.inpMs)}ms · CLS ${audit.cls.toFixed(3)} (75. persentil)`,
        )
      }
    } finally {
      db.close()
    }
    return
  }

  printUsage()
  process.exitCode = 1
}

main()
