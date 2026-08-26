import {
  dominantTtfbPhase,
  LCP_PHASE_BUDGETS,
  lcpPhaseShares,
  rateMetric,
  type LcpAttribution,
  type TtfbAttribution,
} from '../../core/cwv.js'
import { estimateImpact, percentLabel, type CwvFinding, type FindingSeverity } from './types.js'

/** Fazın niteliğine göre sabit emek etiketi — düzeltmenin kapsamı bulgu tipine göre değişmez. */
const EFFORT_BY_PHASE = {
  timeToFirstByte: 'large',
  resourceLoadDelay: 'small',
  resourceLoadDuration: 'medium',
  elementRenderDelay: 'medium',
} as const

const TTFB_PHASE_LABELS: Readonly<Record<string, string>> = {
  waitingDuration: 'sunucunun isteği işlemeye başlaması (backend/yönlendirme)',
  cacheDuration: 'HTTP önbellek kontrolü',
  dnsDuration: 'DNS çözümlemesi',
  connectionDuration: 'bağlantı kurulumu (TCP/TLS)',
  requestDuration: 'isteğin gönderilip ilk baytın dönmesi',
}

const severityFor = (lcpMs: number): FindingSeverity => {
  const rating = rateMetric('LCP', lcpMs)
  if (rating === 'poor') return 'critical'
  if (rating === 'needs-improvement') return 'high'
  return 'medium'
}

const ttfbFinding = (
  share: number,
  severity: FindingSeverity,
  attribution: LcpAttribution,
  ttfb: TtfbAttribution | null,
): CwvFinding => {
  const detail = (() => {
    if (ttfb === null) return ''
    const dominant = dominantTtfbPhase(ttfb)
    const label = TTFB_PHASE_LABELS[dominant.phase] ?? dominant.phase
    return ` Alt fazlar içinde en uzunu ${label}: ${Math.round(dominant.ms)}ms.`
  })()

  return {
    category: 'cwv',
    metric: 'LCP',
    severity,
    phase: 'timeToFirstByte',
    phaseShare: share,
    url: null,
    culpritSelector: attribution.target,
    evidence: `TTFB ${Math.round(attribution.timeToFirstByte)}ms`,
    impact: estimateImpact(severity, share),
    effort: EFFORT_BY_PHASE.timeToFirstByte,
    title: `Sunucu yanıtı LCP'nin ${percentLabel(share)}'ini alıyor`,
    explanation:
      `TTFB ${Math.round(attribution.timeToFirstByte)}ms — LCP süresinin ${percentLabel(share)}'i daha ilk bayt ` +
      `gelmeden harcanıyor (hedef: ~%${LCP_PHASE_BUDGETS.timeToFirstByte * 100}).${detail} ` +
      `Bu aşama düzelmeden diğer optimizasyonların etkisi sınırlı kalır.`,
    fixSnippet:
      `# HTML yanıtını CDN'de önbelleğe al — stale-while-revalidate TTFB'yi sıfıra yakınlaştırır\n` +
      `Cache-Control: public, max-age=0, s-maxage=300, stale-while-revalidate=86400\n\n` +
      `# Yönlendirme zincirini ölç: her 301/302 tam bir gidiş-dönüş ekler\n` +
      `curl -sIL https://example.com/ | grep -E "^(HTTP|location)"`,
  }
}

