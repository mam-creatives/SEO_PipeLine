/** Uygulama genelinde kullanılan hata hiyerarşisi. Her hata bir `code` taşır. */
export class AppError extends Error {
  readonly code: string

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = new.target.name
    this.code = code
  }
}

export class ConfigError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('CONFIG_ERROR', message, options)
  }
}

export class ProviderError extends AppError {
  readonly provider: string

  constructor(provider: string, message: string, options?: { cause?: unknown }) {
    super('PROVIDER_ERROR', `[${provider}] ${message}`, options)
    this.provider = provider
  }
}

export class StorageError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('STORAGE_ERROR', message, options)
  }
}

/** Bildirim kanalı hatası (ör. Telegram). Bir bildirimin gönderilememesi asla veri toplamayı 'başarısız' yapmamalı — bkz. notify/telegram.ts. */
export class NotifyError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('NOTIFY_ERROR', message, options)
  }
}

/**
 * Zod hatasını tek satırlık okunabilir özete indirger.
 *
 * `error.message` tüm sorunları biçimlendirilmiş JSON olarak taşır; 15 keyword'lük
 * bir yanıtta bu 100+ satır eder ve olduğu gibi rapora düşerse raporu okunmaz kılar
 * (fiilen yaşandı). İlk birkaç sorun sebebi anlamak için yeterli.
 */
export const summarizeZodError = (
  issues: readonly { readonly path: readonly (string | number)[]; readonly message: string }[],
  maxIssues = 3,
): string => {
  const shown = issues
    .slice(0, maxIssues)
    .map((issue) => `${issue.path.join('.') || '(kök)'}: ${issue.message}`)
    .join('; ')
  const rest = issues.length - maxIssues
  return rest > 0 ? `${shown} (+${rest} sorun daha)` : shown
}

export class ValidationError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('VALIDATION_ERROR', message, options)
  }
}
