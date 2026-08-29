import { describe, expect, test } from 'vitest'
import type { Env } from '../config/schema.js'
import { NotifyError } from '../core/errors.js'
import { formatRunSummary, resolveTelegramConfig, shouldNotify, type ClientOutcome } from './telegram.js'

const baseEnv: Env = {
  SERPAPI_KEY: undefined,
  DATAFORSEO_LOGIN: undefined,
  DATAFORSEO_PASSWORD: undefined,
  PAGESPEED_API_KEY: undefined,
  GSC_CLIENT_EMAIL: undefined,
  GSC_PRIVATE_KEY: undefined,
  CRUX_API_KEY: undefined,
  GEMINI_API_KEY: undefined,
  ANTHROPIC_API_KEY: undefined,
  TECH_AUDIT_PROVIDER: undefined,
  CRAWL_PROVIDER: undefined,
  TELEGRAM_BOT_TOKEN: undefined,
  TELEGRAM_CHAT_ID: undefined,
}

describe('resolveTelegramConfig', () => {
  test('ikisi de yoksa null döner (sessizce atlanır)', () => {
    expect(resolveTelegramConfig(baseEnv)).toBeNull()
  })

  test('ikisi de varsa TelegramConfig döner', () => {
    const config = resolveTelegramConfig({ ...baseEnv, TELEGRAM_BOT_TOKEN: 'tok', TELEGRAM_CHAT_ID: 'chat' })
    expect(config).toEqual({ token: 'tok', chatId: 'chat' })
  })

  test('yalnız token varsa NotifyError fırlatır (yarım yapılandırma sessizce atlanmaz)', () => {
    expect(() => resolveTelegramConfig({ ...baseEnv, TELEGRAM_BOT_TOKEN: 'tok' })).toThrow(NotifyError)
  })

  test('yalnız chatId varsa NotifyError fırlatır', () => {
    expect(() => resolveTelegramConfig({ ...baseEnv, TELEGRAM_CHAT_ID: 'chat' })).toThrow(NotifyError)
  })
})

describe('shouldNotify', () => {
  test('tüm müşteriler başarılıysa false döner', () => {
    const results: ClientOutcome[] = [{ domain: 'a.com', exitCode: 0, logPath: 'logs/a.log' }]
    expect(shouldNotify(results)).toBe(false)
  })

  test('en az bir başarısız varsa true döner', () => {
    const results: ClientOutcome[] = [
      { domain: 'a.com', exitCode: 0, logPath: 'logs/a.log' },
      { domain: 'b.com', exitCode: 1, logPath: 'logs/b.log' },
    ]
    expect(shouldNotify(results)).toBe(true)
  })

  test('boş listede false döner', () => {
    expect(shouldNotify([])).toBe(false)
  })
})

describe('formatRunSummary', () => {
  test('başarısız müşteri varken sayıyı ve domain/log detayını içerir', () => {
    const results: ClientOutcome[] = [
      { domain: 'a.com', exitCode: 0, logPath: 'logs/a.log' },
      { domain: 'b.com', exitCode: 1, logPath: 'logs/b.log' },
    ]
    const summary = formatRunSummary(results)
    expect(summary).toContain('1 başarısız, 1 başarılı')
    expect(summary).toContain('✗ b.com — log: logs/b.log')
    expect(summary).not.toContain('a.com —')
  })

  test('tümü başarılıysa 0 başarısız gösterir, satır listesi boş', () => {
    const results: ClientOutcome[] = [{ domain: 'a.com', exitCode: 0, logPath: 'logs/a.log' }]
    expect(formatRunSummary(results)).toBe('⚠️ SEO araştırma koşusu: 0 başarısız, 1 başarılı.')
  })
})
