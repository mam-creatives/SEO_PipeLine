import { describe, expect, test } from 'vitest'
import type { Finding } from '../core/findings.js'
import { impactEffortLabel, mockBadgeLabel } from './severityLabel.js'

const baseFinding: Finding = {
  category: 'onpage',
  severity: 'high',
  url: 'https://ornek.tr/',
  culpritSelector: null,
  title: 'test bulgusu',
  explanation: 'test',
  evidence: 'test',
  impact: 45,
  effort: 'small',
  fixSnippet: null,
}

describe('mockBadgeLabel', () => {
  test('isMock belirtilmemişse boş string döner', () => {
    expect(mockBadgeLabel(baseFinding)).toBe('')
  })

  test('isMock:false iken boş string döner', () => {
    expect(mockBadgeLabel({ ...baseFinding, isMock: false })).toBe('')
  })

  test('isMock:true iken 🧪 rozeti döner', () => {
    expect(mockBadgeLabel({ ...baseFinding, isMock: true })).toBe(' · 🧪 ÖRNEK VERİ')
  })
})

describe('impactEffortLabel', () => {
  test('gerçek bulguda rozet eklenmez', () => {
    expect(impactEffortLabel(baseFinding)).toBe('küçük emek · etki 45')
  })

  test('mock bulguda rozet sona eklenir', () => {
    expect(impactEffortLabel({ ...baseFinding, isMock: true })).toBe('küçük emek · etki 45 · 🧪 ÖRNEK VERİ')
  })
})