const resourceLoadDelayFinding = (
  share: number,
  severity: FindingSeverity,
  attribution: LcpAttribution,
): CwvFinding => {
  // Kaynak fazı var ama URL çıkarılamıyorsa iki ihtimal kalır: web fontu (RUM
  // verisinde metin LCP böyle görünür) ya da CSS `background-image` (lab verisinde
  // snippet'te src olmaz). İkisi de preload ile çözülür, bu yüzden mesaj ikisini de anar.
  // Eskiden yalnız `url === null` bakılıyordu ve rapor 8 saniyelik kaynak indirme
  // gösterirken "LCP bir metin" diyordu.
  const isUnknownResource = attribution.url === null

  return {
    category: 'cwv',
    metric: 'LCP',
    severity,
    phase: 'resourceLoadDelay',
    phaseShare: share,
    url: null,
    culpritSelector: attribution.target,
    evidence: `Kaynak keşif gecikmesi ${Math.round(attribution.resourceLoadDelay)}ms`,
    impact: estimateImpact(severity, share),
    effort: EFFORT_BY_PHASE.resourceLoadDelay,
    title: isUnknownResource
      ? `LCP kaynağı geç keşfediliyor (${percentLabel(share)})`
      : `LCP görseli geç keşfediliyor (${percentLabel(share)})`,
    explanation: isUnknownResource
      ? `LCP kaynağı ilk HTML yanıtında keşfedilemiyor; ${Math.round(attribution.resourceLoadDelay)}ms sadece ` +
        `kaynağın bulunmasını beklemekle geçiyor (hedef: <%${LCP_PHASE_BUDGETS.resourceLoadDelay * 100}). ` +
        `Kaynağın adresi çıkarılamadı — bu genelde iki şeyden biri demektir: CSS içinde tanımlı bir ` +
        `\`background-image\` ya da metni çizen web fontu. Her ikisi de ancak CSS ayrıştırıldıktan sonra ` +
        `keşfedilir, yani tarayıcının preload scanner'ı onları göremez.`
      : `LCP görseli ilk HTML yanıtında keşfedilemiyor; ${Math.round(attribution.resourceLoadDelay)}ms sadece ` +
        `kaynağın bulunmasını beklemekle geçiyor (hedef: <%${LCP_PHASE_BUDGETS.resourceLoadDelay * 100}). ` +
        `En yaygın sebepler: loading="lazy", CSS background-image (preload scanner göremez) veya JS ile enjekte edilen görsel.`,
    fixSnippet: isUnknownResource
      ? `<!-- CSS arka plan görseliyse: kaynağı HTML'de preload et -->\n` +
        `<link rel="preload" as="image" href="/img/hero.jpg" fetchpriority="high">\n\n` +
        `<!-- Web fontuysa: fontu preload et, CSS beklenmeden indirilmeye başlar -->\n` +
        `<link rel="preload" href="/fonts/display.woff2" as="font" type="font/woff2" crossorigin>\n\n` +
        `/* Font inerken metin görünmez kalmasın */\n` +
        `@font-face { font-family: Display; src: url(/fonts/display.woff2) format('woff2'); font-display: swap; }\n\n` +
        `// Next.js: next/font zaten self-host eder — preload'u açık tut\n` +
        `const display = Anton({ subsets: ['latin'], weight: '400', preload: true, display: 'swap' })`
      : `<!-- LCP görseli: lazy KALDIR, yüksek öncelik VER -->\n` +
        `<img src="${attribution.url ?? '/hero.jpg'}" fetchpriority="high" decoding="async" width="1200" height="630" alt="">\n\n` +
        `<!-- Görsel CSS'ten veya JS'ten geliyorsa preload şart -->\n` +
        `<link rel="preload" as="image" href="${attribution.url ?? '/hero.jpg'}" fetchpriority="high">`,
  }
}

const resourceLoadDurationFinding = (
  share: number,
  severity: FindingSeverity,
  attribution: LcpAttribution,
): CwvFinding => ({
  category: 'cwv',
  metric: 'LCP',
  severity,
  phase: 'resourceLoadDuration',
  phaseShare: share,
  url: null,
  culpritSelector: attribution.target,
  evidence: `Kaynak indirme süresi ${Math.round(attribution.resourceLoadDuration)}ms`,
  impact: estimateImpact(severity, share),
  effort: EFFORT_BY_PHASE.resourceLoadDuration,
  title: `LCP kaynağının indirilmesi çok uzun sürüyor (${percentLabel(share)})`,
  explanation:
    `Kaynağın indirilmesi ${Math.round(attribution.resourceLoadDuration)}ms sürüyor` +
    (attribution.url === null ? '' : ` (${attribution.url})`) +
    `. Bu genelde dosya boyutunun render edilen boyuta göre çok büyük olmasından kaynaklanır — ` +
    `örneğin 1-2 MB'lık bir JPEG'in ekranda birkaç yüz piksel olarak gösterilmesi.`,
  fixSnippet:
    `<!-- Modern format + responsive boyut: tipik olarak %90 üzeri küçülme -->\n` +
    `<picture>\n` +
    `  <source type="image/avif" srcset="/hero-480.avif 480w, /hero-960.avif 960w" sizes="100vw">\n` +
    `  <source type="image/webp" srcset="/hero-480.webp 480w, /hero-960.webp 960w" sizes="100vw">\n` +
    `  <img src="/hero-960.jpg" width="960" height="960" fetchpriority="high" alt="">\n` +
    `</picture>\n\n` +
    `// Next.js: görseli /_next/image üzerinden geçir (AVIF/WebP + boyutlandırma otomatik)\n` +
    `import Image from 'next/image'\n` +
    `<Image src={src} width={960} height={960} priority sizes="100vw" alt="" />`,
})

