import type { ClsAttribution, CwvAttribution, LcpAttribution } from '../../core/cwv.js'
import { ProviderError, summarizeZodError } from '../../core/errors.js'
import { err, ok, type Result } from '../../core/result.js'
import type { TechAudit } from '../../core/types.js'
import {
  asRecord,
  detailItems,
  isNodeDetail,
  isSubpartRow,
  LighthouseResultSchema,
  numberOrNull,
  stringOrNull,
  type LighthouseAudits,
} from './lighthouseSchema.js'

const KIB = 1024

const auditNumber = (audits: LighthouseAudits, id: string): number | null =>
  numberOrNull(audits[id]?.numericValue)

const auditDetails = (audits: LighthouseAudits, id: string): unknown => audits[id]?.details

/** `<img src="...">` snippet'inden kaynak URL'ini çıkarır. */
const srcFromSnippet = (snippet: string | null): string | null => {
  if (snippet === null) return null
  const match = /src="([^"]+)"/.exec(snippet)
  return match?.[1] ?? null
}

/**
 * LCP faz kırılımı. Lighthouse 13 bunu `lcp-breakdown-insight` altında verir ve
 * `subpart` anahtarları web-vitals attribution alan adlarıyla birebir aynıdır
 * (timeToFirstByte / resourceLoadDelay / resourceLoadDuration / elementRenderDelay).
 * Metin LCP'de kaynak fazları hiç görünmez — o durumda `url` null kalır ve
 * teşhis motoru "font geç keşfediliyor" dalına girer.
 */
const extractLcpAttribution = (audits: LighthouseAudits): LcpAttribution | null => {
  const items = detailItems(auditDetails(audits, 'lcp-breakdown-insight'))
  if (items.length === 0) return null

  const durations = new Map<string, number>()
  for (const item of items) {
    for (const row of detailItems(item)) {
      if (isSubpartRow(row)) durations.set(row.subpart, row.duration)
    }
  }
  if (durations.size === 0) return null

  const node = items.find(isNodeDetail)
  const hasResourcePhases = durations.has('resourceLoadDelay') || durations.has('resourceLoadDuration')

  return {
    target: stringOrNull(node?.selector ?? null),
    url: hasResourcePhases ? srcFromSnippet(stringOrNull(node?.snippet ?? null)) : null,
    timeToFirstByte: durations.get('timeToFirstByte') ?? 0,
    resourceLoadDelay: durations.get('resourceLoadDelay') ?? 0,
    resourceLoadDuration: durations.get('resourceLoadDuration') ?? 0,
    elementRenderDelay: durations.get('elementRenderDelay') ?? 0,
  }
}

/**
 * CLS suçlusu. Lighthouse kaymanın ZAMANINI vermez; lab koşusunda etkileşim olmadığı
 * için tüm kaymalar yükleme aşamasındadır — `largestShiftTime` 0 bırakılır ve teşhis
 * motoru doğru şekilde "yükleme kaynaklı kayma" dalına girer.
 */
const extractClsAttribution = (audits: LighthouseAudits): ClsAttribution | null => {
  const items = detailItems(auditDetails(audits, 'layout-shifts'))
  if (items.length === 0) return null

  const scored = items.map((item) => {
    const record = asRecord(item)
    return {
      score: numberOrNull(record['score']) ?? 0,
      node: isNodeDetail(record['node']) ? record['node'] : null,
    }
  })
  const largest = scored.reduce((best, current) => (current.score > best.score ? current : best))

  return {
    largestShiftTarget: stringOrNull(largest.node?.selector ?? null),
    largestShiftValue: largest.score,
    largestShiftTime: 0,
    loadState: 'loading',
  }
}

const formatKib = (bytes: number): string => `${Math.round(bytes / KIB).toLocaleString('tr-TR')} KB`

