import { COMPETITOR_THRESHOLD } from '../config/constants.js'
import type { ProjectConfig } from '../config/schema.js'
import type { Competitor, SerpSnapshot } from '../core/types.js'
import { classifyDomain } from './domainClassifier.js'

/**
 * Otomatik rakip keşfi: keyword setinin top-10 sonuçlarında frekans analizi.
 * Bir domain keyword'lerin >= COMPETITOR_THRESHOLD'unda görünüyorsa VE
 * "business" sınıfındaysa gerçek rakip sayılır. Seed rakipler her zaman listede
 * kalır (kullanıcı beyanı frekans verisinden üstündür).
 */
export const discoverCompetitors = (
  serps: readonly SerpSnapshot[],
  config: ProjectConfig,
): readonly Competitor[] => {
  const keywordCounts = new Map<string, number>()
  for (const serp of serps) {
    const distinctDomains = new Set(serp.entries.map((entry) => entry.domain))
    distinctDomains.delete(config.domain)
    for (const domain of distinctDomains) {
      keywordCounts.set(domain, (keywordCounts.get(domain) ?? 0) + 1)
    }
  }

  const totalKeywords = Math.max(serps.length, 1)
  const discovered = [...keywordCounts.entries()].map(([domain, count]): Competitor => {
    const appearanceRate = count / totalKeywords
    const classification = classifyDomain(domain)
    const isSeed = config.seedCompetitors.includes(domain)
    return {
      domain,
      appearanceRate,
      classification,
      isRealCompetitor: isSeed || (appearanceRate >= COMPETITOR_THRESHOLD && classification === 'business'),
      source: isSeed ? 'seed' : 'discovered',
    }
  })

  const missingSeeds = config.seedCompetitors
    .filter((domain) => !keywordCounts.has(domain))
    .map(
      (domain): Competitor => ({
        domain,
        appearanceRate: 0,
        classification: classifyDomain(domain),
        isRealCompetitor: true,
        source: 'seed',
      }),
    )

  return [...discovered, ...missingSeeds].sort((a, b) => b.appearanceRate - a.appearanceRate)
}

export const realCompetitorDomains = (competitors: readonly Competitor[]): readonly string[] =>
  competitors.filter((competitor) => competitor.isRealCompetitor).map((competitor) => competitor.domain)
