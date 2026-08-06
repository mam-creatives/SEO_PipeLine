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

export class ValidationError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('VALIDATION_ERROR', message, options)
  }
}
