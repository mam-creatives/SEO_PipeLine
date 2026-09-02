import { describe, expect, test } from 'vitest'
import type { CrawledPage } from '../core/types.js'
import type { LiteAnalysisResult } from './liteAnalysis.js'
import { renderLiteReportHtml } from './liteReport.js'

const page: CrawledPage = {
  url: 'https://ornek.com/',
  statusCode: 200,
  finalUrl: 'https://ornek.com/',
  fetchError: null,
  title: null,
  metaDescription: null,
  canonicalUrl: null,
  h1s: [],
  headingOrder: [],
  hasSchemaOrg: false,
  schemaTypes: [],
  schemaFields: [],
  ogComplete: false,
  imagesMissingAlt: 0,
  wordCount: 0,
  bodyText: '',
  metaRobots: null,
  internalLinks: [],
  externalLinkCount: 0,
  likelyClientRendered: false,
  depth: 0,
  hreflangs: [],
  xRobotsTag: null,
  contentType: null,
  headerHreflangs: [],
  securityHeaders: [],
  redirectChain: [],
  redirectLoop: false,
  viewportMeta: null,
  langAttribute: null,
  mixedContentCount: 0,
  imagesMissingDimensions: 0,
}

const baseResult: LiteAnalysisResult = {
  domain: 'ornek.com',
  brandName: 'Örnek',
  page,
  onPageFindings: [],
  techAudit: null,
  cwvDiagnosis: null,
  geoResults: [],
  competitors: null,
  warnings: [],
}

describe('renderLiteReportHtml', () => {
  test('domain ve marka adını başlığa gömer', () => {
    const html = renderLiteReportHtml(baseResult)
    expect(html).toContain('ornek.com')
    expect(html).toContain('Örnek')
  })

  test('kullanıcı girdisi (title\'daki XSS denemesi) kaçışlı basılır', () => {
    const malicious: LiteAnalysisResult = {
      ...baseResult,
      onPageFindings: [
        {
          category: 'onpage',
          severity: 'critical',
          url: null,
          culpritSelector: null,
          title: '<script>alert(1)</script>',
          explanation: 'test',
          evidence: 'test',
          impact: 70,
          effort: 'trivial',
          fixSnippet: null,
        },
      ],
    }
    const html = renderLiteReportHtml(malicious)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  test('hiç bulgu yoksa "sorun bulunamadı" mesajı gösterir', () => {
    expect(renderLiteReportHtml(baseResult)).toContain('Belirgin bir sorun bulunamadı')
  })

  test('GEO sonuçları tabloya doğru ✅/❌ ile yansır', () => {
    const withGeo: LiteAnalysisResult = {
      ...baseResult,
      geoResults: [
        { query: 'Soru 1?', mentioned: true },
        { query: 'Soru 2?', mentioned: false },
      ],
    }
    const html = renderLiteReportHtml(withGeo)
    expect(html).toContain('Soru 1?')
    expect(html).toContain('Soru 2?')
    expect(html).toContain('badge ok')
    expect(html).toContain('badge fail')
  })

  test('competitors null ise rakip bölümü hiç basılmaz', () => {
    expect(renderLiteReportHtml(baseResult)).not.toContain('Gerçek Rakip Anlık Görüntüsü')
  })

  test('competitors doluysa yalnız gerçek rakipler listelenir', () => {
    const withCompetitors: LiteAnalysisResult = {
      ...baseResult,
      competitors: [
        { domain: 'rakip.com', appearanceRate: 0.5, classification: 'business', isRealCompetitor: true, source: 'discovered' },
        { domain: 'facebook.com', appearanceRate: 0.3, classification: 'social', isRealCompetitor: false, source: 'discovered' },
      ],
    }
    const html = renderLiteReportHtml(withCompetitors)
    expect(html).toContain('rakip.com')
    expect(html).not.toContain('facebook.com')
  })

  test('warnings varsa altta gösterilir', () => {
    const withWarning: LiteAnalysisResult = { ...baseResult, warnings: ['Test uyarısı'] }
    expect(renderLiteReportHtml(withWarning)).toContain('Test uyarısı')
  })
})
