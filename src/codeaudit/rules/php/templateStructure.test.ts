import { describe, expect, test } from 'vitest'
import type { SourceFile } from '../../types.js'
import { detectCommentedOutHeadings } from './templateStructure.js'

const file = (content: string): SourceFile => ({ relPath: 'inc/hizmet.php', ext: '.php', lineCount: content.split('\n').length, content })

describe('detectCommentedOutHeadings', () => {
  test('h1 hiç yoksa bulgu üretmez (bu kural yokluğu değil, ölü kodu tespit eder)', () => {
    expect(detectCommentedOutHeadings([file('<div>İçerik</div>')])).toEqual([])
  })

  test('canlı (yorumsuz) h1 varsa bulgu üretmez', () => {
    expect(detectCommentedOutHeadings([file('<h1>Başlık</h1>')])).toEqual([])
  })

  test('h1 yalnız yorum içindeyse bulgu üretir — gerçek inc/hizmet.php deseni', () => {
    const content = [
      '<!-- eski tasarım',
      '<div class="hero">',
      '  <h1 class="px-hero-title">Başlık</h1>',
      '</div>',
      '-->',
      '<div class="yeni-tasarim">İçerik</div>',
    ].join('\n')
    const findings = detectCommentedOutHeadings([file(content)])
    expect(findings).toHaveLength(1)
    expect(findings[0]?.severity).toBe('high')
    expect(findings[0]?.codeLocation?.line).toBe(3)
  })

  test('bir h1 yorumda bir h1 canlıysa bulgu üretmez (en az bir canlı h1 yeterli)', () => {
    const content = '<!-- <h1>eski</h1> -->\n<h1>yeni</h1>'
    expect(detectCommentedOutHeadings([file(content)])).toEqual([])
  })

  test('birden fazla dosyada bağımsız değerlendirilir', () => {
    const files = [file('<h1>canlı</h1>'), { ...file('<!-- <h1>ölü</h1> -->'), relPath: 'inc/hakkimizda.php' }]
    const findings = detectCommentedOutHeadings(files)
    expect(findings).toHaveLength(1)
    expect(findings[0]?.codeLocation?.file).toBe('inc/hakkimizda.php')
  })

  test('evidence dosya yolu ve satır numarasını içerir', () => {
    const findings = detectCommentedOutHeadings([file('<!-- <h1>x</h1> -->')])
    expect(findings[0]?.evidence).toContain('inc/hizmet.php:1')
  })
})
