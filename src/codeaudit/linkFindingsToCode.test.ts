import { describe, expect, test } from 'vitest'
import type { Finding } from '../core/findings.js'
import { linkFindingsToCode } from './linkFindingsToCode.js'
import type { SourceFile } from './types.js'

const cwvFinding = (culpritSelector: string | null): Finding => ({
  category: 'cwv',
  severity: 'high',
  url: 'https://ornek.com/',
  culpritSelector,
  title: 'LCP yavaş',
  explanation: 'test',
  evidence: 'test',
  impact: 70,
  effort: 'medium',
  fixSnippet: null,
})

const sourceFile = (relPath: string, content: string): SourceFile => ({ relPath, ext: '.php', lineCount: content.split('\n').length, content })

describe('linkFindingsToCode', () => {
  test('bileşik seçicinin son sınıfını kaynakta bulur ve codeLocation doldurur', () => {
    const finding = cwvFinding('section.hero > img.banner')
    const files = [sourceFile('inc/anasayfa.php', '<div>\n<img class="banner" src="/x.jpg" />\n</div>')]
    const [result] = linkFindingsToCode([finding], files)
    expect(result?.codeLocation).toEqual({ file: 'inc/anasayfa.php', line: 2 })
  })

  test('salt etiket adı seçicisi (sınıf/id yok) codeLocation: null döner, uydurmaz', () => {
    const finding = cwvFinding('img')
    const files = [sourceFile('a.php', '<img class="banner" />')]
    const [result] = linkFindingsToCode([finding], files)
    expect(result?.codeLocation).toBeNull()
  })

  test('culpritSelector null ise codeLocation: null döner', () => {
    const [result] = linkFindingsToCode([cwvFinding(null)], [])
    expect(result?.codeLocation).toBeNull()
  })

  test('zaten codeLocation taşıyan bulguya dokunmaz', () => {
    const finding: Finding = { ...cwvFinding('.hero'), codeLocation: { file: 'onceden.php', line: 5 } }
    const files = [sourceFile('baska.php', '<div class="hero"></div>')]
    const [result] = linkFindingsToCode([finding], files)
    expect(result?.codeLocation).toEqual({ file: 'onceden.php', line: 5 })
  })

  test('kaynakta eşleşme yoksa codeLocation: null döner', () => {
    const finding = cwvFinding('.olmayan-sinif')
    const [result] = linkFindingsToCode([finding], [sourceFile('a.php', '<div class="baska"></div>')])
    expect(result?.codeLocation).toBeNull()
  })

  test('id seçicisi de çalışır', () => {
    const finding = cwvFinding('#hero-banner')
    const files = [sourceFile('a.php', '<div id="hero-banner"></div>')]
    const [result] = linkFindingsToCode([finding], files)
    expect(result?.codeLocation).toEqual({ file: 'a.php', line: 1 })
  })

  test('className= (JSX) biçimini de tanır', () => {
    const finding = cwvFinding('.hero-title')
    const files = [sourceFile('page.tsx', '<h1 className="hero-title">x</h1>')]
    const [result] = linkFindingsToCode([finding], files)
    expect(result?.codeLocation?.file).toBe('page.tsx')
  })

  test('orijinal finding mutate edilmez — yeni kopya döner', () => {
    const finding = cwvFinding('.hero')
    const files = [sourceFile('a.php', '<div class="hero"></div>')]
    linkFindingsToCode([finding], files)
    expect(finding.codeLocation).toBeUndefined()
  })

  test('ilk dosyada bulunamazsa ikinci dosyada aramaya devam eder', () => {
    const finding = cwvFinding('.footer-cta')
    const files = [sourceFile('header.php', '<div class="other"></div>'), sourceFile('footer.php', '<a class="footer-cta">Ara</a>')]
    const [result] = linkFindingsToCode([finding], files)
    expect(result?.codeLocation?.file).toBe('footer.php')
  })

  test('birden fazla finding bağımsız işlenir', () => {
    const files = [sourceFile('a.php', '<div class="x"></div>\n<div class="y"></div>')]
    const results = linkFindingsToCode([cwvFinding('.x'), cwvFinding('.y'), cwvFinding('.z')], files)
    expect(results[0]?.codeLocation?.line).toBe(1)
    expect(results[1]?.codeLocation?.line).toBe(2)
    expect(results[2]?.codeLocation).toBeNull()
  })
})