/** Lighthouse insight'larını rapordaki serbest metin sorun listesine çevirir. */
const extractIssues = (audits: LighthouseAudits): readonly string[] => {
  const imageIssues = detailItems(auditDetails(audits, 'image-delivery-insight')).flatMap((item) => {
    const record = asRecord(item)
    const url = stringOrNull(record['url'])
    const totalBytes = numberOrNull(record['totalBytes'])
    if (url === null || totalBytes === null) return []
    const wastedBytes = numberOrNull(record['wastedBytes'])
    const reasons = detailItems(record['subItems'])
      .map((sub) => stringOrNull(asRecord(sub)['reason']))
      .filter((reason): reason is string => reason !== null)
    const savings = wastedBytes === null ? '' : `, ${formatKib(wastedBytes)} tasarruf edilebilir`
    const detail = reasons.length > 0 ? ` — ${reasons.join(' ')}` : ''
    return [`Optimize edilmemiş görsel (${formatKib(totalBytes)}${savings}): ${url}${detail}`]
  })

  const renderBlocking = detailItems(auditDetails(audits, 'render-blocking-insight')).flatMap((item) => {
    const record = asRecord(item)
    const url = stringOrNull(record['url'])
    if (url === null) return []
    const bytes = numberOrNull(record['totalBytes'])
    return [`Render engelleyen kaynak${bytes === null ? '' : ` (${formatKib(bytes)})`}: ${url}`]
  })

  // document-latency-insight bir "checklist"tir: value=false olan maddeler başarısız kontrollerdir.
  const latencyChecks = Object.values(asRecord(asRecord(auditDetails(audits, 'document-latency-insight'))['items']))
    .flatMap((check) => {
      const record = asRecord(check)
      const label = stringOrNull(record['label'])
      return record['value'] === false && label !== null ? [`Belge gecikmesi: ${label}`] : []
    })

  return [...imageIssues, ...renderBlocking, ...latencyChecks]
}

/**
 * Lighthouse `lhr` → TechAudit + web-vitals attribution.
 *
 * Aynı fonksiyon hem lokal Lighthouse hem PageSpeed Insights için kullanılır;
 * PSI yanıtındaki `lighthouseResult` alanı birebir aynı şemadır.
 *
 * INP burada 0 bırakılır: lab ortamı INP ölçemez (gerçek etkileşim gerekir).
 * `attribution.inp` null kaldığı için teşhis motoru INP'yi hiç değerlendirmez —
 * TBT'yi INP diye raporlamak yanıltıcı olurdu.
 */
export const lighthouseResultToTechAudit = (
  raw: unknown,
  providerName: string,
): Result<TechAudit, ProviderError> => {
  const parsed = LighthouseResultSchema.safeParse(raw)
  if (!parsed.success) {
    return err(
      new ProviderError(providerName, `Lighthouse yanıtı beklenen şemaya uymuyor: ${summarizeZodError(parsed.error.issues)}`),
    )
  }

  const result = parsed.data
  const audits = result.audits
  const lcpMs = auditNumber(audits, 'largest-contentful-paint')
  const cls = auditNumber(audits, 'cumulative-layout-shift')

  if (lcpMs === null || cls === null) {
    return err(
      new ProviderError(
        providerName,
        `Çekirdek metrikler eksik (LCP: ${lcpMs}, CLS: ${cls}) — denetim güvenilir değil, boş veriyle devam edilmiyor.`,
      ),
    )
  }

  const score = result.categories.performance.score
  const attribution: CwvAttribution = {
    source: 'lab',
    lcp: extractLcpAttribution(audits),
    inp: null,
    cls: extractClsAttribution(audits),
    ttfb: null,
  }

  return ok({
    url: result.finalDisplayedUrl ?? result.requestedUrl ?? '',
    lcpMs,
    inpMs: 0,
    cls,
    performanceScore: score === null ? 0 : Math.round(score * 100),
    issues: extractIssues(audits),
    attribution,
  })
}
