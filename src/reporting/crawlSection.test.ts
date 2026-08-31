import { describe, expect, test } from 'vitest'
import type { Finding } from '../core/findings.js'
import { renderCrawlFindingsHtml, renderCrawlFindingsMarkdown } from './crawlSection.js'

const onPageFinding: Finding = {
  category: 'onpage',
  severity: 'critical',
  url: 'https://ornek.com/',
  culpritSelector: null,
  title: 'Sayfada <h1> yok',
  explanation: 'Arama motorları H1\'i sayfanın ana konusu olarak kullanır.',
  evidence: 'İlk başlık <h3>, hiç <h1> bulunamadı',
  impact: 60,
  effort: 'small',
  fixSnippet: '<h1>Ana Başlık</h1>',
}

const linksFinding: Finding = {
  category: 'links',
  severity: 'high',
  url: null,
  culpritSelector: null,
  title: 'Kırık iç link (404)',
  explanation: 'Bu link hedefi artık mevcut değil.',
  evidence: 'https://ornek.com/eski → HTTP 404',
  impact: 45,
  effort: 'trivial',
  fixSnippet: null,
}

describe('renderCrawlFindingsMarkdown', () => {
  test('bulgu yoksa boş string döner', () => {
    expect(renderCrawlFindingsMarkdown([])).toBe('')
  })

  test('bulgu varsa url başlığı, ciddiyet etiketi ve fix snippet içerir', () => {
    const markdown = renderCrawlFindingsMarkdown([onPageFinding])
    expect(markdown).toContain('### Site Denetimi (Crawler)')
    expect(markdown).toContain('#### https://ornek.com/')
    expect(markdown).toContain('🔴 KRİTİK')
    expect(markdown).toContain('Sayfada <h1> yok')
    expect(markdown).toContain('```\n<h1>Ana Başlık</h1>\n```')
  })

  test('url: null olan bulgular "(site geneli)" başlığı altında gruplanır', () => {
    const markdown = renderCrawlFindingsMarkdown([linksFinding])
    expect(markdown).toContain('#### (site geneli)')
    expect(markdown).toContain('Kırık iç link (404)')
  })

  test('fixSnippet null ise kod bloğu render edilmez', () => {
    const markdown = renderCrawlFindingsMarkdown([linksFinding])
    expect(markdown).not.toContain('```')
  })

  test('aynı url\'e ait birden fazla bulgu tek kart altında gruplanır', () => {
    const second: Finding = { ...onPageFinding, title: 'Meta description boş' }
    const markdown = renderCrawlFindingsMarkdown([onPageFinding, second])
    expect(markdown.match(/#### https:\/\/ornek\.com\//g)).toHaveLength(1)
  })

  test('aynı sayfadaki bulgular ciddiyete göre sıralanır', () => {
    const lowFinding: Finding = { ...onPageFinding, severity: 'low', title: 'Düşük öncelikli bulgu' }
    const markdown = renderCrawlFindingsMarkdown([lowFinding, onPageFinding])
    expect(markdown.indexOf('Sayfada <h1> yok')).toBeLessThan(markdown.indexOf('Düşük öncelikli bulgu'))
  })

  test('emek rozeti bulgu başlığının yanında görünür', () => {
    const markdown = renderCrawlFindingsMarkdown([onPageFinding])
    expect(markdown).toContain('küçük emek')
  })
})

describe('codeLocation gösterimi', () => {
  const findingWithCodeLocation: Finding = { ...onPageFinding, codeLocation: { file: 'inc/hizmet.php', line: 45 } }

  test('markdown: codeLocation doluysa dosya:satır gösterir', () => {
    const markdown = renderCrawlFindingsMarkdown([findingWithCodeLocation])
    expect(markdown).toContain('Kaynak: `inc/hizmet.php:45`')
  })

  test('markdown: codeLocation yoksa Kaynak satırı basılmaz', () => {
    expect(renderCrawlFindingsMarkdown([onPageFinding])).not.toContain('Kaynak:')
  })

  test('html: codeLocation doluysa dosya:satır gösterir', () => {
    const html = renderCrawlFindingsHtml([findingWithCodeLocation])
    expect(html).toContain('Kaynak: <code>inc/hizmet.php:45</code>')
  })
})

// Dış denetim bulgusu (2026-08-31, ORTA 7) — 300 sayfalık canlı bir koşu, aynı şablon
// hatasını (ör. title eksik) onlarca sayfada TAM METNİYLE tekrarlayıp 3.5 MB'lık kullanılamaz
// bir rapor üretti. Aynı (category, title) 3'ten FAZLA sayfada tekrar ediyorsa tek karta toplanır.
describe('cross-page bulgu dedupe (widespread findings)', () => {
  const widespreadFindings: Finding[] = Array.from({ length: 6 }, (_, index) => ({
    ...onPageFinding,
    url: `https://ornek.com/sayfa-${index + 1}`,
  }))

  test('4+ sayfayı etkileyen aynı şablon TEK "(site geneli)" kartına toplanır', () => {
    const markdown = renderCrawlFindingsMarkdown(widespreadFindings)
    expect(markdown.match(/#### /g)).toHaveLength(1)
    expect(markdown).toContain('#### (site geneli)')
    expect(markdown).toContain('6 sayfada tespit edildi')
  })

  test('toplanmış kartta URL listesi ilk 5 ile sınırlanır, kalan sayı belirtilir', () => {
    const markdown = renderCrawlFindingsMarkdown(widespreadFindings)
    expect(markdown).toContain('sayfa-1')
    expect(markdown).toContain('sayfa-5')
    expect(markdown).not.toContain('sayfa-6')
    expect(markdown).toContain('(+1 daha)')
  })

  test('3 veya daha az sayfayı etkileyen şablon per-sayfa gösterimde KALIR (küçük denetimlerde değerli)', () => {
    const smallGroup = widespreadFindings.slice(0, 3)
    const markdown = renderCrawlFindingsMarkdown(smallGroup)
    expect(markdown.match(/#### https:\/\/ornek\.com\/sayfa-/g)).toHaveLength(3)
    expect(markdown).not.toContain('sayfada tespit edildi')
  })

  test('HTML render\'da da aynı şekilde tek karta toplanır', () => {
    const html = renderCrawlFindingsHtml(widespreadFindings)
    expect(html).toContain('6 sayfada tespit edildi')
    expect((html.match(/<div class="cwv-card">/g) ?? []).length).toBe(1)
  })

  test('farklı başlıklı bulgular ayrı gruplanır, birbirini etkilemez', () => {
    const otherTemplate: Finding[] = Array.from({ length: 5 }, (_, index) => ({
      ...onPageFinding,
      title: 'Meta description eksik',
      url: `https://ornek.com/diger-${index + 1}`,
    }))
    const markdown = renderCrawlFindingsMarkdown([...widespreadFindings, ...otherTemplate])
    expect(markdown).toContain('6 sayfada tespit edildi')
    expect(markdown).toContain('5 sayfada tespit edildi')
  })
})

describe('renderCrawlFindingsHtml', () => {
  test('bulgu yoksa boş string döner', () => {
    expect(renderCrawlFindingsHtml([])).toBe('')
  })

  test('HTML kaçışlı şekilde gömülür (XSS değil)', () => {
    const html = renderCrawlFindingsHtml([{ ...onPageFinding, title: '<script>alert(1)</script>' }])
    expect(html).toContain('<h2>Site Denetimi (Crawler)</h2>')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  test('url: null olan bulgular "(site geneli)" kartında görünür', () => {
    const html = renderCrawlFindingsHtml([linksFinding])
    expect(html).toContain('(site geneli)')
    expect(html).toContain('Kırık iç link (404)')
  })
})
