# Faz 1 — Mevcut veriyi derinleştir

## Context

`SEO_PipeLine` bugün SERP sırası, backlink, Core Web Vitals ve AI görünürlüğü ölçüyor.
Mimarî sağlam: `Result` tipiyle hatasız akış, kategori başına mock/gerçek seçimi tek noktada
(`src/providers/registry.ts`), immutable snapshot + diff motoru, ve `CwvFinding` biçiminde iyi
tasarlanmış bir bulgu modeli.

Araştırma sırasında çıkan tespit: **araç, zaten elindeki veriyi kullanmıyor.**

- `lighthouseSchema.ts:26` yalnız `categories.performance` ayrıştırıyor. Aynı `lhr` yanıtında
  `categories.seo` ve audit'leri (`document-title`, `meta-description`, `canonical`, `hreflang`,
  `image-alt`, `is-crawlable`) hazır duruyor — ek istek, ek anahtar, ek kota yok.
- `SerpSnapshot.hasAiOverview` toplanıyor, `serp_results` tablosuna yazılıyor ve hiçbir analiz
  okumuyor. Bir sorguda AI Overview varsa organik CTR ekonomisi baştan değişir.
- `gscProvider.ts:52` yalnız `dimensions: ['query']` istiyor. `page` eklenince yamyamlık
  (cannibalization) tespiti ve sayfa bazlı performans bedavaya geliyor.
- GSC'nin URL Inspection ucu hiç kullanılmıyor: sayfa indeksli mi, Google hangi canonical'ı
  seçti — SEO'nun en kritik sinyali ve şu an tamamen görünmez.
- CrUX API mevcut Google anahtarıyla çalışır ve **rakipler dahil** gerçek p75 INP verir.

Bu faz yeni bir ücretli servis eklemez; hepsi ücretsiz ya da zaten ödenmiş veriden.

**Sonraki fazlar (bu planın kapsamı dışında):** Faz 2 — crawler + on-page denetimi (Mod 1),
Faz 3 — kod erişimli denetçi (Mod 2, framework tespiti + eklenti kural setleri).

---

## Sana ihtiyacım olanlar

| # | Ne | Neden | Olmazsa |
|---|---|---|---|
| 1 | `npm install` çalıştırma izni | `node_modules` yok, `npm test` "vitest: not found" veriyor | Hiçbir şey doğrulanamaz |
| 2 | **Karar:** `CRUX_API_KEY` ayrı mı, `PAGESPEED_API_KEY` mi? | CrUX ayrı bir Google API'si; aynı anahtar çalışır ama GCP projesinde *Chrome UX Report API* ayrıca etkinleştirilmeli | Ayrı opsiyonel anahtar yazıp `PAGESPEED_API_KEY`'e düşecek şekilde kuruyorum (varsayılan kararım) |
| 3 | Canlı doğrulama için `.env` anahtarları (`GSC_*`, `PAGESPEED_API_KEY`) | URL Inspection ve CrUX'un gerçek yanıt şemasını doğrulamak | Kod + fixture testleriyle teslim edilir, canlı doğrulama sana kalır — **raporda açıkça yazarım** |

Lighthouse SEO fixture'ını kendim üretebilirim: bu ortamda Chromium kurulu. Ağ engellenirse
senden `npx lighthouse https://www.mamcreatives.com/ --output=json` çıktısını isteyeceğim.

---

## Adımlar

### 1.0 — Ortak `Finding` modeli (önce bu)

Aşağıdaki üç adım (1.1, 1.2, 1.3) bulgu üretiyor ve hiçbiri `CwvFinding`'e sığmıyor. Genelleme
önce yapılmalı, yoksa üç farklı bulgu şekli ortaya çıkar.

**Yaklaşım: additive.** `culpritSelector` gibi alanları yeniden yapılandırmak 118 testi
gereksizce kırar. `CwvFinding` düzleşmiş hali korunur, üstüne alan eklenir:

```ts
// src/analysis/findings.ts (yeni) — cwv/types.ts buradan türer
export interface Finding {
  category: 'cwv' | 'onpage' | 'indexing' | 'content'   // Faz 2/3: 'links' | 'code'
  severity: 'critical' | 'high' | 'medium' | 'low'
  url: string | null
  culpritSelector: string | null
  title: string
  explanation: string
  evidence: string                    // ölçülen ham değer — iddianın dayanağı
  impact: number                      // 0..100
  effort: 'trivial' | 'small' | 'medium' | 'large'
  fixSnippet: string | null
  metric?: CwvMetricName              // yalnız CWV bulgularında
  phase?: string
  phaseShare?: number | null
  codeLocation?: CodeLocation | null   // Faz 3'te dolar, şimdilik yok
}
```

