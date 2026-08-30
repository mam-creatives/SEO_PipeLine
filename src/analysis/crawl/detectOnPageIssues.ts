import { DEEP_PAGE_THRESHOLD, META_DESCRIPTION_MAX_LENGTH, MIN_WORD_COUNT, TITLE_MAX_LENGTH } from '../../config/constants.js'
import { estimateImpact, type Finding } from '../../core/findings.js'
import type { CrawledPage } from '../../core/types.js'

/** Yalnız gerçekten alınmış sayfalar değerlendirilir — 4xx/5xx'in "title eksik" demesi anlamsız, o detectLinkIssues'ın işi. */
const isEvaluable = (page: CrawledPage): boolean => page.statusCode !== null && page.statusCode >= 200 && page.statusCode < 300

/**
 * Faz 4.1 — CSR (istemci-taraflı render) muhtemelse "title/H1/schema/OG yok" bulguları
 * bastırılır: ham HTML boşsa bunlar aslında var olabilir, JS render sonrası eklenmiş olabilir.
 * Uydurmak yerine `diagnoseCwv`/`linkFindingsToCode`'un "isabetsizse null döner" felsefesiyle
 * aynı — yerine TEK bir uyarı bulgusu üretilir, aşağıdaki `clientRenderedFinding`. Yalnız
 * "eksik/yok" iddiaları bastırılır — "çok uzun" gibi ELİNDE VERİ OLAN bulgular etkilenmez,
 * bkz. aggregator'daki kullanım.
 */
const clientRenderedFinding = (page: CrawledPage): Finding | null => {
  if (!page.likelyClientRendered) return null
  return {
    category: 'onpage',
    severity: 'medium',
    url: page.url,
    culpritSelector: null,
    title: 'Sayfa muhtemelen istemci tarafında render ediliyor',
    explanation:
      'Ham HTML\'de görünür metin oranı çok düşük ve script sayısı yüksek — sayfa muhtemelen ' +
      'client-side render (Next.js CSR, Vue, SPA vb.). Bu crawler yalnız ham HTML\'i okur; bu ' +
      'sayfadaki title/H1/schema/OG bulguları BASTIRILDI çünkü JS render sonrası içerik ' +
      'crawler\'a görünmüyor olabilir — güvenilir değiller.',
    evidence: `wordCount: ${page.wordCount}, likelyClientRendered: true`,
    impact: estimateImpact('medium'),
    effort: 'medium',
    fixSnippet: null,
  }
}

/** CSR'de bastırılır — ham HTML'de yoksa bile JS render sonrası var olabilir. */
const missingTitleFinding = (page: CrawledPage): Finding | null => {
  if (page.title !== null && page.title !== '') return null
  return {
    category: 'onpage',
    severity: 'critical',
    url: page.url,
    culpritSelector: 'title',
    title: '<title> etiketi eksik',
    explanation:
      'Sayfanın <title> etiketi yok ya da boş. Bu, SERP\'te gösterilen başlık ve Google\'ın sayfayı ' +
      'anlamasında kullandığı en güçlü tek sinyal — eksikliği doğrudan tıklama oranını ve alaka skorunu düşürür.',
    evidence: 'title: (yok)',
    impact: estimateImpact('critical'),
    effort: 'trivial',
    fixSnippet: `<title>Anahtar Kelime | Marka Adı</title>`,
  }
}

/** CSR'den bağımsız — title elimizde VAR, uzunluğu ölçülebiliyor, JS render şüphesi bunu geçersiz kılmaz. */
const titleTooLongFinding = (page: CrawledPage): Finding | null => {
  if (page.title === null || page.title.length <= TITLE_MAX_LENGTH) return null
  return {
    category: 'onpage',
    severity: 'low',
    url: page.url,
    culpritSelector: 'title',
    title: 'Title çok uzun, SERP\'te kırpılabilir',
    explanation: `Title ${page.title.length} karakter — Google genelde ~${TITLE_MAX_LENGTH} karakterden sonra kırpar.`,
    evidence: `title (${page.title.length} karakter): "${page.title}"`,
    impact: estimateImpact('low'),
    effort: 'trivial',
    fixSnippet: null,
  }
}

