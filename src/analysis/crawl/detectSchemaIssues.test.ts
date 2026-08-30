import { describe, expect, test } from 'vitest'
import type { CrawledPage, SchemaBlock } from '../../core/types.js'
import { detectSchemaIssues } from './detectSchemaIssues.js'

const page = (schemaFields: readonly SchemaBlock[], overrides: Partial<CrawledPage> = {}): CrawledPage => ({
  url: 'https://ornek.com/urun/bot',
  statusCode: 200,
  finalUrl: 'https://ornek.com/urun/bot',
  fetchError: null,
  title: 't',
  metaDescription: 'd',
  canonicalUrl: null,
  h1s: ['h'],
  headingOrder: ['h1'],
  hasSchemaOrg: schemaFields.length > 0,
  schemaTypes: schemaFields.map((block) => block.type),
  schemaFields,
  ogComplete: false,
  imagesMissingAlt: 0,
  wordCount: 300,
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
  ...overrides,
})

describe('detectSchemaIssues', () => {
  test('şema yoksa hiç bulgu üretmez', () => {
    expect(detectSchemaIssues([page([])])).toEqual([])
  })

  test('Product şemasında offers.price eksikse bulgu üretir', () => {
    const findings = detectSchemaIssues([page([{ type: 'Product', keys: ['name', 'offers'] }])])
    expect(findings.some((f) => f.severity === 'medium' && f.title.includes('offers.price'))).toBe(true)
  })

  test('Product şemasının tüm zorunlu alanları varsa bulgu üretmez', () => {
    const keys = ['name', 'offers', 'offers.price', 'offers.priceCurrency', 'offers.availability']
    expect(detectSchemaIssues([page([{ type: 'Product', keys }])])).toEqual([])
  })

  test('tanınmayan @type (SCHEMA_REQUIRED_FIELDS dışı) sessizce atlanır', () => {
    expect(detectSchemaIssues([page([{ type: 'WebPage', keys: [] }])])).toEqual([])
  })

  test('CSR şüpheli sayfada bulgu üretmez — JSON-LD istemci tarafında enjekte edilmiş olabilir', () => {
    const findings = detectSchemaIssues([
      page([{ type: 'Product', keys: ['name'] }], { likelyClientRendered: true }),
    ])
    expect(findings).toEqual([])
  })

  test('4xx sayfada bulgu üretmez', () => {
    const findings = detectSchemaIssues([page([{ type: 'Product', keys: ['name'] }], { statusCode: 404 })])
    expect(findings).toEqual([])
  })

  test('birden fazla eksik alan tek bulguda listelenir', () => {
    const findings = detectSchemaIssues([page([{ type: 'LocalBusiness', keys: ['name'] }])])
    const finding = findings.find((f) => f.title.includes('LocalBusiness'))
    expect(finding?.title).toContain('address')
    expect(finding?.title).toContain('telephone')
  })
})