`impact × effort` raporu "50 sorun var" listesinden "önce şu üçünü yap" listesine çevirir.
`sortFindings()` ve `SEVERITY_ORDER` taşınır, `'low'` eklenir. `lcpRules.ts` / `inpRules.ts` /
`clsRules.ts` yalnız yeni alanları doldurur — teşhis mantığı değişmez.

`ruleSynthesizer.ts` ve `cwvSection.ts` `Finding` tüketecek şekilde uyarlanır.

### 1.1 — Lighthouse SEO kategorisi *(sıfır ek maliyet)*

- `lighthouseSchema.ts`: `categories` şemasına opsiyonel `seo` / `accessibility` /
  `best-practices` ekle (`performance` zorunlu kalır — mevcut sert hata politikası korunur)
- `lighthouseAdapter.ts`: `extractSeoFindings(audits)` — `score === 0` olan SEO audit'leri
  `Finding`'e çevirir; `details.items` içindeki suçlu node'lar `culpritSelector`'a girer
- `TechAudit`'e `seoScore: number | null` ve `findings: readonly Finding[]`
- `migrations.ts` **v4**: `ALTER TABLE tech_audits ADD COLUMN seoScore REAL` +
  `ADD COLUMN seoFindings TEXT NOT NULL DEFAULT '[]'`
- Fixture: `aizhoLighthouse.ts` yanına `categories.seo` içeren gerçek bir koşu
  (`aizhoLighthouseSeo.ts`), mevcut fixture bozulmadan

### 1.2 — GSC auth ayrıştırması + URL Inspection

Auth makinesi (`signServiceAccountJwt`, token önbelleği, `resolveSiteUrl`) şu an
`createGscProvider` kapanışının içinde. İki sağlayıcı aynı jetonu paylaşmalı, yoksa her
çalıştırmada iki kez OAuth turu atılır.

- **`src/providers/real/gscAuth.ts` (yeni)**: `createGscAuth(clientEmail, privateKey)` →
  `{ getAccessToken, resolveSiteUrl }`, tek paylaşılan token önbelleği.
  `gscProvider.ts` bunu kullanacak şekilde daraltılır — davranış aynı, testler aynı.
- **`src/providers/real/gscUrlInspectionProvider.ts` (yeni)**:
  `POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect`.
  Mevcut `webmasters.readonly` scope'u yeterli — **yeni anahtar gerekmiyor**.
- Yeni tip `IndexStatus` → `src/core/types.ts`: `coverageState`, `robotsTxtState`,
  `indexingState`, `googleCanonical`, `userCanonical`, `lastCrawlTime`, `pageFetchState`
- Yeni sağlayıcı kategorisi `indexing` → `providers/types.ts` + `registry.ts`
  (GSC anahtarlarına bağlanır, `requireAllOrNone` sonucu yeniden kullanılır)
- Denetlenecek URL seti: `selectAuditUrls()` çıktısı (zaten şablon başına temsilci seçiyor).
  Kota mülk başına 2000/gün — `MAX_AUDIT_URLS = 4` ile sorun yok.
- `src/analysis/detectIndexingIssues.ts`: saf fonksiyon → `Finding[]`.
  En kritik kural: `googleCanonical !== userCanonical` → `critical`, "Google senin canonical'ını
  reddetti". `coverageState` indeksli değilse `critical`.
- `migrations.ts` **v5**: `index_status` tablosu, `UNIQUE(runId, url)`

### 1.3 — GSC `page` boyutu + yamyamlık tespiti

- `buildGscRequestBody`: `dimensions: ['query','page']`
- `GscResponseSchema` zaten `keys: string[]` — `gscResponseToRows` `keys[1]`'i `page`'e alır
- `GscRow`'a `page: string`
- `migrations.ts` **v6**: `gsc_metrics` UNIQUE'i `(runId, query, page)` olacak şekilde
  tablo yeniden oluşturulur (SQLite'ta UNIQUE değişimi `CREATE new → INSERT SELECT → DROP → RENAME`)
- `src/analysis/detectCannibalization.ts`: aynı sorguda ≥2 sayfa gösterim alıyorsa `Finding`.
  Eşik: ikincil sayfanın gösterimi birincilin %20'sini geçiyorsa — tek gösterimlik gürültü elenir.
- **Diff motoru dikkat**: `queryRepository.ts` ve `diffRuns.ts` GSC satırlarını okuyor; anahtar
  `query`'den `query+page`'e geçtiği için `storage.test.ts` genişletilmeli. Aksi halde ikinci
  çalıştırmada sahte delta üretir — `serpApiProvider.ts:64` yorumundaki hatanın aynısı.

### 1.4 — CrUX API (gerçek alan verisi, rakipler dahil)

- `EnvSchema`'ya `CRUX_API_KEY` (opsiyonel; yoksa `PAGESPEED_API_KEY`'e düşer)
- **`src/providers/real/cruxProvider.ts` (yeni)**:
  `POST https://chromeuxreport.googleapis.com/v1/records:queryRecord`.
  `url` sorgusu 404 dönerse `origin` ile tekrar dener (yeterli trafiği olmayan sayfa yaygın) —
  404 hata değil, "veri yok" demektir ve öyle raporlanmalı.
