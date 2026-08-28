import { describe, expect, test } from 'vitest'
import type { SourceFile } from '../../types.js'
import { detectHeavyAssets } from './heavyAssets.js'

const file = (relPath: string, content: string): SourceFile => ({ relPath, ext: '.php', lineCount: content.split('\n').length, content })

describe('detectHeavyAssets', () => {
  test('webp/avif alternatifi olmayan jpg/png referansı bulgu üretir', () => {
    const findings = detectHeavyAssets([file('index.php', '<img src="/upload/logo.png" alt="Logo" />')])
    expect(findings).toHaveLength(1)
    expect(findings[0]?.title).toContain('modern format')
    expect(findings[0]?.evidence).toContain('/upload/logo.png')
  })

  test('webp içeren dosyalarda o img sayılmaz', () => {
    const findings = detectHeavyAssets([file('index.php', '<img src="/upload/logo.webp" alt="Logo" />')])
    expect(findings).toHaveLength(0)
  })

  test('loading="lazy" eksikse severity medium olur', () => {
    const findings = detectHeavyAssets([file('index.php', '<img src="/a.jpg" />')])
    expect(findings[0]?.severity).toBe('medium')
  })

  test('loading="lazy" varsa severity low olur', () => {
    const findings = detectHeavyAssets([file('index.php', '<img src="/a.jpg" loading="lazy" />')])
    expect(findings[0]?.severity).toBe('low')
  })

  test('aynı dosyadaki birden fazla img tek bulguda toplanır', () => {
    const content = '<img src="/a.jpg" /><img src="/b.png" /><img src="/c.jpeg" />'
    const findings = detectHeavyAssets([file('index.php', content)])
    expect(findings).toHaveLength(1)
    expect(findings[0]?.title).toContain('3 görsel')
  })

  test('img etiketi yoksa bulgu üretmez', () => {
    expect(detectHeavyAssets([file('index.php', '<p>Merhaba</p>')])).toEqual([])
  })

  test('codeLocation dosya yolunu taşır', () => {
    const findings = detectHeavyAssets([file('partial/header.php', '<img src="/a.jpg" />')])
    expect(findings[0]?.codeLocation?.file).toBe('partial/header.php')
  })

  test('5\'ten fazla görsel varsa evidence kırpılır ve "+N daha" eklenir', () => {
    const content = Array.from({ length: 7 }, (_, i) => `<img src="/img${i}.jpg" />`).join('')
    const findings = detectHeavyAssets([file('index.php', content)])
    expect(findings[0]?.evidence).toContain('+2 daha')
  })
})
