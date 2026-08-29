import { describe, expect, test } from 'vitest'
import { buildSpawnArgs, formatSummary, runAllClients, type ClientRunResult } from './researchAllPipeline.js'
import type { ClientTarget } from './discoverClients.js'

const target = (overrides: Partial<ClientTarget> = {}): ClientTarget => ({
  configPath: 'config/a.json',
  domain: 'a.com',
  slug: 'a-com',
  dbPath: 'data/a-com.db',
  logPath: 'logs/2026-08-29_a-com.log',
  ...overrides,
})

describe('buildSpawnArgs', () => {
  test('research.ts\'i --config ile hedef config yoluna işaret ederek çağırır', () => {
    const { command, args } = buildSpawnArgs(target({ configPath: 'config/musteri.json' }))
    expect(command).toContain('tsx')
    expect(args).toEqual(['src/cli/research.ts', '--config', 'config/musteri.json'])
  })
})

describe('runAllClients', () => {
  test('müşterileri sırayla, tanımlanan sırayla çalıştırır', async () => {
    const order: string[] = []
    const fakeRunner = async (t: ClientTarget): Promise<ClientRunResult> => {
      order.push(t.slug)
      return { slug: t.slug, domain: t.domain, exitCode: 0, logPath: t.logPath }
    }

    const results = await runAllClients([target({ slug: 'a' }), target({ slug: 'b' })], fakeRunner)

    expect(order).toEqual(['a', 'b'])
    expect(results).toHaveLength(2)
  })

  test('bir müşterinin başarısız çıkış kodu diğerlerinin çalışmasını engellemez', async () => {
    const fakeRunner = async (t: ClientTarget): Promise<ClientRunResult> => ({
      slug: t.slug,
      domain: t.domain,
      exitCode: t.slug === 'a' ? 1 : 0,
      logPath: t.logPath,
    })

    const results = await runAllClients([target({ slug: 'a' }), target({ slug: 'b' })], fakeRunner)

    expect(results.map((r) => r.exitCode)).toEqual([1, 0])
  })

  test('hiç müşteri yoksa boş dizi döner', async () => {
    expect(await runAllClients([], async () => { throw new Error('çağrılmamalıydı') })).toEqual([])
  })
})

describe('formatSummary', () => {
  test('tümü başarılıysa başarı sayısını doğru raporlar', () => {
    const results: ClientRunResult[] = [
      { slug: 'a-com', domain: 'a.com', exitCode: 0, logPath: 'logs/a.log' },
      { slug: 'b-com', domain: 'b.com', exitCode: 0, logPath: 'logs/b.log' },
    ]
    const summary = formatSummary(results)
    expect(summary).toContain('2 başarılı, 0 başarısız')
    expect(summary).toContain('✓ a.com')
  })

  test('başarısız müşteri varken hem sayıyı hem işareti doğru gösterir', () => {
    const results: ClientRunResult[] = [
      { slug: 'a-com', domain: 'a.com', exitCode: 0, logPath: 'logs/a.log' },
      { slug: 'b-com', domain: 'b.com', exitCode: 1, logPath: 'logs/b.log' },
    ]
    const summary = formatSummary(results)
    expect(summary).toContain('1 başarılı, 1 başarısız')
    expect(summary).toContain('✗ b.com (b-com) — log: logs/b.log')
  })

  test('boş sonuç listesinde 0/0 raporlar', () => {
    expect(formatSummary([])).toContain('Toplam 0 müşteri: 0 başarılı, 0 başarısız.')
  })
})
