import { existsSync, readFileSync } from 'node:fs'
import { ConfigError } from '../core/errors.js'
import { EnvSchema, type Env } from './schema.js'

/** Çift tırnaklı değerlerde çözülen kaçış dizileri (POSIX shell davranışı). */
const ESCAPE_SEQUENCES: Readonly<Record<string, string>> = {
  n: '\n',
  r: '\r',
  t: '\t',
  '"': '"',
  '\\': '\\',
}

/**
 * Değeri tırnaklarından soyar.
 *
 * Çift tırnaklıysa kaçış dizileri çözülür, tek tırnaklıysa çözülmez — kabuk
 * davranışının aynısı. Bu şart: GSC private key'i çift tırnaklı ve içinde `\n`
 * taşıyor; çözülmezse PEM tek satır kalır ve RS256 imzalama sessizce başarısız olur.
 * Tek geçişli regex, `\\n` (kaçırılmış ters bölü + n) durumunu da doğru ele alır.
 */
export const unquoteEnvValue = (raw: string): string => {
  const isDoubleQuoted = raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')
  if (isDoubleQuoted) {
    return raw.slice(1, -1).replace(/\\(.)/g, (match, char: string) => ESCAPE_SEQUENCES[char] ?? match)
  }
  const isSingleQuoted = raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")
  return isSingleQuoted ? raw.slice(1, -1) : raw
}

/** Basit .env ayrıştırıcı — dotenv bağımlılığı yerine. */
export const parseEnvFile = (content: string): Readonly<Record<string, string>> => {
  const entries = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .flatMap((line) => {
      const separatorIndex = line.indexOf('=')
      if (separatorIndex === -1) return []
      const key = line.slice(0, separatorIndex).trim()
      const value = unquoteEnvValue(line.slice(separatorIndex + 1).trim())
      return key === '' ? [] : [[key, value] as const]
    })
  return Object.fromEntries(entries)
}

/**
 * .env dosyası + process.env'i birleştirip doğrular (process.env kazanır).
 * Geçersiz env → ConfigError; eksik anahtarlar hata değildir (mock moda düşülür).
 */
export const loadEnv = (envFilePath = '.env'): Env => {
  const fileVars = existsSync(envFilePath) ? parseEnvFile(readFileSync(envFilePath, 'utf-8')) : {}
  const merged = { ...fileVars, ...process.env }
  const parsed = EnvSchema.safeParse(merged)
  if (!parsed.success) {
    throw new ConfigError(`Ortam değişkenleri doğrulanamadı: ${parsed.error.message}`)
  }
  return parsed.data
}
