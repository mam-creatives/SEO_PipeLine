import { MAX_AUDIT_URLS } from '../config/constants.js'
import type { ProjectConfig } from '../config/schema.js'
import type { SerpSnapshot } from '../core/types.js'

/**
 * URL'yi şablonuna indirger: aynı şablondaki sayfalar aynı kod yolundan üretildiği için
 * Core Web Vitals davranışları da benzerdir — her şablondan bir temsilci denetlemek yeterli.
 *
 *   /                      → /
 *   /spor-ayakkabi         → /:sayfa
 *   /blog/ayakkabi-bakimi  → /blog/:sayfa
 */
export const templateOf = (rawUrl: string): string => {
  const path = (() => {
    try {
      return new URL(rawUrl).pathname
    } catch {
      return '/'
    }
  })()
  const segments = path.split('/').filter((segment) => segment !== '')
  if (segments.length === 0) return '/'
  if (segments.length === 1) return '/:sayfa'
  return `/${segments[0]}/${segments.slice(1).map(() => ':sayfa').join('/')}`
}

/**
 * Denetlenecek sayfaları seçer.
 *
 * CWV sayfa bazında değişir; yalnız anasayfaya bakmak klasik hatadır. SERP verisinde
 * müşterinin gerçekten sıralanan URL'leri zaten var — şablon başına EN İYİ SIRADAKİ
 * sayfa temsilci seçilir, böylece trafiği fiilen alan sayfalar denetlenir.
 *
 * config.auditUrls her zaman dahildir (kullanıcı beyanı keşiften üstündür).
 * Toplam sayı MAX_AUDIT_URLS ile sınırlıdır: her URL bir Lighthouse koşusu demek.
 */
export const selectAuditUrls = (
  serps: readonly SerpSnapshot[],
  config: ProjectConfig,
): readonly string[] => {
  const bestByTemplate = new Map<string, { readonly url: string; readonly position: number }>()

  for (const serp of serps) {
    for (const entry of serp.entries) {
      if (entry.domain !== config.domain) continue
      const template = templateOf(entry.url)
      const current = bestByTemplate.get(template)
      if (current === undefined || entry.position < current.position) {
        bestByTemplate.set(template, { url: entry.url, position: entry.position })
      }
    }
  }

  const discovered = [...bestByTemplate.values()]
    .sort((a, b) => a.position - b.position)
    .map((candidate) => candidate.url)

  return [...new Set([...config.auditUrls, ...discovered])].slice(0, MAX_AUDIT_URLS)
}