const metaDescriptionFinding = (page: CrawledPage): Finding | null => {
  if (page.metaDescription === null || page.metaDescription === '') {
    return {
      category: 'onpage',
      severity: 'medium',
      url: page.url,
      culpritSelector: 'meta[name="description"]',
      title: 'Meta description eksik ya da boş',
      explanation:
        'Google genelde SERP özetini bu etiketten alır; boşsa sayfa içeriğinden rastgele bir kesit gösterir — ' +
        'tıklama oranını doğrudan etkileyen, ücretsiz bir kazanım kaçırılıyor.',
      evidence: page.metaDescription === null ? 'meta[name="description"]: (etiket yok)' : 'meta[name="description"]: (boş)',
      impact: estimateImpact('medium'),
      effort: 'trivial',
      fixSnippet: `<meta name="description" content="120-160 karakter arası, harekete geçirici bir özet.">`,
    }
  }
  if (page.metaDescription.length > META_DESCRIPTION_MAX_LENGTH) {
    return {
      category: 'onpage',
      severity: 'low',
      url: page.url,
      culpritSelector: 'meta[name="description"]',
      title: 'Meta description çok uzun, kırpılabilir',
      explanation: `${page.metaDescription.length} karakter — Google genelde ~${META_DESCRIPTION_MAX_LENGTH} karakterden sonra kırpar.`,
      evidence: `meta description (${page.metaDescription.length} karakter)`,
      impact: estimateImpact('low'),
      effort: 'trivial',
      fixSnippet: null,
    }
  }
  return null
}

const missingH1Finding = (page: CrawledPage): Finding | null => {
  if (page.h1s.length > 0) return null
  return {
    category: 'onpage',
    severity: 'high',
    url: page.url,
    culpritSelector: 'h1',
    title: 'Sayfada hiç <h1> yok',
    explanation:
      'H1, sayfanın konusunu hem kullanıcıya hem Google\'a özetleyen birincil başlık sinyalidir. ' +
      'Yokluğu, sayfa hiyerarşisinin ne olduğunu belirsizleştirir.',
    evidence: `headingOrder: [${page.headingOrder.join(', ') || '(hiç başlık yok)'}]`,
    impact: estimateImpact('high'),
    effort: 'small',
    fixSnippet: '<h1>Sayfanın Birincil Konusu</h1>',
  }
}

const multipleH1Finding = (page: CrawledPage): Finding | null => {
  if (page.h1s.length <= 1) return null
  return {
    category: 'onpage',
    severity: 'medium',
    url: page.url,
    culpritSelector: 'h1',
    title: `Sayfada ${page.h1s.length} adet <h1> var`,
    explanation:
      'Birden fazla H1, hangi başlığın birincil konu olduğunu belirsizleştirir. Sayfa başına tek H1 önerilir.',
    evidence: `h1s: ${page.h1s.map((h) => `"${h}"`).join(', ')}`,
    impact: estimateImpact('medium'),
    effort: 'small',
    fixSnippet: null,
  }
}

const missingCanonicalFinding = (page: CrawledPage): Finding | null => {
  if (page.canonicalUrl !== null) return null
  return {
    category: 'onpage',
    severity: 'medium',
    url: page.url,
    culpritSelector: 'link[rel="canonical"]',
    title: 'Canonical etiketi yok',
    explanation:
      'Canonical belirtilmemiş — sayfa parametre/slash varyantlarıyla çoğaltılırsa Google hangi sürümün ' +
      '"asıl" olduğuna kendi karar verir, bu genelde istenen sonucu vermez.',
    evidence: 'link[rel="canonical"]: (yok)',
    impact: estimateImpact('medium'),
    effort: 'trivial',
    fixSnippet: `<link rel="canonical" href="${page.url}">`,
  }
}

const missingSchemaFinding = (page: CrawledPage): Finding | null => {
  if (page.hasSchemaOrg) return null
  return {
    category: 'onpage',
    severity: 'low',
    url: page.url,
    culpritSelector: 'script[type="application/ld+json"]',
    title: 'Yapılandırılmış veri (schema.org) yok',
    explanation:
      'JSON-LD yok — zengin sonuç (rich result) ve AI özetleri (GEO) için Google/LLM\'lerin sayfayı ' +
      'yapılandırılmış biçimde anlamasını sağlayan bir fırsat kaçırılıyor.',
    evidence: 'application/ld+json: (yok)',
    impact: estimateImpact('low'),
    effort: 'medium',
    fixSnippet:
      '<script type="application/ld+json">\n' +
      '{"@context":"https://schema.org","@type":"LocalBusiness","name":"Marka Adı"}\n' +
      '</script>',
  }
}

