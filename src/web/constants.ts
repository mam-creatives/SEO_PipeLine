/**
 * Web formunun kabul ettiği domain deseni — `src/cli/initClient.ts`'teki ile aynı mantık,
 * ayrı bir kopya: `initClient.ts` bir CLI giriş noktası, dosya import edilir edilmez
 * `main()`'i çalıştırır (`void main()` dosya sonunda) — bu yüzden oradan import edilemez.
 */
export const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i

/** Ziyaretçi en az 1, en çok bu kadar AI-görünürlük sorusu girebilir — Gemini maliyetini sınırlar. */
export const GEO_QUESTION_MAX_COUNT = 5
/** Soru başına azami karakter — aşırı uzun bir "soru" ile Gemini isteğini şişirmeyi önler. */
export const GEO_QUESTION_MAX_LENGTH = 200

/**
 * SerpApi ücretsiz kota 250 arama/ay ≈ günde ~8 (bkz. README maliyet notları). Bu sayı
 * TÜM ziyaretçiler arasında paylaşılır — cömert tutulmamalı, aksi halde tek bir gün
 * ajansın aylık ücretsiz kotasını bitirebilir.
 */
export const SERP_DAILY_BUDGET = 8

/** Ziyaretçi isteğinin gövde boyutu sınırı — domain + birkaç kısa soru için fazlasıyla yeterli. */
export const MAX_REQUEST_BODY_BYTES = 8 * 1024
