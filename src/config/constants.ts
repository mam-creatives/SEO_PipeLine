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
 * Denetim maliyeti: her URL bir Lighthouse koşusu (10-30sn) demek.
 * Müşteri sayfaları ve rakip ana sayfaları ayrı ayrı sınırlanır.
 */
export const MAX_AUDIT_URLS = 4
export const TECH_AUDIT_COMPETITOR_COUNT = 3

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

/** Intent sınıflandırması için Türkçe işaret kelimeleri (normalize edilmiş halleriyle) */
export const INTENT_MARKERS = {
  informational: ['nasıl', 'nedir', 'neden', 'ne zaman', 'kaç', 'rehber', 'temizlenir', 'ölçülür', 'yapılır'],
  commercial: ['fiyat', 'satın al', 'ucuz', 'en iyi', 'indirim', 'kampanya', 'öneri', 'model'],
  local: ['mağaza', 'mağazası', 'nerede', 'yakınımda', 'adres'],
  cities: ['istanbul', 'ankara', 'izmir', 'bursa', 'antalya', 'adana', 'konya', 'gaziantep', 'kayseri', 'eskişehir'],
} as const
