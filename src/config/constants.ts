import { CWV_RATING_THRESHOLDS } from '../core/cwv.js'
import type { DomainClassification } from '../core/types.js'

/** Bir domain'in "gerçek rakip" sayılması için keyword setinde görünme oranı eşiği */
export const COMPETITOR_THRESHOLD = 0.15

/** AI görünürlük ölçümü deterministik değil — sorgu başına örnek sayısı */
export const AI_SAMPLES_PER_QUERY = 3

/** Bu kadar sıra düşüş alert üretir */
export const RANK_DROP_ALERT_THRESHOLD = 3

/** Müşteri mention oranı bunun altındayken rakip güçlüyse "AI görünürlük boşluğu" */
export const AI_CLIENT_MENTION_WEAK = 0.34
export const AI_COMPETITOR_MENTION_STRONG = 0.5

/** "Vuruş mesafesi": bu sıra aralığındaki keyword'ler fırsat skorunda ödüllendirilir */
export const STRIKING_DISTANCE_MIN = 4
export const STRIKING_DISTANCE_MAX = 20

/**
 * AI Overview varken Google cevabı doğrudan gösterildiği için üst sırada olmanın
 * tıklama (CTR) değeri düşer — fırsat skoru bu oranda kısılır (%15 ceza).
 */
export const AI_OVERVIEW_OPPORTUNITY_PENALTY = 0.85

/**
 * Featured snippet yokken niyet 'informational' ise snippet'i kapma fırsatı var
 * ve niyet zaten "doğrudan cevap arıyorum" — fırsat skoru bu oranda artırılır (%15 prim).
 */
export const FEATURED_SNIPPET_INFORMATIONAL_BONUS = 1.15

/**
 * Denetim maliyeti: her URL bir Lighthouse koşusu (10-30sn) demek.
 * Müşteri sayfaları ve rakip ana sayfaları ayrı ayrı sınırlanır.
 */
export const MAX_AUDIT_URLS = 4
export const TECH_AUDIT_COMPETITOR_COUNT = 3
/** Faz 4.4 — keyword gap keşfi kaç rakiple sınırlı; her rakip ayrı bir DataForSEO çağrısı demek. */
export const KEYWORD_GAP_COMPETITOR_COUNT = 3

/**
 * Lighthouse aynı Node sürecinde EŞZAMANLI ÇALIŞTIRILAMAZ.
 *
 * Süreç-global `performance.mark()` kullandığı için paralel koşular birbirinin
 * işaretlerini eziyor ve hepsi `The "start lh:runner:gather" performance mark
 * has not been set` hatasıyla düşüyor (7 URL denendiğinde fiilen yaşandı).
 * Ayrı süreçlerde paralel çalışması sorunsuz — sınır yalnız süreç içi.
 *
 * Bedeli: URL başına 10-30sn, yani 7 URL ~2 dakika.
 */
export const TECH_AUDIT_CONCURRENCY = 1

/**
 * Rakip haritasında gösterilecek azami satır. Keşif onlarca tek-seferlik domain
 * bulabiliyor (bir koşuda 90+); gerçek rakipler her hâlükârda listelenir,
 * gerisi bu sınırla kırpılır ki tablo okunabilir kalsın.
 */
export const COMPETITOR_REPORT_LIMIT = 20

export const DEFAULT_MOCK_SEED = 42
export const TOP_N_SERP = 10
export const OPPORTUNITY_TOP_COUNT = 5

/**
 * Google'ın "iyi" eşikleri: LCP 2.5s, INP 200ms, CLS 0.1.
 * Tek kaynaktan (core/cwv.ts) türetilir ki üçlü bant ile ikili geçti/kaldı asla ayrışmasın.
 */
export const CWV_THRESHOLDS = {
  lcpMs: CWV_RATING_THRESHOLDS.LCP.good,
  inpMs: CWV_RATING_THRESHOLDS.INP.good,
  cls: CWV_RATING_THRESHOLDS.CLS.good,
} as const

/**
 * Rakip keşfinde hariç tutulan domain'ler: pazaryerleri, haber siteleri,
 * sosyal ağlar ve içerik toplayıcılar her ticari kelimede çıkar ama
 * gerçek işletme rakibi değildir.
 */
