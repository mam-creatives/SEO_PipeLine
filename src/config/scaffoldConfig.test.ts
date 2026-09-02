import { describe, expect, test } from 'vitest'
import { buildScaffoldConfig, guessBrandName } from './scaffoldConfig.js'
import { ProjectConfigSchema } from './schema.js'

describe('guessBrandName', () => {
  test('tek kelimelik domaini başharfi büyük şekilde döner', () => {
    expect(guessBrandName('mamcreatives.com')).toBe('Mamcreatives')
  })

  test('tire ile ayrılmış domaini kelime kelime büyütür', () => {
    expect(guessBrandName('mam-creatives.com')).toBe('Mam Creatives')
  })

  test('alt çizgiyle ayrılmış domaini de aynı şekilde işler', () => {
    expect(guessBrandName('mam_creatives.com')).toBe('Mam Creatives')
  })

  test('yalnız ilk etiketi kullanır, alt domain/TLD\'nin geri kalanını yok sayar', () => {
    expect(guessBrandName('edvido.com.tr')).toBe('Edvido')
  })
})

describe('buildScaffoldConfig', () => {
  test('domain dışındaki her şey domainden türetilir ya da boş varsayılandır', () => {
    const config = buildScaffoldConfig('mamcreatives.com')
    expect(config.domain).toBe('mamcreatives.com')
    expect(config.brandName).toBe('Mamcreatives')
    expect(config.brandTokens).toEqual(['mamcreatives'])
    expect(config.seedKeywords).toEqual(['mamcreatives'])
    expect(config.auditUrls).toEqual(['https://mamcreatives.com/'])
    expect(config.seedCompetitors).toEqual([])
    expect(config.aiQueries).toEqual([])
    expect(config.crawlExcludePaths).toEqual([])
    expect(config.locale).toBe('tr-TR')
    expect(config.crawlEnabled).toBe(true)
  })

  // Dış denetim bulgusu (2026-09-01) — "yalnız domain ile ilerle" isteğinin sözleşmesi:
  // üretilen iskelet HİÇBİR elle düzenleme yapılmadan şemayı geçmeli, aksi halde
  // kullanıcı `npm run doctor` çalıştırana kadar bunu fark etmez.
  test('elle düzenlenmeden ProjectConfigSchema\'yı geçer', () => {
    const config = buildScaffoldConfig('mam-creatives.com')
    const result = ProjectConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  test('farklı domainler çakışmayan slug\'lara karşılık gelen konfigler üretir', () => {
    const a = buildScaffoldConfig('a.com')
    const b = buildScaffoldConfig('b.com')
    expect(a.domain).not.toBe(b.domain)
  })
})
