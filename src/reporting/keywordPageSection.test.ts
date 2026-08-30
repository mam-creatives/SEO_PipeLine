import { describe, expect, test } from 'vitest'
import type { KeywordPageMatch } from '../core/types.js'
import { renderKeywordPageMatchesHtml, renderKeywordPageMatchesMarkdown } from './keywordPageSection.js'

const matches: KeywordPageMatch[] = [
  { keyword: 'spor ayakkabı', volume: 8100, url: 'https://ornek.com/spor', inTitle: true, inH1: true, inBody: true, matchSource: 'gsc' },
  { keyword: 'çocuk ayakkabı', volume: 22000, url: 'https://ornek.com/cocuk', inTitle: false, inH1: true, inBody: true, matchSource: 'serp' },
  { keyword: 'nadir keyword', volume: 10, url: null, inTitle: false, inH1: false, inBody: false, matchSource: 'none' },
]

describe('renderKeywordPageMatchesMarkdown', () => {
  test('boş listede boş string döner (bölüm hiç gösterilmez)', () => {
    expect(renderKeywordPageMatchesMarkdown([])).toBe('')
  })

  test('hacme göre büyükten küçüğe sıralar', () => {
    const markdown = renderKeywordPageMatchesMarkdown(matches)
    const keywordOrder = markdown
      .split('\n')
      .filter((line) => line.startsWith('| ') && !line.includes('Keyword'))
      .map((line) => line.split('|')[1]?.trim())
    expect(keywordOrder).toEqual(['çocuk ayakkabı', 'spor ayakkabı', 'nadir keyword'])
  })

  test('url null ise "—" gösterir', () => {
    const markdown = renderKeywordPageMatchesMarkdown(matches)
    expect(markdown).toContain('| nadir keyword | 10 | — | ❌ | ❌ | ❌ | — |')
  })

  test('title eksikse ❌, mevcut sinyaller ✅ ile gösterilir', () => {
    const markdown = renderKeywordPageMatchesMarkdown(matches)
    expect(markdown).toContain('| çocuk ayakkabı | 22.000 | https://ornek.com/cocuk | ❌ | ✅ | ✅ | SERP |')
  })

  test('başlık satırda yer alır', () => {
    expect(renderKeywordPageMatchesMarkdown(matches)).toContain('### Keyword ↔ Sayfa Eşlemesi')
  })
})

describe('renderKeywordPageMatchesHtml', () => {
  test('boş listede boş string döner', () => {
    expect(renderKeywordPageMatchesHtml([])).toBe('')
  })

  test('HTML özel karakterleri kaçırılır (XSS önleme)', () => {
    const html = renderKeywordPageMatchesHtml([
      { keyword: '<script>alert(1)</script>', volume: 10, url: null, inTitle: false, inH1: false, inBody: false, matchSource: 'none' },
    ])
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  test('tablo başlıkları ve satır sayısı doğru', () => {
    const html = renderKeywordPageMatchesHtml(matches)
    expect(html).toContain('<th>Keyword</th>')
    // +1 için: <thead>'in kendi <tr>'ı da sayılır.
    expect((html.match(/<tr>/g) ?? []).length).toBe(matches.length + 1)
  })
})
