import { describe, expect, test } from 'vitest'
import { ok } from '../core/result.js'
import type { FieldCwv, IndexStatus } from '../core/types.js'
import type { CruxProvider, IndexingProvider, ProviderSet } from '../providers/types.js'
import { collectFieldCwv, collectIndexStatuses } from './collectors.js'

const fakeIndexingProvider = (): IndexingProvider => ({
  name: 'fake-indexing',
  isMock: true,
  fetchIndexStatus: async (url) =>
    ok<IndexStatus>({
      url,
      coverageState: 'Submitted and indexed',
      robotsTxtState: 'ALLOWED',
      indexingState: 'INDEXING_ALLOWED',
      pageFetchState: 'SUCCESSFUL',
      googleCanonical: url,
      userCanonical: url,
      lastCrawlTime: null,
    }),
})

const fakeCruxProvider = (): CruxProvider => ({
  name: 'fake-crux',
  isMock: true,
  fetchFieldCwv: async (url) => ok<FieldCwv | null>({ url, formFactor: 'ALL_FORM_FACTORS', lcpMs: 2000, inpMs: 100, cls: 0.05 }),
})

const providersWith = (overrides: Partial<ProviderSet>): ProviderSet => overrides as unknown as ProviderSet

describe('collectIndexStatuses', () => {
  test('Faz 4.3 — mapWithConcurrency ile sınırlansa da sonuç sırası girdi sırasını korur', async () => {
    const urls = ['https://x.com/a', 'https://x.com/b', 'https://x.com/c']
    const result = await collectIndexStatuses(providersWith({ indexing: fakeIndexingProvider() }), urls)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.map((r) => r.url)).toEqual(urls)
  })

  test('boş URL listesinde boş dizi döner', async () => {
    const result = await collectIndexStatuses(providersWith({ indexing: fakeIndexingProvider() }), [])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual([])
  })
})

describe('collectFieldCwv', () => {
  test('Faz 4.3 — mapWithConcurrency ile sınırlansa da sonuç sırası girdi sırasını korur', async () => {
    const urls = ['https://x.com/a', 'https://x.com/b', 'https://x.com/c']
    const result = await collectFieldCwv(providersWith({ crux: fakeCruxProvider() }), urls)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.map((r) => r.url)).toEqual(urls)
  })
})
