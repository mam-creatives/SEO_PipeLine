import { describe, expect, test } from 'vitest'
import type { IndexStatus } from '../core/types.js'
import { detectIndexingIssues } from './detectIndexingIssues.js'

const healthyStatus: IndexStatus = {
  url: 'https://ornek.com/',
  coverageState: 'Submitted and indexed',
  robotsTxtState: 'ALLOWED',
  indexingState: 'INDEXING_ALLOWED',
  pageFetchState: 'SUCCESSFUL',
  googleCanonical: 'https://ornek.com/',
  userCanonical: 'https://ornek.com/',
  lastCrawlTime: '2026-08-01T00:00:00Z',
}

describe('detectIndexingIssues', () => {
  test('sağlıklı durum hiç bulgu üretmez', () => {
    expect(detectIndexingIssues([healthyStatus])).toEqual([])
  })

  test('indexingState engellenmişse critical bulgu üretir ve sebebi anar', () => {
    const status: IndexStatus = { ...healthyStatus, indexingState: 'BLOCKED_BY_ROBOTS_TXT' }
    const findings = detectIndexingIssues([status])
    expect(findings).toHaveLength(1)
    expect(findings[0]?.severity).toBe('critical')
    expect(findings[0]?.category).toBe('indexing')
    expect(findings[0]?.explanation).toContain('robots.txt disallow kuralı')
    expect(findings[0]?.evidence).toBe('indexingState: BLOCKED_BY_ROBOTS_TXT')
  })

  test('INDEXING_STATE_UNSPECIFIED bulgu üretmez — bilinmeyeni hata sayma', () => {
    const status: IndexStatus = { ...healthyStatus, indexingState: 'INDEXING_STATE_UNSPECIFIED' }
    expect(detectIndexingIssues([status])).toEqual([])
  })

  test('Googlebot sayfayı getiremezse critical bulgu üretir', () => {
    const status: IndexStatus = { ...healthyStatus, pageFetchState: 'SOFT_404' }
    const findings = detectIndexingIssues([status])
    expect(findings).toHaveLength(1)
    expect(findings[0]?.title).toBe('Googlebot sayfayı getiremedi')
    expect(findings[0]?.effort).toBe('large')
  })

  test("canonical uyuşmazlığında Google'ın seçtiği canonical fixSnippet'e yazılır", () => {
    const status: IndexStatus = {
      ...healthyStatus,
      userCanonical: 'https://ornek.com/urun?ref=1',
      googleCanonical: 'https://ornek.com/urun',
    }
    const findings = detectIndexingIssues([status])
    expect(findings).toHaveLength(1)
    expect(findings[0]?.title).toBe("Google canonical'ınızı reddetti")
    expect(findings[0]?.fixSnippet).toContain('href="https://ornek.com/urun"')
  })

  test('canonical alanlarından biri null ise (bilinmiyor) karşılaştırma sessizce atlanır', () => {
    const status: IndexStatus = { ...healthyStatus, googleCanonical: null }
    expect(detectIndexingIssues([status])).toEqual([])
  })

  test('aynı sayfada birden fazla sorun varsa hepsi ayrı bulgu olarak döner', () => {
    const status: IndexStatus = {
      ...healthyStatus,
      indexingState: 'BLOCKED_BY_META_TAG',
      pageFetchState: 'NOT_FOUND',
      googleCanonical: 'https://ornek.com/x',
      userCanonical: 'https://ornek.com/y',
    }
    expect(detectIndexingIssues([status])).toHaveLength(3)
  })

  test('birden fazla URL bağımsız değerlendirilir', () => {
    const findings = detectIndexingIssues([
      healthyStatus,
      { ...healthyStatus, url: 'https://ornek.com/bozuk', pageFetchState: 'SERVER_ERROR' },
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0]?.url).toBe('https://ornek.com/bozuk')
  })
})
