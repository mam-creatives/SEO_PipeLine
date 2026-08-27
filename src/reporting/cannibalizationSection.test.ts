import { describe, expect, test } from 'vitest'
import type { Finding } from '../core/findings.js'
import { renderCannibalizationFindingsHtml, renderCannibalizationFindingsMarkdown } from './cannibalizationSection.js'

const finding: Finding = {
  category: 'content',
  severity: 'high',
  url: 'https://ornek.com/urun',
  culpritSelector: null,
  title: '"ayakkabı" sorgusunda sayfa yamyamlığı (cannibalization)',
  explanation: 'İki sayfa aynı sorguda gösterime giriyor.',
  evidence: '"https://ornek.com/urun" 1000 gösterim, "https://ornek.com/blog/urun" 300 gösterim (%30)',
  impact: 61,
  effort: 'medium',
  fixSnippet: '<link rel="canonical" href="https://ornek.com/urun">',
}

describe('renderCannibalizationFindingsMarkdown', () => {
  test('bulgu yoksa boş string döner', () => {
    expect(renderCannibalizationFindingsMarkdown([])).toBe('')
  })

  test('bulgu varsa başlık, ciddiyet, emek rozeti, kanıt ve fix snippet içerir', () => {
    const markdown = renderCannibalizationFindingsMarkdown([finding])
    expect(markdown).toContain('### Sayfa Yamyamlığı (Cannibalization)')
    expect(markdown).toContain('🟡 ÖNEMLİ')
    expect(markdown).toContain('orta emek')
    expect(markdown).toContain('Kanıt: "https://ornek.com/urun" 1000 gösterim')
    expect(markdown).toContain('```\n<link rel="canonical" href="https://ornek.com/urun">\n```')
  })

  test('bulgular ciddiyete göre sıralanır', () => {
    const lowFinding: Finding = { ...finding, severity: 'low', title: 'Düşük öncelikli bulgu' }
    const markdown = renderCannibalizationFindingsMarkdown([lowFinding, finding])
    expect(markdown.indexOf('sayfa yamyamlığı')).toBeLessThan(markdown.indexOf('Düşük öncelikli bulgu'))
  })
})

describe('renderCannibalizationFindingsHtml', () => {
  test('bulgu yoksa boş string döner', () => {
    expect(renderCannibalizationFindingsHtml([])).toBe('')
  })

  test('HTML kaçışlı şekilde gömülür', () => {
    const html = renderCannibalizationFindingsHtml([{ ...finding, title: '<script>alert(1)</script>' }])
    expect(html).toContain('<h2>Sayfa Yamyamlığı (Cannibalization)</h2>')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
