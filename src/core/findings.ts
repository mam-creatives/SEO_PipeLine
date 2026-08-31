import type { CwvMetricName } from './cwv.js'

/**
 * Tüm denetim kategorilerinin ortak bulgu şekli.
 *
 * `CwvFinding` (src/analysis/cwv/types.ts) bunun bir alt tipidir — CWV kuralları
 * `metric`/`phase`/`phaseShare`'i zorunlu doldurur. `links` Faz 2 crawler'ının iç link
 * grafiği bulguları için eklendi (kırık link, öksüz sayfa, tıklama derinliği); schema.org/OG
 * gibi sayfa-içi işaretleme bulguları ayrı bir kategori açmadan `onpage`'e, robots.txt/sitemap
 * uyuşmazlıkları `indexing`'e giriyor. Faz 3'te `'code'` eklenecek, `codeLocation` doldurulacak;
 * bu tip o zaman da değişmez, yalnız kullanılmaya başlar.
 */
export type FindingCategory = 'cwv' | 'onpage' | 'indexing' | 'content' | 'links'

/** critical = eşik "poor" bandında, high = "needs-improvement", medium = faz bütçesi aşıldı, low = bilgi amaçlı */
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low'

/** Düzeltmenin gerektirdiği emek — `impact` ile birlikte önceliklendirme sağlar. */
export type FindingEffort = 'trivial' | 'small' | 'medium' | 'large'

/** Faz 3'te dolar: bulguyu üreten kaynağı render eden dosya/satır. Faz 1/2'de hep null/undefined. */
export interface CodeLocation {
  readonly file: string
  readonly line: number | null
}

/**
 * Tek bir denetim bulgusu. `fixSnippet` ürünün farklılaştırıcısı: öneri metni değil,
 * doğrudan kopyalanabilir düzeltme. `evidence` iddianın dayanağı olan ham ölçüm değeridir
 * (ör. "TTFB 3400ms") — `explanation` yorumlarken `evidence` kanıtı taşır.
 */
export interface Finding {
  readonly category: FindingCategory
  readonly severity: FindingSeverity
  /** Bulgunun ait olduğu sayfa — sayfa bağımsız bulgularda (ör. site geneli) null */
  readonly url: string | null
  /** Suçlu elementin CSS seçicisi — biliniyorsa */
  readonly culpritSelector: string | null
  readonly title: string
  readonly explanation: string
  readonly evidence: string
  /** 0..100 — trafik/dönüşüm etkisi tahmini, önceliklendirme için */
  readonly impact: number
  readonly effort: FindingEffort
  readonly fixSnippet: string | null
  /** Yalnız CWV bulgularında dolu */
  readonly metric?: CwvMetricName
  readonly phase?: string
  readonly phaseShare?: number | null
  readonly codeLocation?: CodeLocation | null
  /**
   * Dış denetim bulgusu (2026-08-31) — bulguyu üreten kategori mock sağlayıcıdan geldiyse
   * true. Belirtilmezse (undefined) gerçek veri sayılır — mevcut tüm Finding kurucuları
   * bu alanı hiç bilmediğinden geriye dönük uyumlu. `runAnalysis.ts`'te kategori bazında
   * damgalanır (`withMockFlag`), tekil dedektörler mock/gerçek ayrımını bilmez.
   */
  readonly isMock?: boolean
}

const SEVERITY_ORDER: Readonly<Record<FindingSeverity, number>> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

/**
 * Önce ciddiyet, eşitlikte büyük faz payı önce — sıralama her rapor yüzeyinde aynı olsun.
 * Generic: `T extends Finding` girip aynı alt tiple çıkar (ör. `CwvFinding[]` verilince
 * `CwvFinding[]` döner, `metric`/`phase` zorunluluğu kaybolmaz).
 */
export const sortFindings = <T extends Finding>(findings: readonly T[]): readonly T[] =>
  [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (b.phaseShare ?? 0) - (a.phaseShare ?? 0),
  )

export const percentLabel = (share: number): string => `%${Math.round(share * 100)}`

