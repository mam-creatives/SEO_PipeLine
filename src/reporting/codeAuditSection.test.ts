import { describe, expect, test } from 'vitest'
import type { Finding } from '../core/findings.js'
import { renderCodeAuditFindingsHtml, renderCodeAuditFindingsMarkdown } from './codeAuditSection.js'

const finding: Finding = {
  category: 'onpage',
  severity: 'critical',
  url: null,
  culpritSelector: null,
  title: '<h1> yalnız bir HTML yorumu içinde bulundu',
  explanation: 'test açıklaması',
  evidence: 'inc/hizmet.php:45 — <h1> yorum bloğu içinde',
  impact: 60,
  effort: 'small',
  fixSnippet: null,
  codeLocation: { file: 'inc/hizmet.php', line: 45 },
}

describe('renderCodeAuditFindingsMarkdown', () => {
  test('bulgu yoksa boş string döner', () => {
    expect(renderCodeAuditFindingsMarkdown([])).toBe('')
  })

  test('codeLocation.file ile gruplanır, url ile değil', () => {
    const markdown = renderCodeAuditFindingsMarkdown([finding])
    expect(markdown).toContain('### Kod Denetimi')
    expect(markdown).toContain('#### inc/hizmet.php')
  })

  test('başlıkta dosya:satır gösterilir', () => {
    const markdown = renderCodeAuditFindingsMarkdown([finding])
    expect(markdown).toContain('<h1> yalnız bir HTML yorumu içinde bulundu:45')
  })

  test('line null ise başlıkta satır numarası gösterilmez', () => {
    const withoutLine: Finding = { ...finding, codeLocation: { file: 'a.php', line: null } }
    const markdown = renderCodeAuditFindingsMarkdown([withoutLine])
    expect(markdown).toContain(`${finding.title}** _`)
  })

  test('codeLocation hiç yoksa "(dosya belirsiz)" başlığı altında gruplanır', () => {
    const { codeLocation: _omit, ...withoutLocation } = finding
    const markdown = renderCodeAuditFindingsMarkdown([withoutLocation])
    expect(markdown).toContain('#### (dosya belirsiz)')
  })

  test('aynı dosyaya ait birden fazla bulgu tek kart altında gruplanır', () => {
    const second: Finding = { ...finding, title: 'İkinci bulgu' }
    const markdown = renderCodeAuditFindingsMarkdown([finding, second])
    expect(markdown.match(/#### inc\/hizmet\.php/g)).toHaveLength(1)
  })

  test('bulgular ciddiyete göre sıralanır', () => {
    const lowFinding: Finding = { ...finding, severity: 'low', title: 'Düşük öncelikli' }
    const markdown = renderCodeAuditFindingsMarkdown([lowFinding, finding])
    expect(markdown.indexOf('yalnız bir HTML yorumu')).toBeLessThan(markdown.indexOf('Düşük öncelikli'))
  })
})

describe('renderCodeAuditFindingsHtml', () => {
  test('bulgu yoksa boş string döner', () => {
    expect(renderCodeAuditFindingsHtml([])).toBe('')
  })

  test('HTML kaçışlı şekilde gömülür', () => {
    const html = renderCodeAuditFindingsHtml([{ ...finding, title: '<script>alert(1)</script>' }])
    expect(html).toContain('<h2>Kod Denetimi</h2>')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  test('dosya adı kart başlığında görünür', () => {
    const html = renderCodeAuditFindingsHtml([finding])
    expect(html).toContain('<h3>inc/hizmet.php</h3>')
  })
})
