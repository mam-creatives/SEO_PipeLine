import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { ConfigError } from '../core/errors.js'
import { ProjectConfigSchema, type ProjectConfig } from './schema.js'

/** config/project.json'ı okur, ayrıştırır ve zod ile doğrular. Her hata açık mesajla ConfigError. */
export const loadProjectConfig = (configPath: string): ProjectConfig => {
  let raw: string
  try {
    raw = readFileSync(configPath, 'utf-8')
  } catch (cause) {
    throw new ConfigError(`Config dosyası okunamadı: ${configPath}`, { cause })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (cause) {
    throw new ConfigError(`Config dosyası geçerli JSON değil: ${configPath}`, { cause })
  }

  const result = ProjectConfigSchema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new ConfigError(`Config doğrulama hatası (${configPath}):\n${issues}`)
  }
  return result.data
}

/**
 * Keyword seti / rakip listesi değişince diff karşılaştırması yanıltıcı olur;
 * bu hash iki run'ın aynı config ile alınıp alınmadığını söyler.
 */
export const computeConfigHash = (config: ProjectConfig): string => {
  const canonical = JSON.stringify({
    domain: config.domain,
    seedKeywords: [...config.seedKeywords].sort(),
    seedCompetitors: [...config.seedCompetitors].sort(),
    aiQueries: [...config.aiQueries].sort(),
  })
  return createHash('sha256').update(canonical).digest('hex').slice(0, 12)
}