/**
 * Dış denetim bulgusu (2026-08-31) — bir bulgu ailesinin tamamı tek bir sağlayıcı
 * kategorisinden türediğinde (ör. crawlFindings ← 'crawl'), o kategori mock'taysa
 * `isMock: true` damgalanır. `isMock: false` iken yeni obje üretmez — gereksiz
 * allocation'dan kaçınmak için no-op.
 */
export const withMockFlag = <T extends Finding>(findings: readonly T[], isMock: boolean): readonly T[] =>
  isMock ? findings.map((finding) => ({ ...finding, isMock: true })) : findings

/** Aynı şablon (category+title) bu kadar sayfayı AŞARSA "site geneli" tek bulguya toplanır. */
const WIDESPREAD_FINDING_THRESHOLD = 3
/** Toplanmış bulguda gösterilecek azami URL — crawlability bulgularındaki "ilk 5, +N daha" deseniyle tutarlı. */
const URL_PREVIEW_LIMIT = 5

/**
 * Dış denetim bulgusu (2026-08-31, ORTA 7) — canlı bir koşuda (300 sayfa taranınca) aynı
 * şablon hatası (ör. "<title> etiketi eksik") onlarca sayfada TAM METNİYLE tekrar tekrar
 * basılıyordu: hem 3.5 MB'lık kullanılamaz bir crawl bölümü, hem de yönetici özetinin
 * 12 slotundan 5'inin aynı bulgunun URL varyantlarıyla dolması (ruleSynthesizer.ts'in
 * `topCrawlFindings`'i ham diziden seçtiği için). Aynı (category, title) şablonu
 * `WIDESPREAD_FINDING_THRESHOLD`'tan FAZLA sayfada tekrar ediyorsa TEK bir "site geneli"
 * bulguya toplanır (url: null) — etkilenen URL'lerin ilk `URL_PREVIEW_LIMIT`'i + kalan sayı.
 * Az sayıda sayfayı etkileyen bulgular DOKUNULMADAN kalır — "bu sayfada tam olarak ne var"
 * görünümü küçük/orta ölçekli denetimlerde (asıl `auditUrls` senaryosu) hâlâ değerli.
 *
 * `crawlSection.ts` (rapor gövdesi) ve `ruleSynthesizer.ts` (yönetici özeti) İKİSİ de bunu
 * çağırır — tek yerden, iki yüzeyde de tutarlı.
 */
export const dedupeWidespreadFindings = <T extends Finding>(findings: readonly T[]): readonly T[] => {
  const byTemplate = new Map<string, T[]>()
  for (const finding of findings) {
    const key = `${finding.category}|${finding.title}`
    const existing = byTemplate.get(key)
    if (existing === undefined) byTemplate.set(key, [finding])
    else existing.push(finding)
  }

  return [...byTemplate.values()].flatMap((group): readonly T[] => {
    const urls = group.map((finding) => finding.url).filter((url): url is string => url !== null)
    // Grup içinde zaten url:null olan (site geneli) bir bulgu varsa ya da eşik aşılmadıysa dokunma.
    if (urls.length !== group.length || urls.length <= WIDESPREAD_FINDING_THRESHOLD) return group

    const preview = urls.slice(0, URL_PREVIEW_LIMIT).join(', ')
    const remainder = urls.length > URL_PREVIEW_LIMIT ? ` (+${urls.length - URL_PREVIEW_LIMIT} daha)` : ''
    const representative = group[0]!
    return [{ ...representative, url: null, evidence: `${urls.length} sayfada tespit edildi: ${preview}${remainder}` }]
  })
}

const SEVERITY_IMPACT_BASE: Readonly<Record<FindingSeverity, number>> = {
  critical: 70,
  high: 45,
  medium: 25,
  low: 10,
}

/**
 * Ciddiyet + faz payından 0..100 etki tahmini üretir. `phaseShare` yoksa (faz-bağımsız
 * bulgu) yalnız ciddiyet tabanı kullanılır. Kesin bilim değil — göreli sıralama için yeterli.
 */
export const estimateImpact = (severity: FindingSeverity, phaseShare: number | null = null): number => {
  const base = SEVERITY_IMPACT_BASE[severity]
  const shareBonus = phaseShare === null ? 0 : Math.round(phaseShare * 30)
  return Math.min(100, base + shareBonus)
}
