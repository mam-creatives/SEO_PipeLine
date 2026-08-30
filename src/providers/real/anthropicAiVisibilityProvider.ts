import { z } from 'zod'
import { ProviderError, summarizeZodError } from '../../core/errors.js'
import { err, ok, type Result } from '../../core/result.js'
import type { AiAnswer } from '../../core/types.js'
import type { AiVisibilityProvider } from '../types.js'

const MESSAGES_ENDPOINT = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const REQUEST_TIMEOUT_MS = 60_000
const MAX_OUTPUT_TOKENS = 1024

/**
 * GEO ölçümünde amaç "en iyi modeli" kullanmak değil, sıradan bir kullanıcının aldığı cevabı
 * görmek — `geminiAiVisibilityProvider.ts`'teki aynı gerekçe. Haiku ailesi tüketici tarafında
 * hızlı/ucuz tipik modeli temsil eder.
 */
export const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'

const AnthropicResponseSchema = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
  stop_reason: z.string().optional().nullable(),
  model: z.string().optional(),
  type: z.string().optional(),
  error: z.object({ type: z.string().optional(), message: z.string().optional() }).optional(),
})

export const buildAnthropicRequestBody = (query: string, model: string = ANTHROPIC_MODEL): string =>
  JSON.stringify({
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [{ role: 'user', content: query }],
  })

export const buildAnthropicHeaders = (apiKey: string): Readonly<Record<string, string>> => ({
  'x-api-key': apiKey,
  'anthropic-version': ANTHROPIC_VERSION,
  'content-type': 'application/json',
})

/**
 * Anthropic yanıtı → AiAnswer. Saf fonksiyon, ağ olmadan test edilir.
 *
 * Marka tespiti burada YAPILMAZ — Gemini sağlayıcısıyla aynı gerekçe: o iş
 * `collectors/detectMentions.ts`'in, böylece hangi motor kullanılırsa kullanılsın aynı
 * tespit mantığından geçer.
 */
export const anthropicResponseToAnswer = (raw: unknown, query: string): Result<AiAnswer, ProviderError> => {
  const parsed = AnthropicResponseSchema.safeParse(raw)
  if (!parsed.success) {
    return err(
      new ProviderError(ANTHROPIC_MODEL, `Yanıt beklenen şemaya uymuyor ('${query}'): ${summarizeZodError(parsed.error.issues)}`),
    )
  }
  if (parsed.data.error !== undefined) {
    return err(
      new ProviderError(
        ANTHROPIC_MODEL,
        `Anthropic hata döndü ('${query}'): ${parsed.data.error.type ?? ''} ${parsed.data.error.message ?? ''}`.trim(),
      ),
    )
  }

  const text = (parsed.data.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('')
    .trim()

  if (text === '') {
    // Boş metni "marka geçmiyor" diye kaydetmek ölçümü sessizce bozardı — gerçekte cevap
    // hiç üretilmemiş olur (bkz. geminiResponseToAnswer'daki aynı karar).
    const reason = parsed.data.stop_reason ?? 'bilinmiyor'
    return err(new ProviderError(ANTHROPIC_MODEL, `Anthropic boş cevap döndü ('${query}', stop_reason: ${reason}).`))
  }

  return ok({ query, model: ANTHROPIC_MODEL, text })
}

/**
 * Anthropic AI görünürlük sağlayıcısı — Faz 4.3, Faz 1.7'nin tamamlanması.
 *
 * Tek-motor seçimi korunur: `registry.ts`'teki `selectAiVisibility` Gemini varsa Gemini'yi
 * tercih eder, yalnız Gemini yokken bu sağlayıcı devreye girer. Eşzamanlı çift-motor
 * karşılaştırma bilinçli olarak kapsam dışı (bkz. genel-plan.md Faz 4).
 */
export const createAnthropicAiVisibilityProvider = (apiKey: string): AiVisibilityProvider => ({
  name: ANTHROPIC_MODEL,
  isMock: false,
  askQuery: async (query: string): Promise<Result<AiAnswer, ProviderError>> => {
    try {
      const response = await fetch(MESSAGES_ENDPOINT, {
        method: 'POST',
        headers: buildAnthropicHeaders(apiKey),
        body: buildAnthropicRequestBody(query),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!response.ok) {
        const hint = response.status === 429 ? ' (oran sınırı — çağrılar paralel gidiyor)' : ''
        return err(new ProviderError(ANTHROPIC_MODEL, `'${query}' için Anthropic ${response.status} döndü${hint}.`))
      }
      return anthropicResponseToAnswer(await response.json(), query)
    } catch (cause) {
      return err(new ProviderError(ANTHROPIC_MODEL, `'${query}' için Anthropic çağrısı başarısız.`, { cause }))
    }
  },
})