- Çıktı `CwvAttribution` ile `source: 'field'`. `diagnoseCwv()` zaten `source`'a duyarlı ve
  `attribution.inp` doluysa INP teşhisini otomatik açıyor — **kod değişikliği gerekmiyor**.
- Rakip origin'ler için de çekilir (`realCompetitorDomains()` çıktısı) → raporda
  müşteri vs rakip alan verisi karşılaştırma tablosu (`cwvSection.ts`)
- `migrations.ts` **v7**: `field_cwv` tablosu, `UNIQUE(runId, url, formFactor)`
- README güncellemesi: "INP'nin tek kaynağı RUM" ifadesi düzeltilir — CrUX trafiği olan siteler
  için INP verir ve rakip karşılaştırmasını mümkün kılar; RUM ise anlık ve attribution detaylı.
  İkisi birbirini tamamlar.

### 1.5 — Toplanan SERP özelliği verisini kullan

- `scoreOpportunities.ts`: `hasAiOverview` / `hasFeaturedSnippet` çarpanı.
  AI Overview varken #1 olmanın CTR değeri düşer, "vuruş mesafesi" primi azaltılır;
  featured snippet yoksa ve niyet `informational` ise fırsat primi artar.
  → `Opportunity`'ye `serpFeatures` alanı, `reason` metni buna göre
- `buildKeywordRows()` şu an `SerpSnapshot`'tan yalnız sırayı okuyor; bayrakları da taşımalı
- `markdownReport.ts` / `htmlReport.ts`: Fırsatlar tablosuna "SERP özellikleri" sütunu
- SerpApi yanıtında AI Overview **kaynak listesi** varsa yakala — GEO'nun ölçülebilir kısmı bu:
  Google cevabında kimi kaynak gösteriyor. Şema opsiyonel, yoksa sessizce atlanır.

### 1.6 — Çok müşteri desteği

`src/cli/research.ts:9-11` ve `report.ts:18-19` yolları sabit yazılı; ikinci müşteride
`data/seo.db` çakışıyor. README "her müşteri bir config dosyasıdır" diyor ama CLI kabul etmiyor.

- `--config <yol>` argümanı; `dbPath` ve `reportsDir` config'in `domain` alanından türer
  (`data/<domain>.db`, `reports/<domain>/`)
- `runResearch()` zaten `ResearchOptions` alıyor — değişiklik yalnız CLI katmanında
- `doctor.ts`, `report.ts`, `auditUrl.ts` aynı argümanı kabul eder

### 1.7 — Anthropic AI görünürlük sağlayıcısı

`anthropicAiVisibilityProvider.ts` iskelet; `registry.ts:63` anahtar verilirse hata veriyor.
Tamamlanınca GEO ölçümü tek motordan iki motora çıkar — AI görünürlüğü modele göre ciddi
değişir, tek motor yanıltıcıdır.

- `@anthropic-ai/sdk` bağımlılığı + `client.messages.create`
- Model `claude-haiku-4-5` (dosyada zaten yazılı) doğru seçim: GEO ölçümünde amaç "en iyi
  cevabı almak" değil, sıradan kullanıcının aldığı cevabı görmek
- `registry.ts`: Gemini + Anthropic ikisi de varsa ikisinden de örnek alınır
  (`AiVisibilitySample.model` zaten model adını taşıyor, şema değişikliği gerekmiyor)
- `detectAiGaps.ts` model bazında ayrıştırma yapmalı — şu an tüm örnekleri harmanlıyor

### 1.8 — `doctor.ts` güncellemesi

Yeni kategoriler (`indexing`, `crux`) `CATEGORY_LABELS`'a eklenir. İkisi de ücretsiz olduğu için
"canlı deneme" bölümüne girer — `checkIndexing`, `checkCrux`.

