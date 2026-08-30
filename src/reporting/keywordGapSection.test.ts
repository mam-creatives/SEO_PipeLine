import { describe, expect, test } from 'vitest'
import type { KeywordGap } from '../core/types.js'
import { renderKeywordGapsHtml, renderKeywordGapsMarkdown } from './keywordGapSection.js'

const gaps: KeywordGap[] = [
  { keyword: 'spor ayakkabı fiyatları', competitorDomain: 'flo.com.tr', competitorPosition: 3, volume: 8100 },
  { keyword: 'çocuk ayakkabı modelleri', competitorDomain: 'flo.com.tr', competitorPosition: 7, volume: 22000 },
  { keyword: 'nadir bir keyword', competitorDomain: 'hotic.com.tr', competitorPosition: 1, volume: null },
]

describe('renderKeywordGapsMarkdown', () => {
  test('boş listede boş string döner (bölüm hiç gösterilmez)', () => {
    expect(renderKeywordGapsMarkdown([])).toBe('')
  })

  test('hacme göre büyükten küçüğe sıralar', () => {
    const markdown = renderKeywordGapsMarkdown(gaps)
    const keywordLineOrder = markdown
      .split('\n')
      .filter((line) => line.startsWith('| ') && !line.includes('Keyword'))
      .map((line) => line.split('|')[1]?.trim())
    expect(keywordLineOrder).toEqual(['çocuk ayakkabı modelleri', 'spor ayakkabı fiyatları', 'nadir bir keyword'])
  })

  test('volume null ise "—" gösterir, listenin sonuna düşer', () => {
    const markdown = renderKeywordGapsMarkdown(gaps)
    expect(markdown).toContain('| nadir bir keyword | — | hotic.com.tr | 1 |')
  })

  test('başlık ve rakip/pozisyon bilgisi satırda yer alır', () => {
    const markdown = renderKeywordGapsMarkdown(gaps)
    expect(markdown).toContain('### Keyword Fırsatları — Rakipte Var, Sende Yok')
    expect(markdown).toContain('| spor ayakkabı fiyatları | 8.100 | flo.com.tr | 3 |')
  })
})

describe('renderKeywordGapsHtml', () => {
  test('boş listede boş string döner', () => {
    expect(renderKeywordGapsHtml([])).toBe('')
  })

  test('HTML özel karakterleri kaçırılır (XSS önleme)', () => {
    const html = renderKeywordGapsHtml([{ keyword: '<script>alert(1)</script>', competitorDomain: 'x.com', competitorPosition: 1, volume: 10 }])
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  test('tablo başlıkları ve satır sayısı doğru', () => {
    const html = renderKeywordGapsHtml(gaps)
    expect(html).toContain('<th>Keyword</th>')
    // +1 için: <thead>'in kendi <tr>'ı da sayılır.
    expect((html.match(/<tr>/g) ?? []).length).toBe(gaps.length + 1)
  })
})
