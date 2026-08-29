import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { discoverClients } from './discoverClients.js'

let configDir: string
const logsDir = 'logs'

const validConfig = (domain: string): string =>
  JSON.stringify({
    domain,
    brandName: 'Test',
    brandTokens: ['test'],
    seedCompetitors: [],
    seedKeywords: ['test'],
    aiQueries: [],
    auditUrls: [],
    locale: 'tr-TR',
    mockSeed: 42,
  })

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), 'seo-discoverclients-test-'))
})

afterEach(() => {
  rmSync(configDir, { recursive: true, force: true })
})

describe('discoverClients', () => {
  test('configDir altındaki her *.json dosyasını bir müşteri olarak döner', () => {
    writeFileSync(join(configDir, 'a.json'), validConfig('a.com'))
    writeFileSync(join(configDir, 'b.json'), validConfig('b.com'))

    const targets = discoverClients(configDir, logsDir)

    expect(targets).toHaveLength(2)
    expect(targets[0]).toMatchObject({
      configPath: join(configDir, 'a.json'),
      domain: 'a.com',
      slug: 'a-com',
      dbPath: 'data/a-com.db',
    })
  })

  test('slug/dbPath resolveCliPaths ile aynı türetimi kullanır (data/<slugify(domain)>.db)', () => {
    writeFileSync(join(configDir, 'mam.json'), validConfig('mamcreatives.com'))
    const [target] = discoverClients(configDir, logsDir)
    expect(target?.dbPath).toBe('data/mamcreatives-com.db')
  })

  test('logPath logsDir altında tarih + slug içerir', () => {
    writeFileSync(join(configDir, 'a.json'), validConfig('a.com'))
    const [target] = discoverClients(configDir, logsDir)
    expect(target?.logPath).toMatch(/^logs\/\d{4}-\d{2}-\d{2}_a-com\.log$/)
  })

  test('.json olmayan dosyalar yok sayılır', () => {
    writeFileSync(join(configDir, 'readme.md'), '# not a config')
    expect(discoverClients(configDir, logsDir)).toEqual([])
  })

  test('bozuk bir config diğerlerini düşürmez, atlanır', () => {
    writeFileSync(join(configDir, 'broken.json'), '{ not valid json')
    writeFileSync(join(configDir, 'ok.json'), validConfig('ok.com'))

    const targets = discoverClients(configDir, logsDir)

    expect(targets).toHaveLength(1)
    expect(targets[0]?.domain).toBe('ok.com')
  })

  test('doğrulanamayan (şemaya uymayan) config atlanır', () => {
    writeFileSync(join(configDir, 'invalid.json'), JSON.stringify({ domain: 'x.com' }))
    writeFileSync(join(configDir, 'ok.json'), validConfig('ok.com'))

    const targets = discoverClients(configDir, logsDir)

    expect(targets).toHaveLength(1)
    expect(targets[0]?.domain).toBe('ok.com')
  })

  test('configDir mevcut değilse boş dizi döner, fırlatmaz', () => {
    expect(discoverClients(join(configDir, 'yok'), logsDir)).toEqual([])
  })

  test('sonuçlar dosya adına göre sıralı döner', () => {
    writeFileSync(join(configDir, 'z.json'), validConfig('z.com'))
    writeFileSync(join(configDir, 'a.json'), validConfig('a.com'))

    const targets = discoverClients(configDir, logsDir)

    expect(targets.map((target) => target.domain)).toEqual(['a.com', 'z.com'])
  })
})