---

## Veri kaynakları: Semrush gerekli mi?

**Kısa cevap: pipeline'a veri kaynağı olarak hayır; ekibin elle kullandığı araç olarak evet.**

İki sebep: (1) Semrush/Ahrefs'in Türkçe veritabanları İngilizce/Almanca'ya göre belirgin şekilde
zayıf — Google Ads Keyword Planner verisini doğrudan çeken kaynaklar TR'de daha isabetli.
(2) UI aboneliği makul ama **programatik API erişimi ayrı ve çok daha pahalı fiyatlanıyor** —
bu pipeline'ın tüm mesele ettiği şey programatik erişim.

Asıl mesele şu: aradığın özelliklerin çoğu **zaten entegre olan DataForSEO'da var**, sadece
kullanılmıyor. `dataForSeoProviders.ts` şu an yalnız keyword hacmi ve backlink özeti çekiyor.

| İhtiyaç | Şu an | Çözüm |
|---|---|---|
| Keyword hacmi / zorluk | ✅ DataForSEO | — |
| **Keyword keşfi** ("başka ne aranıyor") | ❌ yalnız elle yazılan `seedKeywords` | DataForSEO Labs `keyword_ideas` / `related_keywords` |
| **Keyword gap** (rakipte var, sende yok) | ❌ | DataForSEO Labs `domain_intersection` — tek çağrı, en yüksek getirili "Semrush özelliği" |
| **Rakip keyword evreni** | ❌ | DataForSEO Labs `ranked_keywords` |
| **Backlink detayı** (yeni/kayıp, anchor) | ❌ yalnız toplam sayı | DataForSEO `backlinks/anchors`, `/history` |
| Rakip trafik tahmini | ❌ | DataForSEO `domain_rank_overview` |
| Sıra takibi | ✅ SerpApi | — |

Keyword keşfi gerçek bir boşluk: araç şu an **sen ne yazarsan onu izliyor**, yeni fırsat
bulmuyor. Bunu Faz 1.5'ten sonra ayrı bir adım olarak eklemeyi öneriyorum — Semrush almadan.

**Ayrıca değerlendirmeye değer, ucuz/ücretsiz:**

- **Google Ads Keyword Planner API** — ücretsiz, TR hacim verisinde en isabetli kaynak.
  Şart: aktif harcaması olan bir Google Ads hesabı; yoksa kesin sayı değil aralık döner.
- **Bing Webmaster Tools API** — ücretsiz, keyword + indeks durumu verir. Hafife alınıyor;
  ayrıca ChatGPT'nin arama katmanı Bing indeksine dayandığı için GEO açısından anlamlı.
- **Screaming Frog CLI** — Faz 2 crawler'a kısayol olabilir. Ama kendi crawler'ın `Finding`
  modeline ve Faz 3'teki kod eşlemesine bağlanabiliyor; SF bağlanamaz. Kendi crawler'ını öner.

**Almayacağın şey:** GEO izleme SaaS'ları (Profound, Peec vb.). Yaptıkları iş, senin
`collectAiVisibility` + `detectMentions` kombinasyonun — 1.7'den sonra iki motorla zaten
onların yaptığını yapıyor olacaksın.

---

## Doğrulama

Her adım kendi içinde doğrulanır, sona bırakılmaz:

```bash
npm install
npm run typecheck
npm test                 # mevcut 118 test yeşil kalmalı — her adımdan sonra
npm run doctor           # yeni kategoriler görünmeli
npm run research         # mock modda uçtan uca
npm run research         # İKİNCİ koşu — "Değişenler" bölümü ve sahte-delta kontrolü
```

Her yeni sağlayıcı repodaki deseni tekrarlar: **saf dönüştürücü fonksiyon + fixture testi**
(`realProviders.test.ts`, `lighthouseAdapter.test.ts` bu deseni zaten kuruyor). Testte ağ
çağrısı yok; gerçek yanıt fixture olarak saklanır.

**Riskli nokta — iki kez koşmak şart:** 1.3 (`gsc_metrics` anahtar değişimi) ve 1.1/1.4 (yeni
`tech_audits` sütunları) `RunSnapshot`'ı değiştiriyor. `storage.test.ts` ve `analysis.test.ts`
genişletilmezse diff motoru ikinci çalıştırmada sahte alarm üretir. Migration'ların eski veriyle
geriye dönük uyumu (`attribution TEXT DEFAULT '{}'` deseninin aynısı) her adımda korunur.

Gerçek veriyle son doğrulama anahtarlar geldikten sonra `mamcreatives.com` üzerinde.