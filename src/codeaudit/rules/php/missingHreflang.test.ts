import { describe, expect, test } from 'vitest'
import type { SourceFile } from '../../types.js'
import { detectMissingHreflang } from './missingHreflang.js'

const htaccess = (content: string): SourceFile => ({ relPath: '.htaccess', ext: '', lineCount: 1, content })
const phpFile = (relPath: string, content: string): SourceFile => ({ relPath, ext: '.php', lineCount: 1, content })

describe('detectMissingHreflang', () => {
  test('locale-routing sinyali yoksa bulgu üretmez (tek dilli site)', () => {
    const files = [htaccess('RewriteRule ^urun/([a-z-]+)$ index.php?sayfa=urun&link=$1 [L]')]
    expect(detectMissingHreflang(files)).toEqual([])
  })

  test('locale-routing var ve hreflang hiç yoksa bulgu üretir', () => {
    const files = [htaccess('RewriteRule ^([A-Za-z0-9-]+)/$ index.php?dil=$1 [L]'), phpFile('index.php', '<title>x</title>')]
    const findings = detectMissingHreflang(files)
    expect(findings).toHaveLength(1)
    expect(findings[0]?.title).toContain('hreflang yok')
  })

  test('locale-routing var ama hreflang de varsa bulgu üretmez', () => {
    const files = [
      htaccess('RewriteRule ^([A-Za-z0-9-]+)/$ index.php?dil=$1 [L]'),
      phpFile('index.php', '<link rel="alternate" hreflang="tr" href="https://x.com/tr" />'),
    ]
    expect(detectMissingHreflang(files)).toEqual([])
  })

  test('.htaccess dosyası hiç yoksa bulgu üretmez', () => {
    expect(detectMissingHreflang([phpFile('index.php', '<title>x</title>')])).toEqual([])
  })

  test('lang= parametresi de locale sinyali sayılır', () => {
    const files = [htaccess('RewriteRule ^([a-z]+)/$ index.php?lang=$1 [L]')]
    expect(detectMissingHreflang(files)).toHaveLength(1)
  })

  test('evidence .htaccess dosya yolunu içerir', () => {
    const files = [htaccess('RewriteRule ^([a-z]+)/$ index.php?dil=$1 [L]')]
    expect(detectMissingHreflang(files)[0]?.evidence).toContain('.htaccess')
  })
})
