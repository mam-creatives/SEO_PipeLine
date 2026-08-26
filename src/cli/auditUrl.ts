import { diagnoseCwv } from '../analysis/cwv/diagnose.js'
import type { CwvFinding } from '../analysis/cwv/types.js'
import { createLogger } from '../core/logger.js'
import { createLighthouseProvider } from '../providers/real/lighthouseProvider.js'

const logger = createLogger('audit')

const SEVERITY_MARKER: Readonly<Record<CwvFinding['severity'], string>> = {
  critical: '🔴 KRİTİK',
  high: '🟡 ÖNEMLİ',
  medium: '🔵 ORTA',
  low: '⚪ BİLGİ',
}

const printFinding = (finding: CwvFinding, index: number): void => {
  console.log(`\n${index + 1}. ${SEVERITY_MARKER[finding.severity]} — ${finding.title}`)
  console.log(`   Metrik: ${finding.metric} / ${finding.phase}`)
  if (finding.culpritSelector !== null) console.log(`   Suçlu element: ${finding.culpritSelector}`)
  console.log(`\n   ${finding.explanation}`)
  if (finding.fixSnippet !== null) {
    console.log('\n   ÇÖZÜM:')
    for (const line of finding.fixSnippet.split('\n')) console.log(`     ${line}`)
  }
}

/**
 * Tek bir URL'yi lokal Lighthouse ile denetler ve web-vitals attribution modeline
 * dayalı teşhis + kopyalanabilir düzeltmeleri konsola basar. DB'ye yazmaz.
 *
 * Kullanım: npm run audit -- https://example.com/
 */
const main = async (): Promise<void> => {
  const url = process.argv[2]
  if (url === undefined || !/^https?:\/\//i.test(url)) {
    logger.error('Kullanım: npm run audit -- https://example.com/')
    process.exitCode = 1
    return
  }

  logger.info(`${url} denetleniyor (lokal Lighthouse, mobil öykünme)... bu 10-30sn sürebilir.`)
  const result = await createLighthouseProvider().auditUrl(url)
  if (!result.ok) {
    logger.error(`Denetim başarısız: ${result.error.message}`)
    process.exitCode = 1
    return
  }

  const audit = result.value
  const diagnosis = diagnoseCwv(audit)

  console.log(`\n${'='.repeat(72)}`)
  console.log(`CORE WEB VITALS TEŞHİSİ — ${audit.url}`)
  console.log('='.repeat(72))
  console.log(`\nPerformans skoru : ${audit.performanceScore}/100`)
  console.log(`LCP              : ${Math.round(audit.lcpMs)}ms  [${diagnosis?.ratings.LCP ?? '?'}]`)
  console.log(`CLS              : ${audit.cls.toFixed(3)}  [${diagnosis?.ratings.CLS ?? '?'}]`)
  console.log('INP              : ölçülmedi — lab ortamı INP ölçemez, gerçek etkileşim (RUM) gerekir')

  const lcp = audit.attribution?.lcp
  if (lcp !== undefined && lcp !== null) {
    console.log(`\nLCP FAZ KIRILIMI (suçlu: ${lcp.target ?? 'bilinmiyor'})`)
    console.log(`  Sunucu yanıtı (TTFB)      : ${Math.round(lcp.timeToFirstByte)}ms`)
    console.log(`  Kaynak keşfi (delay)      : ${Math.round(lcp.resourceLoadDelay)}ms`)
    console.log(`  Kaynak indirme (duration) : ${Math.round(lcp.resourceLoadDuration)}ms`)
    console.log(`  Element boyama (render)   : ${Math.round(lcp.elementRenderDelay)}ms`)
    if (lcp.url === null) console.log('  → LCP bir METİN; kaynak web fontudur.')
  }

  const findings = diagnosis?.findings ?? []
  if (findings.length === 0) {
    console.log('\nFaz bütçelerini aşan bir sorun bulunamadı.')
  } else {
    console.log(`\n${'-'.repeat(72)}\nÖNCELİKLİ DÜZELTMELER (${findings.length})\n${'-'.repeat(72)}`)
    findings.forEach(printFinding)
  }

  if (audit.issues.length > 0) {
    console.log(`\n${'-'.repeat(72)}\nEK TESPİTLER\n${'-'.repeat(72)}`)
    for (const issue of audit.issues) console.log(`  • ${issue}`)
  }
  console.log('')
}

void main()
