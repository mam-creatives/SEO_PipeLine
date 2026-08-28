import { collectSourceCode } from '../codeaudit/collectSourceCode.js'
import { computeCodeAuditFindings } from '../codeaudit/computeCodeAuditFindings.js'
import { loadProjectConfig } from '../config/loadConfig.js'
import { sortFindings } from '../core/findings.js'
import { createLogger } from '../core/logger.js'
import { resolveCliPaths } from './args.js'

const logger = createLogger('codeaudit')

const SEVERITY_ICON: Readonly<Record<string, string>> = { critical: '🔴', high: '🟡', medium: '🔵', low: '⚪' }

/**
 * Kod denetimini TEK BAŞINA çalıştırır — `npm run research`'ün parçası değil, hiçbir API
 * anahtarı gerektirmez (Katman 0'ın "anahtarsız çalışmalı" ilkesinin somut hali). Aynı
 * denetim `npm run research` sırasında da otomatik çalışır (`config.codePath` varsa) ve
 * ana rapora "Kod Denetimi" bölümü olarak girer — bu komut o adımı beklemeden hızlı bakış içindir.
 *
 * Kullanım: npm run codeaudit [-- --config <yol>] [-- --code <yol>]
 */
const main = (): void => {
  try {
    const paths = resolveCliPaths(process.argv.slice(2), (configPath) => loadProjectConfig(configPath).domain)
    const config = loadProjectConfig(paths.configPath)
    const codePath = paths.codePathOverride ?? config.codePath

    if (codePath === undefined) {
      console.log('\nKod denetimi atlandı: codePath yapılandırılmamış.')
      console.log('config/project.json\'a "codePath": "/yol/kaynak-kodu" ekleyin ya da --code <yol> verin.\n')
      return
    }

    console.log(`\nKod denetimi: ${codePath}`)
    console.log('─'.repeat(64))

    const { sourceFiles, detectedStacks, truncated } = collectSourceCode(codePath)
    console.log(`Okunan dosya: ${sourceFiles.length}${truncated ? ' (SINIRA ULAŞILDI — ağaçta daha fazla dosya var)' : ''}`)
    console.log(`Tespit edilen stack: ${detectedStacks.length === 0 ? '(tanınmadı)' : detectedStacks.join(', ')}`)

    if (sourceFiles.length === 0) {
      console.log('\nOkunabilir dosya bulunamadı — yol doğru mu, izin var mı kontrol edin.\n')
      return
    }

    const findings = sortFindings(computeCodeAuditFindings(sourceFiles, detectedStacks))
    console.log(`\nBulgu sayısı: ${findings.length}`)
    console.log('─'.repeat(64))

    for (const finding of findings) {
      const location = finding.codeLocation == null ? '' : ` [${finding.codeLocation.file}${finding.codeLocation.line === null ? '' : `:${finding.codeLocation.line}`}]`
      console.log(`  ${SEVERITY_ICON[finding.severity] ?? '•'} ${finding.title}${location}`)
      console.log(`      ${finding.evidence}`)
    }
    console.log('')
  } catch (error) {
    logger.error('Kod denetimi çalıştırılamadı.', error)
    process.exitCode = 1
  }
}

main()