const elementRenderDelayFinding = (
  share: number,
  severity: FindingSeverity,
  attribution: LcpAttribution,
): CwvFinding => ({
  category: 'cwv',
  metric: 'LCP',
  severity,
  phase: 'elementRenderDelay',
  phaseShare: share,
  url: null,
  culpritSelector: attribution.target,
  evidence: `Render gecikmesi ${Math.round(attribution.elementRenderDelay)}ms`,
  impact: estimateImpact(severity, share),
  effort: EFFORT_BY_PHASE.elementRenderDelay,
  title: `Kaynak hazır ama element geç boyanıyor (${percentLabel(share)})`,
  explanation:
    `LCP kaynağı indikten sonra elementin ekrana çizilmesi ${Math.round(attribution.elementRenderDelay)}ms daha ` +
    `sürüyor (hedef: <%${LCP_PHASE_BUDGETS.elementRenderDelay * 100}). Üç yaygın sebep: (1) blokan CSS/JS ana ` +
    `thread'i meşgul ediyor, (2) LCP elementinin üzerinde CSS animasyonu var ve opaklık 0'dan başlıyor — element ` +
    `görünene kadar boyanmış sayılmaz, (3) içerik istemci tarafında render ediliyor.`,
  fixSnippet:
    `/* LCP elementini animasyonla geciktirme: opaklığı 1'de bırak, sadece dönüşümü animasyonla */\n` +
    `.hero-title { opacity: 1; animation: slide-in 320ms ease-out both; }\n` +
    `@keyframes slide-in { from { transform: translateY(12px); } to { transform: none; } }\n\n` +
    `/* Hareket hassasiyeti olan kullanıcıyı da düşün */\n` +
    `@media (prefers-reduced-motion: reduce) { .hero-title { animation: none; } }\n\n` +
    `<!-- Kritik olmayan 3. parti script'i preload ETME, önceliğini düşür -->\n` +
    `<script src="https://analytics.example/t.js" async fetchpriority="low"></script>`,
})

/**
 * LCP teşhisi: her faz kendi bütçesiyle karşılaştırılır, aşanlar bulgu üretir.
 * Faz payları fazların toplamına göre hesaplandığı için attribution eksik/bozuk olsa da
 * yanlış teşhis üretilmez (hepsi 0 → hiç bulgu yok).
 */
export const diagnoseLcp = (
  lcpMs: number,
  attribution: LcpAttribution,
  ttfb: TtfbAttribution | null,
): readonly CwvFinding[] => {
  const shares = lcpPhaseShares(attribution)
  const severity = severityFor(lcpMs)

  return [
    shares.timeToFirstByte > LCP_PHASE_BUDGETS.timeToFirstByte
      ? ttfbFinding(shares.timeToFirstByte, severity, attribution, ttfb)
      : null,
    shares.resourceLoadDelay > LCP_PHASE_BUDGETS.resourceLoadDelay
      ? resourceLoadDelayFinding(shares.resourceLoadDelay, severity, attribution)
      : null,
    shares.resourceLoadDuration > LCP_PHASE_BUDGETS.resourceLoadDuration
      ? resourceLoadDurationFinding(shares.resourceLoadDuration, severity, attribution)
      : null,
    shares.elementRenderDelay > LCP_PHASE_BUDGETS.elementRenderDelay
      ? elementRenderDelayFinding(shares.elementRenderDelay, severity, attribution)
      : null,
  ].filter((finding): finding is CwvFinding => finding !== null)
}
