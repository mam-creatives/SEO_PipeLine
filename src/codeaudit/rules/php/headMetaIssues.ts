import { estimateImpact, type Finding } from '../../../core/findings.js'
import { lineNumberAt } from '../../lineNumberAt.js'
import type { SourceFile } from '../../types.js'

const HEAD_TAG = /<head[\s>]/i
const ROBOTS_META = /<meta\s+name=["']robots["']/gi
const GOOGLEBOT_META = /<meta\s+name=["']googlebot["']/gi
const OG_TITLE = /<meta\s+property=["']og:title["']/i
const OG_DESCRIPTION = /<meta\s+property=["']og:description["']/i
const OG_IMAGE = /<meta\s+property=["']og:image["']/i
const NO_CACHE_PRAGMA = /<meta\s+http-equiv=["']pragma["']\s+content=["']no-cache["']/i
const EXPIRES_ZERO = /<meta\s+http-equiv=["']expires["']\s+content=["']0["']/i
const BASE_HREF = /<base\s+href=/i
const STRUCTURED_DATA = /application\/ld\+json/i
const DEAD_META_NAMES = /<meta\s+name=["'](distribution|resource-type|rating|audience)["']/gi

const finding = (file: SourceFile, index: number, spec: Omit<Finding, 'url' | 'codeLocation'>): Finding => ({
  ...spec,
  url: null,
  codeLocation: { file: file.relPath, line: lineNumberAt(file.content, index) },
})

/** İki ayrı <meta name="robots"> ya da <meta name="googlebot"> — tarayıcılar yalnız SONUNCUYU uygular, öncekiler sessizce yok sayılır. */
const robotsConflictFinding = (file: SourceFile): Finding | null => {
  const robotsMatches = [...file.content.matchAll(ROBOTS_META)]
  const googlebotMatches = [...file.content.matchAll(GOOGLEBOT_META)]
  const total = robotsMatches.length + googlebotMatches.length
  if (total < 3) return null
  const firstIndex = [...robotsMatches, ...googlebotMatches][0]?.index ?? 0
  return finding(file, firstIndex, {
    category: 'onpage',
    severity: 'medium',
    culpritSelector: 'meta[name="robots"], meta[name="googlebot"]',
    title: `${total} adet çakışan/yinelenen robots direktifi meta etiketi`,
    explanation:
      `${robotsMatches.length} <meta name="robots"> ve ${googlebotMatches.length} <meta name="googlebot"> etiketi bulundu. ` +
      `Arama motorları birden fazla robots meta etiketiyle karşılaştığında davranış tanımsızdır — genelde yalnız ilkini ` +
      `ya da en kısıtlayıcısını uygular, geri kalanı sessizce yok sayar. Tek, doğru içerikli bir etiket bırakılmalı.`,
    evidence: `${total} etiket bulundu (birleştirilmesi gereken)`,
    impact: estimateImpact('medium'),
    effort: 'trivial',
    fixSnippet: '<meta name="robots" content="index, follow" />',
  })
}

const ogIncompleteFinding = (file: SourceFile): Finding | null => {
  const hasAnyOg = OG_TITLE.test(file.content) || OG_DESCRIPTION.test(file.content) || OG_IMAGE.test(file.content)
  if (!hasAnyOg) return null
  const missing = [
    !OG_TITLE.test(file.content) && 'og:title',
    !OG_DESCRIPTION.test(file.content) && 'og:description',
    !OG_IMAGE.test(file.content) && 'og:image',
  ].filter((v): v is string => v !== false)
  if (missing.length === 0) return null
  const anchor = file.content.search(/<meta\s+property=["']og:/i)
  return finding(file, anchor === -1 ? 0 : anchor, {
    category: 'onpage',
    severity: 'low',
    culpritSelector: 'head',
    title: 'Open Graph etiket seti eksik',
    explanation:
      `Sayfada bazı Open Graph etiketleri var ama tam set değil — eksik: ${missing.join(', ')}. ` +
      `Sosyal medyada paylaşıldığında (WhatsApp, LinkedIn, Facebook) kart eksik/boş görünür.`,
    evidence: `Eksik: ${missing.join(', ')}`,
    impact: estimateImpact('low'),
    effort: 'trivial',
    fixSnippet: missing.map((tag) => `<meta property="${tag}" content="..." />`).join('\n'),
  })
}

const noCachePragmaFinding = (file: SourceFile): Finding | null => {
  const pragmaMatch = NO_CACHE_PRAGMA.exec(file.content)
  const expiresMatch = EXPIRES_ZERO.exec(file.content)
  if (pragmaMatch === null && expiresMatch === null) return null
  const anchor = pragmaMatch?.index ?? expiresMatch?.index ?? 0
  return finding(file, anchor, {
    category: 'cwv',
    severity: 'medium',
    culpritSelector: 'meta[http-equiv="pragma"], meta[http-equiv="expires"]',
    title: 'Meta etiketiyle önbellek kapatılıyor (pragma: no-cache / expires: 0)',
    explanation:
      `<meta http-equiv="pragma" content="no-cache"> ve/veya <meta http-equiv="expires" content="0"> etiketleri bulundu. ` +
      `Bu 1990'ların HTTP/1.0 önbellek kapatma yöntemidir, modern tarayıcılarda güvenilmez ve gerçek HTTP header'ların ` +
      `yerini tutmaz — genelde yalnızca yanlışlıkla bırakılmış, hiçbir işe yaramayan koddur.`,
    evidence: 'http-equiv="pragma"/"expires" ile önbellek kapatma meta etiketi',
    impact: estimateImpact('medium'),
    effort: 'trivial',
    fixSnippet: null,
  })
}

const deadMetaTagsFinding = (file: SourceFile): Finding | null => {
  const matches = [...file.content.matchAll(DEAD_META_NAMES)]
  if (matches.length < 2) return null
  const names = matches.map((m) => m[1]).filter((v): v is string => v !== undefined)
  const firstIndex = matches[0]?.index ?? 0
  return finding(file, firstIndex, {
    category: 'onpage',
    severity: 'low',
    culpritSelector: null,
    title: `${names.length} adet modern arama motorlarınca yok sayılan meta etiket`,
    explanation:
      `distribution/resource-type/rating/audience meta etiketleri 2000'lerin başından kalma ve hiçbir modern ` +
      `arama motoru tarafından okunmuyor — sayfa ağırlığına katkı dışında bir işlevleri yok.`,
    evidence: names.join(', '),
    impact: estimateImpact('low'),
    effort: 'trivial',
    fixSnippet: null,
  })
}

const baseHrefFinding = (file: SourceFile): Finding | null => {
  const match = BASE_HREF.exec(file.content)
  if (match === null) return null
  return finding(file, match.index, {
    category: 'onpage',
    severity: 'low',
    culpritSelector: 'base',
    title: '<base href> kullanımı göreli linkleri kırılgan yapıyor',
    explanation:
      `<base href> tüm göreli URL'lerin (href, src, canonical, OG) çözümlenme noktasını değiştirir. ` +
      `Sayfa farklı bir path'te (ör. /blog/... altında) servis edilirse ya da <base> yanlış değer alırsa ` +
      `TÜM göreli linkler aynı anda kırılır — hata izlemesi zor, tek noktadan geniş etkili bir risktir.`,
    evidence: match[0],
    impact: estimateImpact('low'),
    effort: 'medium',
    fixSnippet: null,
  })
}

const missingStructuredDataFinding = (file: SourceFile): Finding | null => {
  if (STRUCTURED_DATA.test(file.content)) return null
  return finding(file, file.content.search(HEAD_TAG), {
    category: 'onpage',
    severity: 'low',
    culpritSelector: 'head',
    title: 'Yapılandırılmış veri (schema.org / JSON-LD) hiç yok',
    explanation:
      `<script type="application/ld+json"> hiç bulunamadı. Organization/LocalBusiness işaretlemesi zengin ` +
      `sonuç ve bilgi paneli için önkoşuldur — bir ajans/işletme sitesi için düşük emekle yüksek getirili bir eksik.`,
    evidence: 'application/ld+json bulunamadı',
    impact: estimateImpact('low'),
    effort: 'small',
    fixSnippet:
      '<script type="application/ld+json">\n{"@context":"https://schema.org","@type":"Organization","name":"...","url":"..."}\n</script>',
  })
}

/** Statik .html/.htm — genelde tema/şablon demo dosyası, uygulamanın canlı router'ından geçmez. */
const isLiveTemplate = (file: SourceFile): boolean => file.ext !== '.html' && file.ext !== '.htm'

/**
 * `<head>` etiketi taşıyan her CANLI şablon dosyasında meta-etiket kalitesini denetler —
 * `detectOnPageIssues.ts` (Faz 2) şablonuyla aynı desen: özel kural fonksiyonları + tek
 * `flatMap` export. Crawler'ın RENDER EDİLMİŞ HTML'den bulduğu bulguların KAYNAK KODUNDAKİ
 * birebir karşılığı; satır numarası içerdiği için Faz 2'nin sağlayamadığı "nerede
 * düzeltileceği" bilgisini verir.
 *
 * Statik `.html`/`.htm` dosyaları hariç tutulur — bunlar `publicDeadHtml.ts` tarafından ZATEN
 * tek bir toplu bulguyla "kaldırılmalı" diye işaretleniyor (gerçek kanıt: mamcreatives.com'da
 * `template/` altında 88 tanesi); her birinde ayrıca "JSON-LD yok" demek gerçek sinyali
 * boğan saf tekrardır — canlı denemede 227 bulgudan ~180'i bu gürültüydü.
 *
 * Gerçek kanıt (index.php): 108-109 çakışan robots meta, 103 eksik OG, 105-106 no-cache pragma,
 * 99 <base href>, 107/115-118 ölü meta'lar, hiç application/ld+json yok.
 */
export const detectHeadMetaIssues = (files: readonly SourceFile[]): readonly Finding[] =>
  files.filter((file) => isLiveTemplate(file) && HEAD_TAG.test(file.content)).flatMap((file) =>
    [
      robotsConflictFinding(file),
      ogIncompleteFinding(file),
      noCachePragmaFinding(file),
      deadMetaTagsFinding(file),
      baseHrefFinding(file),
      missingStructuredDataFinding(file),
    ].filter((f): f is Finding => f !== null),
  )