const incompleteOgFinding = (page: CrawledPage): Finding | null => {
  if (page.ogComplete) return null
  return {
    category: 'onpage',
    severity: 'low',
    url: page.url,
    culpritSelector: 'meta[property^="og:"]',
    title: 'Open Graph etiketleri eksik',
    explanation:
      'og:title/og:description/og:image üçünden en az biri eksik — sosyal medyada ve bazı AI özetlerinde ' +
      'paylaşım kartı düzgün görünmez.',
    evidence: 'og:title/og:description/og:image: en az biri eksik',
    impact: estimateImpact('low'),
    effort: 'trivial',
    fixSnippet:
      '<meta property="og:title" content="...">\n<meta property="og:description" content="...">\n<meta property="og:image" content="...">',
  }
}

/** Faz 4.2 — `depth`, orkestrasyonun (crawlSite.ts BFS) yazdığı gerçek tıklama-derinliği. CSR'den bağımsız: yapısal bir gerçek, içerik render zamanlamasıyla ilgisi yok. */
const deepPageFinding = (page: CrawledPage): Finding | null => {
  if (page.depth <= DEEP_PAGE_THRESHOLD) return null
  return {
    category: 'onpage',
    severity: 'medium',
    url: page.url,
    culpritSelector: null,
    title: `Sayfa anasayfadan ${page.depth} tıklama uzakta`,
    explanation:
      'Google, iç link grafiğinde anasayfadan uzak sayfaları daha az önemli sinyaliyle tarar/indeksler. ' +
      `${DEEP_PAGE_THRESHOLD} tıklamadan uzak sayfalar keşif ve tarama bütçesinden daha az pay alır.`,
    evidence: `depth: ${page.depth} (eşik: ${DEEP_PAGE_THRESHOLD})`,
    impact: estimateImpact('medium'),
    effort: 'medium',
    fixSnippet: null,
  }
}

/** Faz 4.2 — CSR'de bastırılır: wordCount ham HTML'den sayılıyor, JS render sonrası içerik eksik sayılabilir. */
const thinContentFinding = (page: CrawledPage): Finding | null => {
  if (page.wordCount >= MIN_WORD_COUNT) return null
  return {
    category: 'onpage',
    severity: 'medium',
    url: page.url,
    culpritSelector: null,
    title: 'İnce içerik (thin content)',
    explanation:
      `Sayfa yalnız ${page.wordCount} kelime içeriyor (eşik: ${MIN_WORD_COUNT}). Az içerikli sayfalar ` +
      'Google\'ın konuyu yeterince kapsamlı bulmasını zorlaştırır ve genelde daha zayıf sıralanır.',
    evidence: `wordCount: ${page.wordCount}`,
    impact: estimateImpact('medium'),
    effort: 'medium',
    fixSnippet: null,
  }
}

const imagesMissingAltFinding = (page: CrawledPage): Finding | null => {
  if (page.imagesMissingAlt === 0) return null
  return {
    category: 'onpage',
    severity: 'medium',
    url: page.url,
    culpritSelector: 'img:not([alt])',
    title: `${page.imagesMissingAlt} görselde alt özniteliği eksik`,
    explanation:
      'alt metni hem erişilebilirlik hem görsel arama (Google Images) için gerekli — eksikliği her iki ' +
      'kanalda da kaybedilen görünürlük demektir.',
    evidence: `imagesMissingAlt: ${page.imagesMissingAlt}`,
    impact: estimateImpact('medium'),
    effort: 'small',
    fixSnippet: '<img src="..." alt="Görseli kısaca açıklayan metin">',
  }
}

/**
 * CrawledPage listesinden on-page bulgu üretir — saf fonksiyon, yalnız başarıyla alınmış
 * sayfalar değerlendirilir. `likelyClientRendered` sayfalarda "eksik/yok" iddiaları
 * (title/H1/schema/OG) bastırılır, yerine tek bir `clientRenderedFinding` üretilir —
 * bkz. dosya başındaki Faz 4.1 yorumu.
 */
export const detectOnPageIssues = (pages: readonly CrawledPage[]): readonly Finding[] =>
  pages.filter(isEvaluable).flatMap((page) => {
    const reliable = !page.likelyClientRendered
    return [
      reliable ? missingTitleFinding(page) : null,
      titleTooLongFinding(page),
      metaDescriptionFinding(page),
      reliable ? missingH1Finding(page) : null,
      multipleH1Finding(page),
      missingCanonicalFinding(page),
      reliable ? missingSchemaFinding(page) : null,
      reliable ? incompleteOgFinding(page) : null,
      imagesMissingAltFinding(page),
      deepPageFinding(page),
      reliable ? thinContentFinding(page) : null,
      clientRenderedFinding(page),
    ].filter((finding): finding is Finding => finding !== null)
  })
