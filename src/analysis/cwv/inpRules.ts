import { INP_PHASE_DOMINANCE, inpPhaseShares, rateMetric, type InpAttribution } from '../../core/cwv.js'
import { estimateImpact, percentLabel, type CwvFinding, type FindingSeverity } from './types.js'

const EFFORT_BY_PHASE = {
  inputDelay: 'medium',
  processingDuration: 'medium',
  presentationDelay: 'small',
} as const

const severityFor = (inpMs: number): FindingSeverity => {
  const rating = rateMetric('INP', inpMs)
  if (rating === 'poor') return 'critical'
  if (rating === 'needs-improvement') return 'high'
  return 'medium'
}

const targetLabel = (attribution: InpAttribution): string =>
  attribution.interactionTarget === null ? 'bir öğe' : attribution.interactionTarget

const inputDelayFinding = (share: number, severity: FindingSeverity, attribution: InpAttribution): CwvFinding => ({
  category: 'cwv',
  metric: 'INP',
  severity,
  phase: 'inputDelay',
  phaseShare: share,
  url: null,
  culpritSelector: attribution.interactionTarget,
  evidence: `Input delay ${Math.round(attribution.inputDelay)}ms`,
  impact: estimateImpact(severity, share),
  effort: EFFORT_BY_PHASE.inputDelay,
  title: `Etkileşim başlarken ana thread meşgul (${percentLabel(share)})`,
  explanation:
    `Kullanıcı ${targetLabel(attribution)} öğesiyle etkileşime geçtiğinde tarayıcı ` +
    `${Math.round(attribution.inputDelay)}ms boyunca olayı işlemeye bile başlayamıyor — ana thread başka bir işle ` +
    `(genelde uzun süren bir script) dolu. Sorun senin olay işleyicinde değil, o an çalışan başka kodda.`,
  fixSnippet:
    `// Uzun işleri parçalara böl ve ana thread'i kullanıcıya geri ver\n` +
    `async function processAll(items) {\n` +
    `  for (const item of items) {\n` +
    `    process(item)\n` +
    `    if (navigator.scheduling?.isInputPending?.()) await scheduler.yield()\n` +
    `  }\n` +
    `}\n\n` +
    `<!-- Kritik olmayan 3. parti script'i preload ETME, önceliğini düşür -->\n` +
    `<script src="https://t.example.net/tag.js" async fetchpriority="low"></script>`,
})

const processingDurationFinding = (
  share: number,
  severity: FindingSeverity,
  attribution: InpAttribution,
): CwvFinding => {
  const scriptNote =
    attribution.longestScriptUrl === null
      ? ''
      : ` En uzun süren script: ${attribution.longestScriptUrl}` +
        (attribution.longestScriptDuration === null
          ? '.'
          : ` (${Math.round(attribution.longestScriptDuration)}ms).`)

  return {
    category: 'cwv',
    metric: 'INP',
    severity,
    phase: 'processingDuration',
    phaseShare: share,
    url: null,
    culpritSelector: attribution.interactionTarget,
    evidence: `İşleme süresi ${Math.round(attribution.processingDuration)}ms`,
    impact: estimateImpact(severity, share),
    effort: EFFORT_BY_PHASE.processingDuration,
    title: `Olay işleyicisi çok uzun çalışıyor (${percentLabel(share)})`,
    explanation:
      `${targetLabel(attribution)} üzerindeki olay işleyicisi ${Math.round(attribution.processingDuration)}ms ` +
      `sürüyor.${scriptNote} Kullanıcıya geri bildirim vermeden önce tüm işi bitirmeye çalışmak INP'yi doğrudan şişirir.`,
    fixSnippet:
      `// Önce görsel geri bildirimi ver, ağır işi bir sonraki kareye ertele\n` +
      `button.addEventListener('click', async () => {\n` +
      `  setPending(true)              // anında boyanır\n` +
      `  await scheduler.yield()       // tarayıcı kareyi çizsin\n` +
      `  await doExpensiveWork()       // ağır iş bundan sonra\n` +
      `})`,
  }
}

const presentationDelayFinding = (
  share: number,
  severity: FindingSeverity,
  attribution: InpAttribution,
): CwvFinding => ({
  category: 'cwv',
  metric: 'INP',
  severity,
  phase: 'presentationDelay',
  phaseShare: share,
  url: null,
  culpritSelector: attribution.interactionTarget,
  evidence: `Sunum gecikmesi ${Math.round(attribution.presentationDelay)}ms`,
  impact: estimateImpact(severity, share),
  effort: EFFORT_BY_PHASE.presentationDelay,
  title: `İşleyici bitti ama kare geç çiziliyor (${percentLabel(share)})`,
  explanation:
    `Olay işleyicisi tamamlandıktan sonra tarayıcının yeni kareyi sunması ` +
    `${Math.round(attribution.presentationDelay)}ms sürüyor. Bu genelde büyük DOM, zorlanmış yeniden düzen ` +
    `(forced reflow) veya pahalı stil hesaplamasından kaynaklanır.`,
  fixSnippet:
    `/* Ekran dışı bileşenlerin düzen/boyama maliyetini izole et */\n` +
    `.card { content-visibility: auto; contain-intrinsic-size: 320px; }\n\n` +
    `// Forced reflow'dan kaçın: okuma ve yazmayı ayır\n` +
    `const heights = items.map((el) => el.offsetHeight)                  // önce tüm okumalar\n` +
    `items.forEach((el, i) => { el.style.height = heights[i] + 'px' })   // sonra tüm yazmalar`,
})

/**
 * INP teşhisi. Lab verisi INP üretemez (gerçek etkileşim gerekir) — bu fonksiyon
 * yalnızca RUM (field) attribution'ı ile anlamlıdır; kaynağı kontrol etmek çağıranın işi.
 */
export const diagnoseInp = (inpMs: number, attribution: InpAttribution): readonly CwvFinding[] => {
  const shares = inpPhaseShares(attribution)
  const severity = severityFor(inpMs)

  return [
    shares.inputDelay > INP_PHASE_DOMINANCE ? inputDelayFinding(shares.inputDelay, severity, attribution) : null,
    shares.processingDuration > INP_PHASE_DOMINANCE
      ? processingDurationFinding(shares.processingDuration, severity, attribution)
      : null,
    shares.presentationDelay > INP_PHASE_DOMINANCE
      ? presentationDelayFinding(shares.presentationDelay, severity, attribution)
      : null,
  ].filter((finding): finding is CwvFinding => finding !== null)
}
