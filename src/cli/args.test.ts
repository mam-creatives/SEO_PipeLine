import { describe, expect, test } from 'vitest'
import { ConfigError } from '../core/errors.js'
import { resolveCliPaths } from './args.js'

const failIfCalled = (): string => {
  throw new Error('readDomain çağrılmamalıydı')
}

describe('resolveCliPaths', () => {
  test('argüman yoksa mevcut varsayılan yolları döndürür', () => {
    const paths = resolveCliPaths([], failIfCalled)
    expect(paths).toEqual({ configPath: 'config/project.json', dbPath: 'data/seo.db' })
  })

  test('--config <yol> verilince dbPath domain\'den türer', () => {
    const paths = resolveCliPaths(['--config', 'config/musteri.json'], () => 'Örnek Ayakkabı Mağazası')
    expect(paths).toEqual({ configPath: 'config/musteri.json', dbPath: 'data/ornek-ayakkabi-magazasi.db' })
  })

  test('--config=<yol> biçimi de kabul edilir', () => {
    const paths = resolveCliPaths(['--config=config/musteri.json'], () => 'mamcreatives.com')
    expect(paths).toEqual({ configPath: 'config/musteri.json', dbPath: 'data/mamcreatives-com.db' })
  })

  test('--config değeri eksikse ConfigError fırlatır', () => {
    expect(() => resolveCliPaths(['--config'], failIfCalled)).toThrow(ConfigError)
  })

  test('bilinmeyen argüman ConfigError fırlatır', () => {
    expect(() => resolveCliPaths(['--foo'], failIfCalled)).toThrow(ConfigError)
  })

  test('bilinmeyen argüman --config\'ten sonra gelse bile yakalanır', () => {
    expect(() => resolveCliPaths(['--config', 'x.json', '--bar'], () => 'x.com')).toThrow(ConfigError)
  })
})
