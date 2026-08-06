import { describe, expect, test } from 'vitest'
import { detectMentions } from './detectMentions.js'

const brandTokens = ['örnek ayakkabı', 'ornekayakkabi']
const competitors = ['flo.com.tr', 'derimod.com.tr', 'hotic.com.tr', 'sneakscloud.com']

describe('detectMentions', () => {
  test('marka adı aksan/boşluk farkına rağmen bulunur', () => {
    const result = detectMentions('Türkiye\'de Örnek Ayakkabı öne çıkıyor', brandTokens, competitors)
    expect(result.clientMentioned).toBe(true)
  })

  test('rakip markalar görünen adlarıyla eşleşir (Hotiç → hotic.com.tr)', () => {
    const result = detectMentions('FLO, Derimod ve Hotiç sık önerilir', brandTokens, competitors)
    expect(result.clientMentioned).toBe(false)
    expect(result.competitorsMentioned).toEqual(['flo.com.tr', 'derimod.com.tr', 'hotic.com.tr'])
  })

  test('boşluklu marka adı domain etiketiyle eşleşir (Sneaks Cloud → sneakscloud)', () => {
    const result = detectMentions('Spor ayakkabıda Sneaks Cloud iyi bir seçenek', brandTokens, competitors)
    expect(result.competitorsMentioned).toEqual(['sneakscloud.com'])
  })

  test('hiç mention yoksa boş sonuç', () => {
    const result = detectMentions('Genel olarak yerel markalara bakabilirsiniz', brandTokens, competitors)
    expect(result.clientMentioned).toBe(false)
    expect(result.competitorsMentioned).toEqual([])
  })
})
