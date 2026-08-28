import { z } from 'zod'
import { DEFAULT_MOCK_SEED } from './constants.js'

/** config/project.json şeması — kullanıcının düzenlediği tek dosya burada doğrulanır. */
export const ProjectConfigSchema = z.object({
  domain: z.string().min(1, 'domain boş olamaz'),
  brandName: z.string().min(1, 'brandName boş olamaz'),
  brandTokens: z.array(z.string().min(1)).min(1, 'en az bir brandToken gerekli'),
  seedCompetitors: z.array(z.string().min(1)).default([]),
  seedKeywords: z.array(z.string().min(1)).min(1, 'en az bir seedKeyword gerekli'),
  aiQueries: z.array(z.string().min(1)).default([]),
  auditUrls: z.array(z.string().url('auditUrls geçerli URL olmalı')).default([]),
  locale: z.string().default('tr-TR'),
  mockSeed: z.number().int().default(DEFAULT_MOCK_SEED),
  /** Faz 2 crawler bütçesi — client başına, tek bir çalıştırmada taranacak üst sınır. */
  crawlMaxPages: z.number().int().positive().default(60),
  crawlMaxDepth: z.number().int().positive().default(3),
  /** robots.txt'e ek olarak taranmayacak path'ler, örn. ["/cart", "/wp-admin"]. */
  crawlExcludePaths: z.array(z.string().min(1)).default([]),
  /** Faz 3 kod denetçisi — müşteri kaynak kodunun yerel yolu. Verilmezse kod denetimi atlanır. */
  codePath: z.string().min(1).optional(),
})

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

const optionalKey = z.preprocess(emptyToUndefined, z.string().optional())

/** Ortam değişkenleri — hepsi opsiyonel; boş string "yok" sayılır. */
export const EnvSchema = z.object({
  SERPAPI_KEY: optionalKey,
  DATAFORSEO_LOGIN: optionalKey,
  DATAFORSEO_PASSWORD: optionalKey,
  PAGESPEED_API_KEY: optionalKey,
  GSC_CLIENT_EMAIL: optionalKey,
  GSC_PRIVATE_KEY: optionalKey,
  /** CrUX (Chrome UX Report) — gerçek kullanıcı p75 alan verisi, rakipler dahil. Opsiyonel. */
  CRUX_API_KEY: optionalKey,
  /**
   * AI görünürlük (GEO) birincil motoru — Google AI Overviews'ı besleyen model
   * Gemini olduğu için buradaki görünürlük doğrudan arama sonucuna yansır.
   */
  GEMINI_API_KEY: optionalKey,
  ANTHROPIC_API_KEY: optionalKey,
  /**
   * Teknik denetim kaynağı. 'lighthouse' lokalde Chrome başlatır — anahtar gerektirmez
   * ama Chrome kurulu olmalı ve yavaştır, bu yüzden açık tercih olarak istenir.
   */
  TECH_AUDIT_PROVIDER: z.preprocess(emptyToUndefined, z.enum(['mock', 'lighthouse']).optional()),
  /**
   * Crawler anahtar gerektirmez (yalnız fetch) ama müşterinin canlı sitesine gerçek istek
   * atar — TECH_AUDIT_PROVIDER=lighthouse ile aynı gerekçeyle açık opt-in ister, sessizce
   * gerçeğe düşmez.
   */
  CRAWL_PROVIDER: z.preprocess(emptyToUndefined, z.enum(['mock', 'live']).optional()),
})

export type Env = z.infer<typeof EnvSchema>
