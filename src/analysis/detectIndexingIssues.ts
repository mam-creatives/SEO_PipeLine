import { estimateImpact, type Finding } from '../core/findings.js'
import type { IndexStatus } from '../core/types.js'

/**
 * `coverageState` serbest metindir (Google API'si burada sabit enum vermiyor) — bu yüzden
 * tetikleyici olarak KULLANILMAZ, yalnız bağlam için bulgunun `evidence`'ına eklenir.
 * Tetikleyiciler `indexingState`/`pageFetchState`/canonical karşılaştırması gibi gerçek
 * enum alanlarıdır; brittle metin eşleştirmesinden kaçınılır.
 */
const INDEXING_STATE_LABEL: Readonly<Record<string, string>> = {
  BLOCKED_BY_META_TAG: 'sayfadaki bir meta robots etiketi (noindex)',
  BLOCKED_BY_HTTP_HEADER: 'bir HTTP başlığı (X-Robots-Tag: noindex)',
  BLOCKED_BY_ROBOTS_TXT: 'robots.txt disallow kuralı',
}

const indexingBlockedFinding = (status: IndexStatus): Finding | null => {
  if (status.indexingState === 'INDEXING_ALLOWED' || status.indexingState === 'INDEXING_STATE_UNSPECIFIED') {
    return null
  }
  const cause = INDEXING_STATE_LABEL[status.indexingState] ?? status.indexingState
  return {
    category: 'indexing',
    severity: 'critical',
    url: status.url,
    culpritSelector: null,
    title: 'Sayfa Google tarafından indekslenmesi engelleniyor',
    explanation:
      `Google URL Inspection API'sine göre bu sayfa ${cause} yüzünden indekslenemiyor ` +
      `(coverage durumu: "${status.coverageState}"). Bu sayfa arama sonuçlarında hiç görünmez — ` +
      `diğer tüm SEO çalışmaları bu düzelmeden anlamsız kalır.`,
    evidence: `indexingState: ${status.indexingState}`,
    impact: estimateImpact('critical'),
    effort: 'small',
    fixSnippet:
      `<!-- Meta robots etiketini kontrol et -->\n<meta name="robots" content="index, follow">\n\n` +
      `# X-Robots-Tag başlığını kontrol et\ncurl -sI ${status.url} | grep -i x-robots-tag\n\n` +
      `# robots.txt'in bu URL'i engellemediğinden emin ol\ncurl -s https://$(echo "${status.url}" | sed -E 's#https?://([^/]+).*#\\1#')/robots.txt`,
  }
}

const fetchFailedFinding = (status: IndexStatus): Finding | null => {
  if (status.pageFetchState === 'SUCCESSFUL' || status.pageFetchState === 'PAGE_FETCH_STATE_UNSPECIFIED') {
    return null
  }
  return {
    category: 'indexing',
    severity: 'critical',
    url: status.url,
    culpritSelector: null,
    title: 'Googlebot sayfayı getiremedi',
    explanation:
      `pageFetchState: ${status.pageFetchState}. Google'ın kendi crawler'ı sayfaya normal bir tarayıcıdan ` +
      `farklı bir sonuçla ulaşıyor olabilir — user-agent engeli, coğrafi/IP kısıtlaması, soft-404 ya da ` +
      `sunucu hatası ihtimalleri var. Google bu sayfayı tarayamazsa indeksleyemez de.`,
    evidence: `pageFetchState: ${status.pageFetchState}`,
    impact: estimateImpact('critical'),
    effort: 'large',
    fixSnippet:
      `# Googlebot'un gördüğünü simüle et\n` +
      `curl -A "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" -sI ${status.url}`,
  }
}

const canonicalMismatchFinding = (status: IndexStatus): Finding | null => {
  if (status.googleCanonical === null || status.userCanonical === null) return null
  if (status.googleCanonical === status.userCanonical) return null
  return {
    category: 'indexing',
    severity: 'critical',
    url: status.url,
    culpritSelector: null,
    title: "Google canonical'ınızı reddetti",
    explanation:
      `Sayfa <link rel="canonical"> ile "${status.userCanonical}" adresini işaret ediyor ama Google bunun ` +
      `yerine "${status.googleCanonical}" adresini asıl sürüm olarak seçti. Sizin belirttiğiniz sayfa değil, ` +
      `Google'ın seçtiği sıralanır — SEO'da bundan daha kritik tek bir sinyal yok.`,
    evidence: `userCanonical: ${status.userCanonical} ≠ googleCanonical: ${status.googleCanonical}`,
    impact: estimateImpact('critical'),
    effort: 'small',
    fixSnippet:
      `<link rel="canonical" href="${status.googleCanonical}">\n\n` +
      `<!-- Ya da: sayfaların gerçekten farklı, birbirini yinelemeyen içerik olduğundan emin olun — ` +
      `aksi halde Google bunları duplicate sayıp kendi seçimini yapmaya devam eder. -->`,
  }
}

/**
 * IndexStatus listesinden Finding üretir — saf fonksiyon. `coverageState` yalnız bağlam
 * için taşınır, hiçbir kural onu tetikleyici olarak kullanmaz (bkz. yukarıdaki not).
 */
export const detectIndexingIssues = (statuses: readonly IndexStatus[]): readonly Finding[] =>
  statuses.flatMap((status) =>
    [indexingBlockedFinding(status), fetchFailedFinding(status), canonicalMismatchFinding(status)].filter(
      (finding): finding is Finding => finding !== null,
    ),
  )
