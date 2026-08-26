import { describe, expect, test } from 'vitest'
import type { Finding } from '../core/findings.js'
import { renderIndexingFindingsHtml, renderIndexingFindingsMarkdown } from './indexingSection.js'

const finding: Finding = {
  category: 'indexing',
  severity: 'critical',
  url: 'https://ornek.com/urun',
  culpritSelector: null,
  title: "Google canonical'ınızı reddetti",
  explanation: 'Google başka bir <canonical> seçti.',
  evidence: 'userCanonical: a ≠ googleCanonical: b',
  impact: 70,
  effort: 'small',
  fixSnippet: '<link rel="canonical" href="https://ornek.com/urun">',
}

describe('renderIndexingFindingsMarkdown', () => {
  test('bulgu yoksa boş string döner', () => {
    expect(renderIndexingFindingsMarkdown([])).toBe('')
  })

  test('bulgu varsa url başlığı, ciddiyet etiketi ve fix snippet içerir', () => {
    const markdown = renderIndexingFindingsMarkdown([finding])
    expect(markdown).toContain('### İndeksleme Durumu (Search Console)')
    expect(markdown).toContain('#### https://ornek.com/urun')
    expect(markdown).toContain('🔴 KRİTİK')
    expect(markdown).toContain("Google canonical'ınızı reddetti")
    expect(markdown).toContain('```\n<link rel="canonical" href="https://ornek.com/urun">\n```')
  })

  test('aynı url\'e ait birden fazla bulgu tek kart altında gruplanır', () => {
    const second: Finding = { ...finding, title: 'Googlebot sayfayı getiremedi' }
    const markdown = renderIndexingFindingsMarkdown([finding, second])
    expect(markdown.match(/#### https:\/\/ornek\.com\/urun/g)).toHaveLength(1)
  })
})

describe('renderIndexingFindingsHtml', () => {
  test('bulgu yoksa boş string döner', () => {
    expect(renderIndexingFindingsHtml([])).toBe('')
  })

  test('HTML kaçışlı şekilde gömülür', () => {
    const html = renderIndexingFindingsHtml([{ ...finding, title: '<script>alert(1)</script>' }])
    expect(html).toContain('<h2>İndeksleme Durumu (Search Console)</h2>')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
