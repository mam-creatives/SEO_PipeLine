import { z } from 'zod'
import { ProviderError, summarizeZodError } from '../../core/errors.js'
import { err, ok, type Result } from '../../core/result.js'
import { fetchWithRetry } from '../../core/retry.js'
import type { AiAnswer } from '../../core/types.js'
import type { AiVisibilityProvider } from '../types.js'

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const REQUEST_TIMEOUT_MS = 60_000

/**
 * GEO ölçümünde amaç "en iyi modeli" kullanmak değil, sıradan bir kullanıcının
 * aldığı cevabı görmek. Flash modeli tüketici tarafında tipik olanı temsil eder.
 */
export const GEMINI_MODEL = 'gemini-2.5-flash'

const GeminiResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z.array(z.object({ text: z.string().optional() })).optional(),
          })
          .optional(),
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  error: z.object({ status: z.string().optional(), message: z.string().optional() }).optional(),
})

export const buildGeminiUrl = (apiKey: string, model: string = GEMINI_MODEL): string =>
  `${GEMINI_BASE_URL}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`

export const buildGeminiRequestBody = (query: string): string =>
  JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: query }] }],
    generationConfig: { maxOutputTokens: 2048 },
  })

/**
 * Gemini yanıtı → AiAnswer. Saf fonksiyon, ağ olmadan test edilir.
 *
 * Marka tespiti burada YAPILMAZ — o iş `collectors/detectMentions.ts`'in,
 * böylece mock ve gerçek sağlayıcı aynı tespit mantığından geçer.
 */
export const geminiResponseToAnswer = (raw: unknown, query: string): Result<AiAnswer, ProviderError> => {
  const parsed = GeminiResponseSchema.safeParse(raw)
  if (!parsed.success) {
    return err(new ProviderError(GEMINI_MODEL, `Yanıt beklenen şemaya uymuyor ('${query}'): ${summarizeZodError(parsed.error.issues)}`))
  }
  if (parsed.data.error !== undefined) {
    return err(
      new ProviderError(
        GEMINI_MODEL,
        `Gemini hata döndü ('${query}'): ${parsed.data.error.status ?? ''} ${parsed.data.error.message ?? ''}`.trim(),
      ),
    )
  }
  const blockReason = parsed.data.promptFeedback?.blockReason
  if (blockReason !== undefined) {
    return err(new ProviderError(GEMINI_MODEL, `Sorgu güvenlik filtresine takıldı ('${query}'): ${blockReason}`))
  }

  const text = (parsed.data.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')
    .trim()

  if (text === '') {
    // Boş metni "marka geçmiyor" diye kaydetmek ölçümü sessizce bozardı:
    // gerçekte cevap hiç üretilmemiş olur.
    const reason = parsed.data.candidates?.[0]?.finishReason ?? 'bilinmiyor'
    return err(new ProviderError(GEMINI_MODEL, `Gemini boş cevap döndü ('${query}', finishReason: ${reason}).`))
  }

  return ok({ query, model: GEMINI_MODEL, text })
}

/**
 * Gemini AI görünürlük sağlayıcısı.
 *
 * Gemini birincil motor çünkü Google AI Overviews'ı besleyen model o — buradaki
 * görünürlük doğrudan arama sonuç sayfasına yansır. `sampleIndex` kullanılmaz:
 * belirsizlik zaten modelin kendisinden gelir, örnekleme çağrı sayısıyla yapılır.
 */
export const createGeminiAiVisibilityProvider = (apiKey: string): AiVisibilityProvider => ({
  name: GEMINI_MODEL,
  isMock: false,
  askQuery: async (query: string): Promise<Result<AiAnswer, ProviderError>> => {
    try {
      const response = await fetchWithRetry(buildGeminiUrl(apiKey), () => ({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: buildGeminiRequestBody(query),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }))
      if (!response.ok) {
        const hint = response.status === 429 ? ' (oran sınırı — çağrılar paralel gidiyor)' : ''
        return err(new ProviderError(GEMINI_MODEL, `'${query}' için Gemini ${response.status} döndü${hint}.`))
      }
      return geminiResponseToAnswer(await response.json(), query)
    } catch (cause) {
      return err(new ProviderError(GEMINI_MODEL, `'${query}' için Gemini çağrısı başarısız.`, { cause }))
    }
  },
})
