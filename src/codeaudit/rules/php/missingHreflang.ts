import { estimateImpact, type Finding } from '../../../core/findings.js'
import type { SourceFile } from '../../types.js'

const HTACCESS_BASENAME = /(^|\/)\.htaccess$/
/** .htaccess'te dil/locale'i URL segmentinden query'ye taşıyan RewriteRule — çok dilli routing kanıtı. */
const LOCALE_ROUTING_SIGNAL = /\?\s*(?:dil|lang|locale)=\$1/i
const HREFLANG_TAG = /hreflang=/i

/**
 * Her stack'te çalışır — ama yalnız SİTE ÇOK DİLLİ OLDUĞUNU KANITLAYAN bir sinyal varken
 * tetiklenir (`.htaccess`'te `/([a-z-]+)/ → ?dil=$1` gibi bir locale-routing kuralı). Bu
 * sinyal yoksa tek dilli bir site için "hreflang eksik" demek yanlış pozitif üretirdi.
 *
 * Gerçek kanıt: mamcreatives.com'un `.htaccess`'inde `RewriteRule ^([A-Za-z0-9-]+)/$
 * index.php?dil=$1 [L]` var — site çok dilli routing'e sahip ama kaynak ağacında hiçbir
 * dosyada `hreflang=` geçmiyor.
 */
export const detectMissingHreflang = (files: readonly SourceFile[]): readonly Finding[] => {
  const htaccessFiles = files.filter((file) => HTACCESS_BASENAME.test(file.relPath))
  const hasLocaleRouting = htaccessFiles.some((file) => LOCALE_ROUTING_SIGNAL.test(file.content))
  if (!hasLocaleRouting) return []

  const hasHreflangAnywhere = files.some((file) => HREFLANG_TAG.test(file.content))
  if (hasHreflangAnywhere) return []

  const routingFile = htaccessFiles.find((file) => LOCALE_ROUTING_SIGNAL.test(file.content))

  return [
    {
      category: 'indexing',
      severity: 'medium',
      url: null,
      culpritSelector: null,
      title: 'Site çok dilli routing kullanıyor ama hiçbir sayfada hreflang yok',
      explanation:
        `${routingFile?.relPath ?? '.htaccess'} dosyasında dil/locale'i URL'den ayrıştıran bir yönlendirme kuralı var, ` +
        `ama kaynak ağacında hiçbir yerde <link rel="alternate" hreflang="..."> bulunamadı. Google hangi dil ` +
        `sürümünün hangi kullanıcıya gösterileceğini tahmin etmek zorunda kalıyor — yanlış dil sürümü sıralanabilir ` +
        `ya da diller birbirini kopya içerik gibi kanibalize edebilir.`,
      evidence: `${routingFile?.relPath ?? '.htaccess'}: locale-routing kuralı var, hreflang hiç yok`,
      impact: estimateImpact('medium'),
      effort: 'medium',
      fixSnippet: '<link rel="alternate" hreflang="tr" href="https://ornek.com/tr/sayfa" />\n<link rel="alternate" hreflang="en" href="https://ornek.com/en/page" />',
    },
  ]
}
