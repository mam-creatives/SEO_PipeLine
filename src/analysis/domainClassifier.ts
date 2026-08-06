import { EXCLUDED_DOMAIN_PATTERNS } from '../config/constants.js'
import type { DomainClassification } from '../core/types.js'

/**
 * Domain'i sınıflandırır. Pazaryeri/haber/sosyal/toplayıcı siteler her ticari
 * kelimede çıkar ama gerçek işletme rakibi değildir — rakip keşfi bu sınıfları eler.
 */
export const classifyDomain = (domain: string): DomainClassification => {
  const match = EXCLUDED_DOMAIN_PATTERNS.find(
    ({ pattern }) => domain === pattern || domain.endsWith(`.${pattern}`),
  )
  return match?.classification ?? 'business'
}
