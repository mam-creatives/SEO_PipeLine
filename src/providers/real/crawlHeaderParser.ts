/**
 * Faz 5.1 — HTTP yanıt başlıklarından SEO açısından anlamlı sinyaller çıkarır. Saf fonksiyonlar,
 * `crawlRobotsParser.ts`/`crawlSitemapParser.ts` kardeşi. `crawlHtmlParser.ts` yalnız HTML
 * gövdesine bakar — bir `X-Robots-Tag: noindex` ya da `Link:` hreflang'ı HTML'de HİÇBİR İZ
 * bırakmaz, tarayıcının "Kaynağı Görüntüle"sinde bile görünmez. Bu dosya olmadan crawler bu
 * sayfaları "sağlıklı" sayardı.
 */

/** Yalnız VARLIĞI rapora yansıyacak başlıklar — ham değer saklanmaz, gürültü/PII riski yok. */
const SECURITY_HEADER_NAMES: readonly string[] = [
  'strict-transport-security',
  'content-security-policy',
  'x-content-type-options',
  'x-frame-options',
]

/** `Headers` API anahtarları fetch spesifikasyonu gereği zaten lowercase gelir. */
export const parseXRobotsTag = (headers: Readonly<Record<string, string>>): string | null => {
  const raw = headers['x-robots-tag']
  if (raw === undefined) return null
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

/** `charset=utf-8` gibi ek parametreleri atar, yalnız MIME tipini döner. */
export const parseContentType = (headers: Readonly<Record<string, string>>): string | null => {
  const raw = headers['content-type']
  if (raw === undefined) return null
  const mimeType = raw.split(';')[0]?.trim()
  return mimeType === undefined || mimeType === '' ? null : mimeType
}

export const pickSecurityHeaders = (headers: Readonly<Record<string, string>>): readonly string[] =>
  SECURITY_HEADER_NAMES.filter((name) => headers[name] !== undefined)

/**
 * `Link: <https://x.com/en/>; rel="alternate"; hreflang="en", <https://x.com/tr/>; rel="alternate"; hreflang="tr"`
 * — bazı siteler hreflang'ı yalnız bu başlıkta gönderir, HTML'de hiç `<link>` etiketi olmaz.
 * Girdiler virgülle ayrılır; her yeni girdi `<` ile başladığı için virgülden sonra `<` gelmiyorsa
 * bölünmez (URL'nin kendi sorgu string'inde virgül geçse bile kırılmaz).
 */
export const parseLinkHreflangs = (headers: Readonly<Record<string, string>>): readonly string[] => {
  const raw = headers['link']
  if (raw === undefined || raw.trim() === '') return []
  const entries = raw.split(/,(?=\s*<)/)
  const codes: string[] = []
  for (const entry of entries) {
    if (!/rel="?alternate"?/i.test(entry)) continue
    const match = /hreflang="?([a-zA-Z-]+)"?/i.exec(entry)
    if (match?.[1] !== undefined) codes.push(match[1])
  }
  return codes
}
