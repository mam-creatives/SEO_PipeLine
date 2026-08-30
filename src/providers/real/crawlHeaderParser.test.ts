import { describe, expect, test } from 'vitest'
import { parseContentType, parseLinkHreflangs, pickSecurityHeaders, parseXRobotsTag } from './crawlHeaderParser.js'

describe('parseXRobotsTag', () => {
  test('başlık yoksa null döner', () => {
    expect(parseXRobotsTag({})).toBeNull()
  })

  test('başlık varsa aynen (trim edilmiş) döner', () => {
    expect(parseXRobotsTag({ 'x-robots-tag': 'noindex, nofollow' })).toBe('noindex, nofollow')
  })

  test('yalnız boşluktan oluşan değer null sayılır', () => {
    expect(parseXRobotsTag({ 'x-robots-tag': '   ' })).toBeNull()
  })
})

describe('parseContentType', () => {
  test('başlık yoksa null döner', () => {
    expect(parseContentType({})).toBeNull()
  })

  test('charset gibi ek parametreleri atar, yalnız MIME tipini döner', () => {
    expect(parseContentType({ 'content-type': 'text/html; charset=utf-8' })).toBe('text/html')
  })

  test('parametresiz content-type aynen döner', () => {
    expect(parseContentType({ 'content-type': 'application/json' })).toBe('application/json')
  })
})

describe('pickSecurityHeaders', () => {
  test('hiçbir güvenlik başlığı yoksa boş dizi döner', () => {
    expect(pickSecurityHeaders({ 'content-type': 'text/html' })).toEqual([])
  })

  test('mevcut olan güvenlik başlıklarının adlarını döner, ham değer değil', () => {
    const headers = { 'strict-transport-security': 'max-age=31536000', 'x-content-type-options': 'nosniff' }
    expect(pickSecurityHeaders(headers)).toEqual(['strict-transport-security', 'x-content-type-options'])
  })
})

describe('parseLinkHreflangs', () => {
  test('Link başlığı yoksa boş dizi döner', () => {
    expect(parseLinkHreflangs({})).toEqual([])
  })

  test('tek girdili Link başlığından dil kodunu çıkarır', () => {
    const link = '<https://x.com/tr/>; rel="alternate"; hreflang="tr"'
    expect(parseLinkHreflangs({ link })).toEqual(['tr'])
  })

  test('virgülle ayrılmış çoklu girdiden tüm dil kodlarını çıkarır', () => {
    const link = '<https://x.com/tr/>; rel="alternate"; hreflang="tr", <https://x.com/en/>; rel="alternate"; hreflang="en"'
    expect(parseLinkHreflangs({ link })).toEqual(['tr', 'en'])
  })

  test('rel="alternate" olmayan girdileri (ör. rel="canonical") yok sayar', () => {
    const link = '<https://x.com/>; rel="canonical"'
    expect(parseLinkHreflangs({ link })).toEqual([])
  })

  test('URL sorgu string\'inde virgül geçse bile girdileri yanlış bölmez', () => {
    const link = '<https://x.com/?a=1,2>; rel="alternate"; hreflang="tr", <https://x.com/en/>; rel="alternate"; hreflang="en"'
    expect(parseLinkHreflangs({ link })).toEqual(['tr', 'en'])
  })
})
