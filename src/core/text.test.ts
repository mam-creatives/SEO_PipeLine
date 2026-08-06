import { describe, expect, test } from 'vitest'
import { containsTr, extractRootDomain, normalizeTr, slugify } from './text.js'

describe('normalizeTr', () => {
  test('Türkçe İ/i dönüşümünü doğru yapar', () => {
    // "İSTANBUL".toLowerCase() → "i̇stanbul" (combining dot) — locale-aware hali "istanbul" olmalı
    expect(normalizeTr('İSTANBUL')).toBe('istanbul')
  })

  test('noktasız I → ı dönüşümü', () => {
    expect(normalizeTr('AYAKKABI')).toBe('ayakkabı')
  })
})

describe('containsTr', () => {
  test('büyük/küçük harf farkına rağmen bulur', () => {
    expect(containsTr('En iyi mağazalar İSTANBUL bölgesinde', 'istanbul')).toBe(true)
  })

  test('olmayan kelimeyi bulmaz', () => {
    expect(containsTr('spor ayakkabı önerileri', 'bot')).toBe(false)
  })
})

describe('slugify', () => {
  test('Türkçe karakterleri ASCII eşleniklerine çevirir', () => {
    expect(slugify('Örnek Ayakkabı Mağazası')).toBe('ornek-ayakkabi-magazasi')
  })
})

describe('extractRootDomain', () => {
  test('protokol, www ve path temizlenir', () => {
    expect(extractRootDomain('https://www.flo.com.tr/spor-ayakkabi')).toBe('flo.com.tr')
  })

  test('protokolsüz host olduğu gibi kalır', () => {
    expect(extractRootDomain('derimod.com.tr')).toBe('derimod.com.tr')
  })
})
