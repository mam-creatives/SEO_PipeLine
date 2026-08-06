import { CLS_LOAD_PHASE_MS, rateMetric, type ClsAttribution } from '../../core/cwv.js'
import type { CwvFinding, FindingSeverity } from './types.js'

const severityFor = (cls: number): FindingSeverity => {
  const rating = rateMetric('CLS', cls)
  if (rating === 'poor') return 'critical'
  if (rating === 'needs-improvement') return 'high'
  return 'medium'
}

const targetLabel = (attribution: ClsAttribution): string =>
  attribution.largestShiftTarget === null ? 'Bir element' : attribution.largestShiftTarget

/** Yükleme sırasındaki kayma: boyutu bildirilmemiş görsel/iframe veya font takası. */
const loadPhaseFinding = (cls: number, attribution: ClsAttribution): CwvFinding => ({
  metric: 'CLS',
  severity: severityFor(cls),
  phase: 'loadShift',
  phaseShare: null,
  culpritSelector: attribution.largestShiftTarget,
  title: 'Sayfa yüklenirken içerik kayıyor',
  explanation:
    `${targetLabel(attribution)} sayfanın ilk ${CLS_LOAD_PHASE_MS / 1000} saniyesinde ` +
    `${attribution.largestShiftValue.toFixed(3)} puanlık kaymaya sebep oluyor. Yükleme aşamasındaki kaymaların ` +
    `neredeyse tamamı tek bir sebepten olur: elementin kaplayacağı yer önceden ayrılmamış — boyutu bildirilmemiş ` +
    `görsel/iframe ya da geç yüklenen fontun metni yeniden akıtması.`,
  fixSnippet:
    `<!-- Görselde width/height ver: tarayıcı en-boy oranından yeri baştan ayırır -->\n` +
    `<img src="/urun.jpg" width="800" height="600" alt="">\n\n` +
    `/* Boyut CSS'ten geliyorsa oranı bildir */\n` +
    `.media { aspect-ratio: 4 / 3; width: 100%; }\n\n` +
    `/* Font takasında metnin yeniden akmasını azalt */\n` +
    `@font-face { font-family: Display; src: url(/fonts/display.woff2) format('woff2');\n` +
    `  font-display: swap; size-adjust: 100%; ascent-override: 90%; }`,
})

/** Geç kayma: reklam, çerez bandı, öneri widget'ı gibi sonradan enjekte edilen içerik. */
const latePhaseFinding = (cls: number, attribution: ClsAttribution): CwvFinding => ({
  metric: 'CLS',
  severity: severityFor(cls),
  phase: 'lateShift',
  phaseShare: null,
  culpritSelector: attribution.largestShiftTarget,
  title: 'Sayfa yüklendikten sonra içerik kayıyor',
  explanation:
    `${targetLabel(attribution)} yüklemeden ${Math.round(attribution.largestShiftTime)}ms sonra ` +
    `${attribution.largestShiftValue.toFixed(3)} puanlık kaymaya sebep oluyor. Bu kadar geç kaymalar genelde ` +
    `sonradan enjekte edilen içerikten gelir: reklam, çerez bandı, sohbet widget'ı, "önerilen ürünler" bloğu. ` +
    `Kullanıcı okurken sayfanın oynaması en rahatsız edici kayma türüdür.`,
  fixSnippet:
    `/* Enjekte edilecek bloğa yerini baştan ayır — içerik gelene kadar boş dursun */\n` +
    `.ad-slot { min-height: 250px; }\n` +
    `.cookie-bar { position: fixed; inset-inline: 0; bottom: 0; }  /* akışı itmez */\n\n` +
    `/* Kaçınılmaz geç değişimleri düzen akışının dışına taşı */\n` +
    `.toast { position: fixed; transform: translateZ(0); }`,
})

/**
 * CLS teşhisi: kaymanın zamanı sebebi belirler — erken kaymalar yükleme (boyut/font),
 * geç kaymalar enjeksiyon kaynaklıdır ve çözümleri farklıdır.
 */
export const diagnoseCls = (cls: number, attribution: ClsAttribution): readonly CwvFinding[] => {
  if (rateMetric('CLS', cls) === 'good') return []
  return [
    attribution.largestShiftTime < CLS_LOAD_PHASE_MS
      ? loadPhaseFinding(cls, attribution)
      : latePhaseFinding(cls, attribution),
  ]
}