export const EXCLUDED_DOMAIN_PATTERNS: readonly {
  readonly pattern: string
  readonly classification: Exclude<DomainClassification, 'business'>
}[] = [
  { pattern: 'trendyol.com', classification: 'marketplace' },
  { pattern: 'hepsiburada.com', classification: 'marketplace' },
  { pattern: 'n11.com', classification: 'marketplace' },
  { pattern: 'amazon.com', classification: 'marketplace' },
  { pattern: 'amazon.com.tr', classification: 'marketplace' },
  { pattern: 'sahibinden.com', classification: 'marketplace' },
  { pattern: 'ciceksepeti.com', classification: 'marketplace' },
  { pattern: 'hurriyet.com.tr', classification: 'news' },
  { pattern: 'milliyet.com.tr', classification: 'news' },
  { pattern: 'sozcu.com.tr', classification: 'news' },
  { pattern: 'sabah.com.tr', classification: 'news' },
  { pattern: 'onedio.com', classification: 'aggregator' },
  { pattern: 'eksisozluk.com', classification: 'aggregator' },
  { pattern: 'wikipedia.org', classification: 'aggregator' },
  { pattern: 'wikihow.com', classification: 'aggregator' },
  { pattern: 'akakce.com', classification: 'aggregator' },
  { pattern: 'cimri.com', classification: 'aggregator' },
  { pattern: 'epey.com', classification: 'aggregator' },
  { pattern: 'foursquare.com', classification: 'aggregator' },
  { pattern: 'youtube.com', classification: 'social' },
  { pattern: 'instagram.com', classification: 'social' },
  { pattern: 'facebook.com', classification: 'social' },
  { pattern: 'x.com', classification: 'social' },
  { pattern: 'linkedin.com', classification: 'social' },
  { pattern: 'pinterest.com', classification: 'social' },
  { pattern: 'behance.net', classification: 'social' },
  { pattern: 'dribbble.com', classification: 'social' },
  // Hizmet pazaryerleri ve SaaS araçları: her ticari sorguda çıkarlar ama
  // ajans/işletme rakibi değildirler. mamcreatives.com koşusunda bunlar
  // "gerçek rakip" olarak işaretlenip listeyi kirletmişti.
  { pattern: 'armut.com', classification: 'marketplace' },
  { pattern: 'bionluk.com', classification: 'marketplace' },
  { pattern: 'fiverr.com', classification: 'marketplace' },
  { pattern: 'upwork.com', classification: 'marketplace' },
  { pattern: 'canva.com', classification: 'aggregator' },
  { pattern: 'turbologo.com', classification: 'aggregator' },
  { pattern: 'renderforest.com', classification: 'aggregator' },
]

/** Google SERP'te title/description bu uzunluktan sonra genelde kırpılır (piksel bazlı yaklaşık karakter sınırı). */
export const TITLE_MAX_LENGTH = 60
export const META_DESCRIPTION_MAX_LENGTH = 160

/** Faz 2 crawler bulgu eşikleri. */
export const CRAWL_CONCURRENCY = 4
export const CRAWL_REQUEST_DELAY_MS = 200

/**
 * Faz 4.3 — GSC URL Inspection ve CrUX çağrıları önceden çıplak `Promise.all` ile gidiyordu;
 * `collectTechAudits`'teki aynı gerekçeyle (kaynak tükenmesi/oran sınırı riski, bkz.
 * mapWithConcurrency yorumu) sınırlanır. Değerler `CRAWL_CONCURRENCY` ile aynı — bugünkü
 * hacimde zararsız, müşteri/URL sayısı büyürse ayrıca ayarlanabilir.
 */
export const INDEXING_CONCURRENCY = 4
export const CRUX_CONCURRENCY = 4

/**
 * Faz 4.1 — istemci-taraflı render (CSR) sezgisi. Bilimsel değil, ucuz bir sinyal: görünür
 * metin / ham HTML boyutu oranı bu eşiğin ALTINDA VE script sayısı bu eşiğin ÜSTÜNDEYSE sayfa
 * "muhtemelen istemci tarafında render ediliyor" işaretlenir — ikisi birlikte, çünkü analytics/
 * chat widget scriptleri tek başına yaygındır ve içerik-zengin sayfalarda da bol script olabilir.
 */
export const CSR_SUSPECT_TEXT_RATIO = 0.02
export const CSR_SUSPECT_MIN_SCRIPT_TAGS = 5

/** Faz 4.2 — zaten toplanan crawl verisini kullanan yeni bulgu eşikleri. */
export const DEEP_PAGE_THRESHOLD = 3
export const MIN_WORD_COUNT = 150

/**
 * Faz 3 kod denetçisi — güvenli okuma sınırları. Müşteri kaynak ağaçları binlerce dosya
 * (mamcreatives.com'da 7344) taşıyabilir; sınırsız okuma bellek riski taşır.
 */
export const MAX_SOURCE_FILES = 2000
export const MAX_SOURCE_FILE_BYTES = 300_000

/** Adı bu listedeki bir dizinin altındaki hiçbir dosya okunmaz (üçüncü parti kod, derlenmiş çıktı, medya). */
export const CODE_AUDIT_IGNORED_DIRS: readonly string[] = [
  'vendor',
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'upload',
  'uploads',
  '.phpunit.cache',
  'arsiv',
]

/**
 * Yalnız bu uzantılar okunur (allowlist — 2960 svg + 1205 jpeg/png/pdf gibi ikili/medya
 * dosyaları için blocklist yerine güvenli varsayılan: bilinmeyen uzantı asla okunmaz).
 */
export const CODE_AUDIT_TEXT_EXTENSIONS: readonly string[] = [
  '.php',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.html',
  '.htm',
  '.css',
  '.scss',
  '.json',
]

/** Uzantısız ama metin olan özel dosya adları (ör. Apache yönlendirme kuralları). */
export const CODE_AUDIT_TEXT_BASENAMES: readonly string[] = ['.htaccess']

/** Intent sınıflandırması için Türkçe işaret kelimeleri (normalize edilmiş halleriyle) */
export const INTENT_MARKERS = {
  informational: ['nasıl', 'nedir', 'neden', 'ne zaman', 'kaç', 'rehber', 'temizlenir', 'ölçülür', 'yapılır'],
  commercial: ['fiyat', 'satın al', 'ucuz', 'en iyi', 'indirim', 'kampanya', 'öneri', 'model'],
  local: ['mağaza', 'mağazası', 'nerede', 'yakınımda', 'adres'],
  cities: ['istanbul', 'ankara', 'izmir', 'bursa', 'antalya', 'adana', 'konya', 'gaziantep', 'kayseri', 'eskişehir'],
} as const
