import { describe, expect, test } from 'vitest'
import type { TechEvaluation } from '../analysis/runAnalysis.js'
import type { Finding } from '../core/findings.js'
import { renderSeoFindingsHtml, renderSeoFindingsMarkdown } from './seoSection.js'

const finding: Finding = {
  category: 'onpage',
  severity: 'critical',
  url: 'https://ornek.com/',
  culpritSelector: 'nav > ul > li.has-dropdown > a',
  title: 'Bağlantılar taranabilir değil',
  explanation: 'href="javascript:void(0)" <script> gibi bağlantılar arama motoru için görünmezdir.',
  evidence: '2 elementte tespit edildi',
  impact: 76,
  effort: 'small',
  fixSnippet: '<a href="/kurumsal">Kurumsal</a>',
}

const evaluationWithFindings: TechEvaluation = {
  audit: {
    url: 'https://ornek.com/',
    lcpMs: 2000,
    inpMs: 150,
    cls: 0.05,
    performanceScore: 90,
    issues: [],
    seoScore: 85,
    seoFindings: [finding],
  },
  passes: { lcp: true, inp: true, cls: true },
  isClient: true,
  diagnosis: null,
}

const evaluationWithoutFindings: TechEvaluation = {
  ...evaluationWithFindings,
  audit: { ...evaluationWithFindings.audit, url: 'https://ornek.com/hakkimizda', seoScore: 100, seoFindings: [] },
}

describe('renderSeoFindingsMarkdown', () => {
  test('hiç SEO bulgusu yoksa boş string döner', () => {
    expect(renderSeoFindingsMarkdown([])).toBe('')
    expect(renderSeoFindingsMarkdown([evaluationWithoutFindings])).toBe('')
  })

  test('bulgu varsa başlık, skor, ciddiyet etiketi, suçlu seçici ve fix snippet içerir', () => {
    const markdown = renderSeoFindingsMarkdown([evaluationWithFindings, evaluationWithoutFindings])
    expect(markdown).toContain('### On-Page SEO Denetimi')
    expect(markdown).toContain('https://ornek.com/ — SEO skoru 85/100')
    expect(markdown).toContain('🔴 KRİTİK')
    expect(markdown).toContain('Bağlantılar taranabilir değil')
    expect(markdown).toContain('Suçlu element: `nav > ul > li.has-dropdown > a`')
    expect(markdown).toContain('```\n<a href="/kurumsal">Kurumsal</a>\n```')
    // seoFindings boş olan denetim ayrı bir kart açmamalı
    expect(markdown).not.toContain('hakkimizda')
  })
})

describe('renderSeoFindingsHtml', () => {
  test('hiç SEO bulgusu yoksa boş string döner', () => {
    expect(renderSeoFindingsHtml([evaluationWithoutFindings])).toBe('')
  })

  test('bulgu HTML\'e kaçışlı şekilde gömülür (XSS değil)', () => {
    const html = renderSeoFindingsHtml([evaluationWithFindings])
    expect(html).toContain('<h2>On-Page SEO Denetimi</h2>')
    expect(html).toContain('cwv-card')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
