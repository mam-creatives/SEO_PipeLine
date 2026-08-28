import { estimateImpact, type Finding } from '../../../core/findings.js'
import type { SourceFile } from '../../types.js'

/** src="...jpg/jpeg/png" — modern format alternatifi (webp/avif) olmadan referans edilen legacy raster görsel. */
const LEGACY_IMG_TAG = /<img\b[^>]*\bsrc=["']([^"']+\.(?:jpe?g|png))["'][^>]*>/gi
const HAS_MODERN_SIBLING = /\b(?:webp|avif)\b/i
const HAS_LAZY_LOADING = /\bloading=["']lazy["']/i

interface LegacyImageMatch {
  readonly src: string
  readonly hasLazyLoading: boolean
}

const findLegacyImages = (content: string): readonly LegacyImageMatch[] => {
  const matches: LegacyImageMatch[] = []
  for (const match of content.matchAll(LEGACY_IMG_TAG)) {
    const tag = match[0]
    const src = match[1]
    if (src === undefined) continue
    if (HAS_MODERN_SIBLING.test(tag)) continue
    matches.push({ src, hasLazyLoading: HAS_LAZY_LOADING.test(tag) })
  }
  return matches
}

const heavyAssetsFinding = (file: SourceFile, images: readonly LegacyImageMatch[]): Finding => {
  const withoutLazy = images.filter((img) => !img.hasLazyLoading).length
  const sample = images.slice(0, 5).map((img) => img.src)
  return {
    category: 'onpage',
    severity: withoutLazy > 0 ? 'medium' : 'low',
    url: null,
    culpritSelector: 'img',
    title: `${images.length} görsel modern format (webp/avif) alternatifi olmadan referans ediliyor`,
    explanation:
      `${file.relPath} içinde jpg/jpeg/png uzantılı ${images.length} <img> etiketi bulundu, hiçbirinin ` +
      `webp/avif alternatifi yok. Modern formatlar aynı görseli %25-50 daha küçük dosya boyutuyla sunar — LCP'yi doğrudan iyileştirir.` +
      (withoutLazy > 0 ? ` ${withoutLazy} tanesinde ayrıca loading="lazy" de eksik.` : ''),
    evidence: sample.join(', ') + (images.length > sample.length ? ` (+${images.length - sample.length} daha)` : ''),
    impact: estimateImpact(withoutLazy > 0 ? 'medium' : 'low'),
    effort: 'medium',
    fixSnippet: `<img src="${sample[0] ?? 'gorsel.webp'}" loading="lazy" />`,
    codeLocation: { file: file.relPath, line: null },
  }
}

/**
 * Her stack'te çalışır — HTML/PHP/JSX şablon kaynağında legacy raster görsel referanslarını
 * arar. Gerçek kanıt: mamcreatives.com'da 945 jpeg + 478 jpg + 310 png'ye karşı yalnız 29 webp.
 * Dosya bazında TEK bir toplu bulgu üretir (her img için ayrı değil) — aksi halde büyük
 * şablonlarda rapor okunmaz hale gelir.
 */
export const detectHeavyAssets = (files: readonly SourceFile[]): readonly Finding[] =>
  files.flatMap((file) => {
    const images = findLegacyImages(file.content)
    return images.length === 0 ? [] : [heavyAssetsFinding(file, images)]
  })
