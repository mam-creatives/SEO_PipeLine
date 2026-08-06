/**
 * Türkçe'ye duyarlı metin yardımcıları.
 * Tüm string karşılaştırmaları bu modül üzerinden yapılmalı —
 * standart toLowerCase() Türkçe İ/i dönüşümünü bozar ("İSTANBUL" → "i̇stanbul" sorunu).
 */

export const normalizeTr = (text: string): string => text.toLocaleLowerCase('tr-TR').trim()

export const containsTr = (haystack: string, needle: string): boolean =>
  normalizeTr(haystack).includes(normalizeTr(needle))

/** Rapor klasör adları için ASCII slug üretir. */
export const slugify = (text: string): string =>
  normalizeTr(text)
    .replaceAll('ı', 'i')
    .replaceAll('ğ', 'g')
    .replaceAll('ü', 'u')
    .replaceAll('ş', 's')
    .replaceAll('ö', 'o')
    .replaceAll('ç', 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** URL'den kök domain'i çıkarır: "https://www.flo.com.tr/x" → "flo.com.tr" */
export const extractRootDomain = (url: string): string => {
  const withoutProtocol = url.replace(/^[a-z]+:\/\//i, '')
  const host = withoutProtocol.split('/')[0] ?? ''
  return host.replace(/^www\./i, '')
}
