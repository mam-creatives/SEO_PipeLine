import { INTENT_MARKERS } from '../config/constants.js'
import { containsTr } from '../core/text.js'
import type { Intent } from '../core/types.js'

/**
 * Türkçe işaret kelimeleriyle arama niyeti sınıflandırması.
 * Öncelik sırası: branded > local > commercial > informational.
 * Hiçbir işaret yoksa head-term varsayılanı: commercial.
 */
export const classifyIntent = (keyword: string, brandTokens: readonly string[]): Intent => {
  if (brandTokens.some((token) => containsTr(keyword, token))) return 'branded'

  const localMarkers = [...INTENT_MARKERS.local, ...INTENT_MARKERS.cities]
  if (localMarkers.some((marker) => containsTr(keyword, marker))) return 'local'

  if (INTENT_MARKERS.commercial.some((marker) => containsTr(keyword, marker))) return 'commercial'
  if (INTENT_MARKERS.informational.some((marker) => containsTr(keyword, marker))) return 'informational'

  return 'commercial'
}
