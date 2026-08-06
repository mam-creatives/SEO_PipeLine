import { z } from 'zod'
import { ProviderError } from '../../core/errors.js'
import type { AiVisibilityProvider } from '../types.js'

/**
 * Anthropic Claude AI görünürlük sağlayıcısı — İSKELET.
 * Sorguyu gerçek kullanıcı gibi Claude'a sorar; dönen cevapta marka/rakip
 * tespitini collectors/detectMentions.ts yapar (mock ile aynı mantık).
 * Örnekleme başına ayrı istek atılır — cevaplar deterministik değildir, bu istenen davranıştır.
 */

export const ANTHROPIC_MESSAGES_ENDPOINT = 'https://api.anthropic.com/v1/messages'
export const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'

export const AnthropicResponseSchema = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  model: z.string(),
})

export const buildAnthropicRequestBody = (query: string): string =>
  JSON.stringify({
    model: ANTHROPIC_MODEL,
    max_tokens: 512,
    messages: [{ role: 'user', content: query }],
  })

export const createAnthropicAiVisibilityProvider = (_apiKey: string): AiVisibilityProvider => ({
  name: ANTHROPIC_MODEL,
  isMock: false,
  askQuery: async (query) => {
    throw new ProviderError(
      'anthropic',
      `NOT_IMPLEMENTED: '${query}' sorgusu için Claude çağrısı henüz yazılmadı. ` +
        `${ANTHROPIC_MESSAGES_ENDPOINT} adresine x-api-key + anthropic-version başlıklarıyla POST at, ` +
        `AnthropicResponseSchema ile doğrula, content[0].text'i AiAnswer olarak döndür.`,
    )
  },
})
