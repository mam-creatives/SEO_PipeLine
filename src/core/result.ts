import { AppError } from './errors.js'

/**
 * Modül sınırlarında throw yerine kullanılan Result tipi.
 * Sağlayıcılar ve collector'lar hata durumunu açıkça döndürür.
 */
export type Result<T, E extends AppError = AppError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }

export const ok = <T>(value: T): { readonly ok: true; readonly value: T } => ({ ok: true, value })

export const err = <E extends AppError>(error: E): { readonly ok: false; readonly error: E } => ({
  ok: false,
  error,
})

export const isOk = <T, E extends AppError>(result: Result<T, E>): result is { ok: true; value: T } =>
  result.ok

export const unwrapOr = <T, E extends AppError>(result: Result<T, E>, fallback: T): T =>
  result.ok ? result.value : fallback
