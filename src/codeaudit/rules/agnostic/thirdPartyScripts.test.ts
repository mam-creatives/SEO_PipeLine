import { describe, expect, test } from 'vitest'
import type { SourceFile } from '../../types.js'
import { detectThirdPartyScripts } from './thirdPartyScripts.js'

const file = (content: string): SourceFile => ({ relPath: 'index.php', ext: '.php', lineCount: 1, content })

describe('detectThirdPartyScripts', () => {
  test('mutlak URL\'li script bulgu üretir', () => {
    const findings = detectThirdPartyScripts([file('<script async src="https://www.googletagmanager.com/gtag/js?id=G-X"></script>')])
    expect(findings).toHaveLength(1)
    expect(findings[0]?.evidence).toContain('www.googletagmanager.com')
  })

  test('göreli path\'li script (aynı origin) sayılmaz', () => {
    expect(detectThirdPartyScripts([file('<script src="/js/main.js"></script>')])).toEqual([])
  })

  test('async/defer yoksa severity high olur', () => {
    const findings = detectThirdPartyScripts([file('<script src="https://example.com/a.js"></script>')])
    expect(findings[0]?.severity).toBe('high')
    expect(findings[0]?.title).toContain("render'ı blokluyor")
  })

  test('async varsa severity medium olur', () => {
    const findings = detectThirdPartyScripts([file('<script async src="https://example.com/a.js"></script>')])
    expect(findings[0]?.severity).toBe('medium')
  })

  test('defer varsa da blocking sayılmaz', () => {
    const findings = detectThirdPartyScripts([file('<script defer src="https://example.com/a.js"></script>')])
    expect(findings[0]?.severity).toBe('medium')
  })

  test('script etiketi yoksa bulgu üretmez', () => {
    expect(detectThirdPartyScripts([file('<p>Merhaba</p>')])).toEqual([])
  })

  test('aynı host\'a birden fazla script tek bulguda toplanır, host tekilleşir', () => {
    const content =
      '<script src="https://cdn.example.com/a.js"></script><script src="https://cdn.example.com/b.js"></script>'
    const findings = detectThirdPartyScripts([file(content)])
    expect(findings).toHaveLength(1)
    expect(findings[0]?.title).toContain('2 üçüncü parti')
    expect(findings[0]?.evidence).toBe('cdn.example.com')
  })
})
