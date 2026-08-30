import { MIN_TARGETABLE_KEYWORD_VOLUME } from '../config/constants.js'
import { estimateImpact, type Finding } from '../core/findings.js'
import type { CrawledPage, KeywordPageMatch } from '../core/types.js'

const isReliable = (page: CrawledPage): boolean =>
  page.statusCode !== null && page.statusCode >= 200 && page.statusCode < 300 && !page.likelyClientRendered

const pageFor = (pages: readonly CrawledPage[], url: string): CrawledPage | undefined =>
  pages.find((page) => page.url === url || page.finalUrl === url)

/**
 * Yalnız eşleşen sayfa GERÇEKTEN taranmış VE güvenilirse (2xx, CSR şüphesi yok) on-page iddiası
 * üretilir — aksi halde "keyword title'da yok" gibi kanıtsız bir iddia olurdu (sayfa crawl
 * bütçesi dışında kalmış olabilir, ya da CSR'de içerik istemci tarafında enjekte ediliyor olabilir).
 */
const onPageFindings = (matches: readonly KeywordPageMatch[], pages: readonly CrawledPage[]): readonly Finding[] =>
  matches.flatMap((match): readonly Finding[] => {
    if (match.url === null) return []
    const page = pageFor(pages, match.url)
    if (page === undefined || !isReliable(page)) return []

    const rankedVerb = match.matchSource === 'gsc' ? 'gösterime giriyor' : 'sıralanıyor'
    const findings: Finding[] = []

    if (!match.inTitle) {
      findings.push({
        category: 'content',
        severity: 'high',
        url: match.url,
        culpritSelector: 'title',
        title: `"${match.keyword}" hedef keyword'ü title'da geçmiyor`,
        explanation:
          `Bu sayfa "${match.keyword}" için ${rankedVerb} ama <title> etiketinde bu kelime hiç geçmiyor. ` +
          "Google alaka kurmakta zorlanır, SERP'te tıklama oranı da düşer.",
        evidence: `title: "${page.title ?? '(yok)'}"`,
        impact: estimateImpact('high'),
        effort: 'trivial',
        fixSnippet: null,
      })
    }
    if (!match.inH1) {
      findings.push({
        category: 'content',
        severity: 'medium',
        url: match.url,
        culpritSelector: 'h1',
        title: `"${match.keyword}" hedef keyword'ü H1'de geçmiyor`,
        explanation: `Sayfanın birincil başlığı (H1) "${match.keyword}" kelimesini içermiyor — konu netliği zayıflar.`,
        evidence: `H1: ${page.h1s.join(', ') || '(yok)'}`,
        impact: estimateImpact('medium'),
        effort: 'small',
        fixSnippet: null,
      })
    }
    if (!match.inBody) {
      findings.push({
        category: 'content',
        severity: 'high',
        url: match.url,
        culpritSelector: null,
        title: `"${match.keyword}" hedef keyword'ü sayfa içeriğinde hiç geçmiyor`,
        explanation:
          `Bu sayfa "${match.keyword}" için ${rankedVerb} ama bu kelime gövde metninde hiç geçmiyor — ` +
          'Google alakayı zorlukla kuruyor, sıralamanın kalıcılığı riskte.',
        evidence: `hacim: ~${match.volume.toLocaleString('tr-TR')}/ay`,
        impact: estimateImpact('high'),
        effort: 'medium',
        fixSnippet: null,
      })
    }
    return findings
  })

/** Belirli bir hacmin üzerindeki, hiçbir sayfanın hedeflemediği keyword'ler — içerik boşluğu. Düşük hacimliler gürültü olurdu. */
const contentGapFindings = (matches: readonly KeywordPageMatch[]): readonly Finding[] =>
  matches
    .filter((match) => match.matchSource === 'none' && match.volume >= MIN_TARGETABLE_KEYWORD_VOLUME)
    .map((match) => ({
      category: 'content',
      severity: 'medium',
      url: null,
      culpritSelector: null,
      title: `"${match.keyword}" keyword'ünü hedefleyen bir sayfa tespit edilemedi`,
      explanation:
        `Aylık ~${match.volume.toLocaleString('tr-TR')} aramalık bu keyword için ne GSC'de gösterim veren ne de ` +
        'SERP top-10\'da sıralanan bir sayfa bulundu — muhtemelen bu konuya özel içerik hiç yok.',
      evidence: `hacim: ~${match.volume.toLocaleString('tr-TR')}/ay, eşleşme: yok`,
      impact: estimateImpact('medium'),
      effort: 'large',
      fixSnippet: null,
    }))

/**
 * Faz 5.4 — dış inceleme bulgusu: araç hedef keyword'leri VE sayfa içeriklerini biliyordu ama
 * ikisini hiç birleştirmiyordu. "Hedef keyword sayfanın title/H1/body'sinde geçiyor mu?" —
 * on-page SEO'nun 1. maddesi — hiç sorulmuyordu.
 */
export const detectKeywordContentIssues = (matches: readonly KeywordPageMatch[], pages: readonly CrawledPage[]): readonly Finding[] => [
  ...onPageFindings(matches, pages),
  ...contentGapFindings(matches),
]
