import type { Env } from '../config/schema.js'
import { NotifyError } from '../core/errors.js'
import { err, ok, type Result } from '../core/result.js'

const REQUEST_TIMEOUT_MS = 10_000
const sendMessageEndpoint = (token: string): string => `https://api.telegram.org/bot${token}/sendMessage`

export interface TelegramConfig {
  readonly token: string
  readonly chatId: string
}

/**
 * researchAll'ın çocuk süreç sonuçlarından bildirime yetecek minimum alan seti.
 * BİLEREK `ClientRunResult`'ı (researchAllPipeline.ts, cli katmanı) import etmiyor —
 * repo'da hiçbir dosya `cli/`den içe aktarmıyor (katmanlama: cli üst katman, tersi yok).
 * Yapısal olarak uyumlu olduğu için `ClientRunResult[]` doğrudan buraya geçirilebilir.
 */
export interface ClientOutcome {
  readonly domain: string
  readonly exitCode: number
  readonly logPath: string
}

/**
 * `codePath` (Faz 3) deseniyle aynı: yapılandırılmışsa çalışır, verilmezse sessizce
 * atlanır (`null`). Ama YARIM yapılandırma (biri var biri yok) provider registry'nin
 * `requireAllOrNone` politikasıyla aynı gerekçeyle sessizce yok sayılmaz — yüksek
 * sesle hata verir, aksi halde kullanıcı "bildirim gelmiyor" diye günlerce debug eder.
 */
export const resolveTelegramConfig = (env: Env): TelegramConfig | null => {
  const token = env.TELEGRAM_BOT_TOKEN
  const chatId = env.TELEGRAM_CHAT_ID
  if (token === undefined && chatId === undefined) return null
  if (token !== undefined && chatId !== undefined) return { token, chatId }

  const missing = token === undefined ? 'TELEGRAM_BOT_TOKEN' : 'TELEGRAM_CHAT_ID'
  throw new NotifyError(
    `Telegram bildirimi için TELEGRAM_BOT_TOKEN ve TELEGRAM_CHAT_ID'nin ikisi de gerekli. Eksik: ${missing}. ` +
      `Ya tamamlayın ya da hepsini .env'den kaldırın — yarım yapılandırmayla sessizce atlanmaz.`,
  )
}

/**
 * Yalnız en az bir başarısızlık varken bildirim gönderilir. Her koşuda "her şey
 * yolunda" mesajı bildirim körlüğü yaratır — `npm run status` zaten bunu sorulduğunda
 * söylüyor (bkz. plan X.4).
 */
export const shouldNotify = (results: readonly ClientOutcome[]): boolean =>
  results.some((result) => result.exitCode !== 0)

/** Telegram mesaj metni — saf, test edilir. */
export const formatRunSummary = (results: readonly ClientOutcome[]): string => {
  const failed = results.filter((result) => result.exitCode !== 0)
  const succeeded = results.length - failed.length
  const lines = [
    `⚠️ SEO araştırma koşusu: ${failed.length} başarısız, ${succeeded} başarılı.`,
    ...failed.map((result) => `✗ ${result.domain} — log: ${result.logPath}`),
  ]
  return lines.join('\n')
}

/**
 * İnce I/O kabuğu — native `fetch`, yeni bağımlılık yok. Gönderim başarısız olursa
 * `NotifyError` döner ama fırlatmaz: çağıran (researchAll.ts) bunu loglar, batch'i
 * 'başarısız' saymaz — bildirim kanalının çökmesi tamamlanmış bir veri toplamayı
 * geçersiz kılmamalı.
 */
export const sendTelegramMessage = async (config: TelegramConfig, text: string): Promise<Result<void, NotifyError>> => {
  try {
    const response = await fetch(sendMessageEndpoint(config.token), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: config.chatId, text }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) {
      return err(new NotifyError(`Telegram API ${response.status} döndü.`))
    }
    return ok(undefined)
  } catch (cause) {
    return err(new NotifyError('Telegram mesajı gönderilemedi.', { cause }))
  }
}
