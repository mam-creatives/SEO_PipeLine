import { slugify } from '../core/text.js'

export interface MentionDetection {
  readonly clientMentioned: boolean
  readonly competitorsMentioned: readonly string[]
}

/**
 * Aksan/boşluk farklarını yok sayan karşılaştırma anahtarı:
 * "Sneaks Cloud" → "sneakscloud", "Hotiç" → "hotic".
 */
const mentionKey = (text: string): string => slugify(text).replaceAll('-', '')

/**
 * Bir AI cevabında müşteri markasının ve rakip domain'lerin geçip geçmediğini tespit eder.
 * Rakipler domain'in ilk etiketiyle aranır (flo.com.tr → "flo").
 * Hem mock hem gerçek sağlayıcı cevapları aynı mantıktan geçer.
 */
export const detectMentions = (
  answerText: string,
  brandTokens: readonly string[],
  competitorDomains: readonly string[],
): MentionDetection => {
  const textKey = mentionKey(answerText)
  const clientMentioned = brandTokens.some((token) => textKey.includes(mentionKey(token)))
  const competitorsMentioned = competitorDomains.filter((domain) => {
    const label = domain.split('.')[0] ?? domain
    return label.length >= 3 && textKey.includes(mentionKey(label))
  })
  return { clientMentioned, competitorsMentioned }
}
