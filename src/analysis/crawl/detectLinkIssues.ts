import { estimateImpact, type Finding } from '../../core/findings.js'
import type { CrawledPage } from '../../core/types.js'

const targetLookup = (pages: readonly CrawledPage[]): Map<string, CrawledPage> => {
  const byUrl = new Map<string, CrawledPage>()
  for (const page of pages) {
    byUrl.set(page.url, page)
    if (page.finalUrl !== null) byUrl.set(page.finalUrl, page)
  }
  return byUrl
}

/**
 * Yalnız TARANMIŞ hedefler değerlendirilir — link keşfedildi ama tarama bütçesi yüzünden
 * çekilmediyse "kırık" demek iddialı olurdu. `fetchError` (ağ/timeout) de statusCode>=400 ile
 * aynı kefede: ikisi de "bu link kullanıcıyı bir yere ulaştırmıyor" demek.
 */
const brokenLinkFindings = (pages: readonly CrawledPage[]): readonly Finding[] => {
  const byUrl = targetLookup(pages)
  return pages.flatMap((source) =>
    source.internalLinks.flatMap((link): readonly Finding[] => {
      const target = byUrl.get(link.targetUrl)
      if (target === undefined) return []
      const isBroken = target.fetchError !== null || (target.statusCode !== null && target.statusCode >= 400)
      if (!isBroken) return []
      const statusLabel = target.fetchError ?? `HTTP ${target.statusCode}`
      return [
        {
          category: 'links',
          severity: 'high',
          url: source.url,
          culpritSelector: `a[href="${link.targetUrl}"]`,
          title: `Kırık iç link (${statusLabel})`,
          explanation:
            `Bu sayfa "${link.anchorText || link.targetUrl}" anchor metniyle "${link.targetUrl}" adresine ` +
            `link veriyor ama o adres ${statusLabel} ile sonuçlanıyor. Kullanıcı ve Googlebot çıkmaz sokağa girer.`,
          evidence: `${link.targetUrl} → ${statusLabel}`,
          impact: estimateImpact('high'),
          effort: 'trivial',
          fixSnippet: null,
        },
      ]
    }),
  )
}

/** Doğrudan hedefe değil, yönlendirmeye linkleyen sayfaları bulur — gereksiz bir hop, link değeri sızdırır. */
const redirectTargetFindings = (pages: readonly CrawledPage[]): readonly Finding[] => {
  const byUrl = new Map(pages.map((page) => [page.url, page] as const))
  return pages.flatMap((source) =>
    source.internalLinks.flatMap((link): readonly Finding[] => {
      const target = byUrl.get(link.targetUrl)
      if (target === undefined || target.finalUrl === null || target.finalUrl === target.url) return []
      return [
        {
          category: 'links',
          severity: 'low',
          url: source.url,
          culpritSelector: `a[href="${link.targetUrl}"]`,
          title: 'İç link doğrudan hedefe değil, bir yönlendirmeye gidiyor',
          explanation:
            `"${link.targetUrl}" linki bir yönlendirmeye giriyor (nihai adres: "${target.finalUrl}"). ` +
            'Doğrudan nihai adrese linklemek gereksiz bir HTTP isteğini ve küçük bir link-değeri kaybını önler.',
          evidence: `${link.targetUrl} → 30x → ${target.finalUrl}`,
          impact: estimateImpact('low'),
          effort: 'trivial',
          fixSnippet: null,
        },
      ]
    }),
  )
}

/** Taranan hiçbir sayfadan iç link almayan sayfalar — seed URL'ler hariç (giriş noktası olmak zaten linksiz olabilir). */
const orphanPageFindings = (pages: readonly CrawledPage[], seedUrls: ReadonlySet<string>): readonly Finding[] => {
  const linkedTargets = new Set<string>()
  for (const page of pages) {
    for (const link of page.internalLinks) linkedTargets.add(link.targetUrl)
  }
  return pages
    .filter((page) => !seedUrls.has(page.url))
    .filter((page) => !linkedTargets.has(page.url) && !(page.finalUrl !== null && linkedTargets.has(page.finalUrl)))
    .map((page) => ({
      category: 'links',
      severity: 'medium',
      url: page.url,
      culpritSelector: null,
      title: 'Öksüz sayfa — taranan hiçbir sayfadan iç link almıyor',
      explanation:
        'Bu sayfaya taranan sayfalar içinden hiçbir iç link işaret etmiyor. Google onu ancak sitemap ya da ' +
        'dış linkle bulabilir; iç link eksikliği hem keşfi hem de sayfanın aldığı link değerini zayıflatır.',
      evidence: 'gelen iç link sayısı: 0',
      impact: estimateImpact('medium'),
      effort: 'small',
      fixSnippet: null,
    }))
}

/**
 * CrawledPage listesinden iç link grafiği bulgusu üretir — saf fonksiyon.
 * `seedUrls`: taramanın başlangıç noktaları (homepage + config.auditUrls) — öksüz sayfa
 * tespitinde hariç tutulur, aksi halde her taramada seed'in kendisi yanlışlıkla işaretlenir.
 */
export const detectLinkIssues = (pages: readonly CrawledPage[], seedUrls: readonly string[] = []): readonly Finding[] => {
  const seedSet = new Set(seedUrls)
  return [...brokenLinkFindings(pages), ...redirectTargetFindings(pages), ...orphanPageFindings(pages, seedSet)]
}
