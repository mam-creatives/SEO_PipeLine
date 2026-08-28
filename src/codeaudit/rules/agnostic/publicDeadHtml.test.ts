import { describe, expect, test } from 'vitest'
import type { SourceFile } from '../../types.js'
import { detectPublicDeadHtml } from './publicDeadHtml.js'

const htmlFile = (relPath: string): SourceFile => ({ relPath, ext: '.html', lineCount: 10, content: '<html></html>' })
const phpFile = (relPath: string): SourceFile => ({ relPath, ext: '.php', lineCount: 1, content: '<?php ?>' })

describe('detectPublicDeadHtml', () => {
  test('.html dosyası yoksa bulgu üretmez', () => {
    expect(detectPublicDeadHtml([phpFile('index.php')])).toEqual([])
  })

  test('tek .html dosyası varsa low severity bulgu üretir', () => {
    const findings = detectPublicDeadHtml([htmlFile('template/about.html')])
    expect(findings).toHaveLength(1)
    expect(findings[0]?.severity).toBe('low')
    expect(findings[0]?.evidence).toContain('template/about.html')
  })

  test('10+ .html dosyası varsa severity medium olur', () => {
    const files = Array.from({ length: 12 }, (_, i) => htmlFile(`template/page${i}.html`))
    const findings = detectPublicDeadHtml(files)
    expect(findings[0]?.severity).toBe('medium')
    expect(findings[0]?.title).toContain('12 statik')
  })

  test('5\'ten fazla dosyada evidence örnekle kırpılır', () => {
    const files = Array.from({ length: 8 }, (_, i) => htmlFile(`template/page${i}.html`))
    const findings = detectPublicDeadHtml(files)
    expect(findings[0]?.evidence).toContain('+3 daha')
  })

  test('.htm uzantısı da sayılır', () => {
    const findings = detectPublicDeadHtml([{ relPath: 'eski.htm', ext: '.htm', lineCount: 1, content: '' }])
    expect(findings).toHaveLength(1)
  })

  test('tüm .html dosyaları tek bulguda toplanır, dosya başına ayrı değil', () => {
    const files = [htmlFile('a.html'), htmlFile('b.html')]
    expect(detectPublicDeadHtml(files)).toHaveLength(1)
  })
})
