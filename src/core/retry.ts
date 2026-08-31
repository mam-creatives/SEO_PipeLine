/**
 * Dış denetim bulgusu (2026-08-31, YÜKSEK 4) — `src/providers/real/` genelinde retry,
 * backoff ya da circuit breaker YOKTU. 15 SerpApi çağrısından birinde 429/soket hatası
 * → SERP dalı düşer → SERP omurga olduğu için tüm koşu `failed` işaretlenir
 * (bkz. runAllCollectors.ts COLLECT_SPINE_FAILED). Gemini/Anthropic sağlayıcıları 429 için
 * "(rate limit — çağrılar paralel gidiyor)" ipucu yazıyordu ama hiçbir yerde geri çekilme yoktu.
 *
 * `fetchWithRetry` mevcut `fetch` çağrılarının YERİNE geçen bir sarmalayıcı — sağlayıcılardaki
 * try/catch ve durum-kontrolü kodu hiç değişmeden çalışmaya devam eder, yalnız `fetch(...)`
 * çağrısı bununla değişir.
 */

export interface RetryOptions {
  /** Toplam deneme sayısı (ilk deneme dahil). Varsayılan 3. */
  readonly maxAttempts?: number
  /** Üstel backoff'un taban gecikmesi (ms). Varsayılan 500. */
  readonly baseDelayMs?: number
}

const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_BASE_DELAY_MS = 500

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Yalnız geçici hatalar yeniden denenir — 401/402/403/404 gibi kalıcı hatalar yeniden denemekle düzelmez. */
const isRetryableStatus = (status: number): boolean => status === 429 || status >= 500

/** `Retry-After` saniye cinsinden bir tamsayı olabilir (HTTP-date formatı bilerek desteklenmiyor — mevcut sağlayıcılar bunu kullanmıyor). */
const retryAfterMs = (response: Response): number | null => {
  const header = response.headers.get('retry-after')
  if (header === null) return null
  const seconds = Number(header)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null
}

/** Üstel backoff + jitter — aynı anda başarısız olan paralel çağrıların hepsi aynı anda yeniden denemesin diye. */
const backoffMs = (attempt: number, baseDelayMs: number): number => baseDelayMs * 2 ** attempt + Math.random() * baseDelayMs

/**
 * `fetch`'in yerine geçen sürüm — 429/5xx yanıtlarda ve ağ hatalarında (timeout, DNS,
 * bağlantı reddi) üstel backoff + jitter ile yeniden dener; `Retry-After` başlığına saygı
 * gösterilir.
 *
 * `initFactory` bilerek bir FONKSİYON (statik obje değil): sağlayıcılar `signal:
 * AbortSignal.timeout(N)` kullanıyor — bu sinyal oluşturulduğu anda saymaya başlar. Statik
 * bir `init` objesi yeniden denemeler arasında paylaşılsaydı, ilk denemenin zaman aşımı
 * saati ikinci denemeyi de etkiler, backoff beklemesinden sonra sinyal zaten "ateşlenmiş"
 * olabilirdi. Her deneme `initFactory()`'i yeniden çağırarak taze bir sinyal alır.
 */
export const fetchWithRetry = async (
  input: string | URL,
  initFactory: () => RequestInit,
  options: RetryOptions = {},
): Promise<Response> => {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS
  const lastAttemptIndex = maxAttempts - 1

  for (let attempt = 0; attempt <= lastAttemptIndex; attempt += 1) {
    try {
      const response = await fetch(input, initFactory())
      if (response.ok || !isRetryableStatus(response.status) || attempt === lastAttemptIndex) {
        return response
      }
      await wait(retryAfterMs(response) ?? backoffMs(attempt, baseDelayMs))
    } catch (cause) {
      if (attempt === lastAttemptIndex) throw cause
      await wait(backoffMs(attempt, baseDelayMs))
    }
  }
  // Buraya asla ulaşılmaz — döngünün her turu ya `return` eder ya `throw` eder (son turda).
  // TypeScript'in "not all code paths return" uyarısını susturmak için.
  throw new Error('fetchWithRetry: beklenmeyen kontrol akışı')
}
