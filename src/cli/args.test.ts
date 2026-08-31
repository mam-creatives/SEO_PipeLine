import { describe, expect, test } from 'vitest'
import { ConfigError } from '../core/errors.js'
import { resolveCliPaths } from './args.js'

const failIfCalled = (): string => {
  throw new Error('readDomain çağrılmamalıydı')
}

describe('resolveCliPaths', () => {
  // Dış denetim bulgusu (2026-08-31, BLOKER 2) — bu test önceden `--config` verilmeden
  // sabit `data/seo.db`'ye düştüğünü doğruluyordu; `npm run research` ve
  // `npm run research -- --config config/project.json` AYNI müşteri için İKİ FARKLI
  // veritabanına yazıyordu (trend geçmişi çatallanıyordu). Artık `--config` verilmese
  // bile varsayılan config dosyası okunur ve dbPath domain'den türer — tıpkı `--config`
  // açıkça verildiğinde olduğu gibi.
  test('argüman yoksa varsayılan config yolu kullanılır ve dbPath domain\'den türer', () => {
    const paths = resolveCliPaths([], () => 'mamcreatives.com')
    expect(paths).toEqual({ configPath: 'config/project.json', dbPath: 'data/mamcreatives-com.db' })
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

  test('--code <yol> verilince codePathOverride dolar', () => {
    const paths = resolveCliPaths(['--code', '/Users/x/site'], () => 'mamcreatives.com')
    expect(paths.codePathOverride).toBe('/Users/x/site')
  })

  test('--code=<yol> biçimi de kabul edilir', () => {
    const paths = resolveCliPaths(['--code=/Users/x/site'], () => 'mamcreatives.com')
    expect(paths.codePathOverride).toBe('/Users/x/site')
  })

  test('--code verilmezse codePathOverride undefined olur', () => {
    const paths = resolveCliPaths([], () => 'mamcreatives.com')
    expect(paths.codePathOverride).toBeUndefined()
  })

  test('--config ve --code birlikte kullanılabilir', () => {
    const paths = resolveCliPaths(['--config', 'config/musteri.json', '--code', '/Users/x/site'], () => 'musteri.com')
    expect(paths).toEqual({ configPath: 'config/musteri.json', dbPath: 'data/musteri-com.db', codePathOverride: '/Users/x/site' })
  })

  test('--code değeri eksikse ConfigError fırlatır', () => {
    expect(() => resolveCliPaths(['--code'], failIfCalled)).toThrow(ConfigError)
  })
})
