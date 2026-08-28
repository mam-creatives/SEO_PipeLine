# SEO Pipeline — Eksik Analizi ve Yol Haritası

## Context

`SEO_PipeLine` bugün dört şeyi ölçüyor: SERP sırası (SerpApi), backlink profili (DataForSEO),
Core Web Vitals (Lighthouse/PSI) ve AI görünürlüğü (Gemini). Mimarî sağlam — `Result` tipiyle
hatasız akış, kategori başına mock/gerçek seçimi tek noktada (`src/providers/registry.ts`),
immutable snapshot + diff motoru, ve `CwvFinding` biçiminde gerçekten iyi tasarlanmış bir bulgu
modeli (severity + suçlu CSS seçici + kopyalanabilir fix).

**Ama araç siteyi hiç indirmiyor.** Tek bir sayfanın HTML'ine bakan kod yok: `<title>`, meta
description, canonical, H1 hiyerarşisi, schema.org, robots.txt, sitemap.xml, iç link grafiği,
kırık link, indeksleme durumu — hiçbiri ölçülmüyor. Kullanıcı yakında iki mod istiyor:
(1) uzaktan denetleyen, (2) kod tabanını okuyan denetçi. İkincisi için mevcut kodda hiç dosya
sistemi okuma katmanı yok.

Kullanıcının seçtiği öncelik: **önce mevcut veriyi derinleştir**. Bu doğru seçim — aşağıdaki
Faz 1 kalemlerinin tamamı ücretsiz, çoğu zaten yarı yolda ve bazıları hâlihazırda toplanıp
kullanılmadan atılan veriyi kurtarıyor.

Hedef stack: karışık/belirsiz → Mod 2'de önce framework tespit katmanı, kural setleri eklenti.

---

## Faz 1 — Mevcut veriyi derinleştir (şimdi)

Sıra, getiri/emek oranına göre.

### 1.1 Lighthouse'un zaten döndürdüğü SEO verisini kullan — *sıfır ek maliyet*

`src/providers/lighthouse/lighthouseSchema.ts` yalnız `categories.performance` alanını
ayrıştırıyor. Aynı `lhr` yanıtı içinde `categories.seo` ve onun audit'leri zaten var:
`document-title`, `meta-description`, `is-crawlable`, `robots-txt`, `canonical`, `hreflang`,
`image-alt`, `link-text`, `crawlable-anchors`, `http-status-code`.

Ek istek yok, ek anahtar yok, ek kota yok — sadece şemayı genişletmek. Aracın en büyük kör
noktası olan on-page denetimi bunun %60'ını bedavaya kapatıyor.

- `lighthouseSchema.ts`: `categories.seo` + ilgili audit id'leri şemaya ekle
- `lighthouseAdapter.ts`: `extractIssues` yanında `extractSeoFindings` — çıktı `CwvFinding`
  değil, 2.1'de tanımlanan genel `Finding` tipi
- `migrations.ts`: v4 — `tech_audits` tablosuna `seoScore REAL` + `seoFindings TEXT`

### 1.2 GSC URL Inspection API — indeksleme durumu

Bugün `gscProvider.ts` yalnız `searchanalytics` çağırıyor. Search Console'un
`POST /v1/urlInspection/index:inspect` ucu ücretsiz ve şunu söylüyor: sayfa indeksli mi
(`coverageState`), Google hangi canonical'ı seçti (`googleCanonical` vs `userCanonical`),
robots durumu (`robotsTxtState`), son tarama (`lastCrawlTime`), getirme durumu
(`pageFetchState`), rich result tespiti.

"Google senin canonical'ını kabul etmedi" ya da "sayfa hiç indekslenmemiş" — SEO'da bundan daha
kritik tek bir sinyal yok ve şu an tamamen görünmez. Kota: mülk başına 2000/gün.

- Yeni tip `IndexStatus` → `src/core/types.ts`
- Yeni sağlayıcı kategorisi `indexing` → `src/providers/types.ts` + `registry.ts`
  (mevcut `requireAllOrNone` GSC anahtar mantığını yeniden kullan, yeni anahtar gerekmez)
- `src/providers/real/gscUrlInspectionProvider.ts` — `gscProvider.ts`'teki JWT imzalama
  ve token önbelleği aynen yeniden kullanılır, kopyalanmaz: o kısmı `gscAuth.ts`'e çıkar
- Denetlenecek URL seti: `selectAuditUrls()` çıktısı (zaten şablon başına temsilci seçiyor)
- `migrations.ts`: v5 — `index_status` tablosu, `UNIQUE(runId, url)`

### 1.3 CrUX API — gerçek kullanıcı verisi, RUM kurmadan

`https://chromeuxreport.googleapis.com/v1/records:queryRecord`, mevcut `PAGESPEED_API_KEY` ile
çalışır, ücretsiz. Yeterli trafiği olan **her origin/URL için** gerçek p75 LCP/INP/CLS döner —
**rakipler dahil**.

README şu an "INP'nin tek kaynağı RUM" diyor ve müşteri sitesine snippet gömmeyi şart koşuyor.
Bu doğru ama tam değil: CrUX, trafiği olan siteler için INP'yi bedavaya veriyor ve rakip
karşılaştırmasını mümkün kılıyor — RUM'un yapamadığı şey bu. İkisi birbirini tamamlar:
CrUX = geniş ama 28 günlük ve toplu; RUM = anlık ve sayfa/attribution detaylı.

- `src/providers/real/cruxProvider.ts` → `CwvAttribution.source = 'field'` ile besler
- `diagnoseCwv()` zaten `source`'a duyarlı; `attribution.inp` doluysa INP teşhisi otomatik açılır
- Raporda müşteri vs rakip alan verisi karşılaştırma tablosu (`cwvSection.ts`)

### 1.4 GSC'ye `page` boyutu — yamyamlık (cannibalization) tespiti

`GscRow` şu an yalnız `query` boyutunda. `dimensions: ['query','page']` istenirse aynı sorgu
için birden fazla sayfanın sıralandığı durum görünür hale gelir — klasik ve yüksek etkili bir
bulgu, ve düzeltmesi ucuzdur (birleştir ya da canonical ver).

- `GscRow`'a `page: string` ekle; `migrations.ts` v6 (`gsc_metrics` UNIQUE'i `(runId, query, page)`)
- `src/analysis/detectCannibalization.ts` — saf fonksiyon, mevcut analysis deseniyle aynı
- Aynı veri "hangi sayfa hangi sorguda kaç tıklama alıyor"u da açar → fırsat skoruna gerçek
  veri girer (şu an `scoreOpportunities.ts` yalnız tahminî hacim × zorluk kullanıyor)

### 1.5 Zaten toplanan ama kullanılmayan SERP verisini kullan

`SerpSnapshot.hasAiOverview` ve `hasFeaturedSnippet` toplanıyor, `serp_results` tablosuna
yazılıyor — ve **hiçbir analiz ya da rapor bunları okumuyor**. Bir sorguda AI Overview varsa
organik CTR ekonomisi baştan değişir; bu, fırsat skorunun görmezden gelemeyeceği bir çarpan.

- `scoreOpportunities.ts`: AI Overview varlığını skora kat (`rankGapFactor` yanında yeni çarpan)
- `markdownReport.ts` / `htmlReport.ts`: Fırsatlar tablosuna "SERP özellikleri" sütunu
- SerpApi yanıtındaki AI Overview **kaynak listesi** varsa onu da yakala — GEO'nun asıl
  ölçülebilir kısmı bu: Google cevabında kimi kaynak gösteriyor

### 1.6 Küçük ama bloklayıcı: çok müşteri desteği

`src/cli/research.ts:9-11` ve `src/cli/report.ts:18-19` yolları sabit yazılı
(`config/project.json`, `data/seo.db`, `reports`). README "her müşteri bir config dosyasıdır"
diyor ama CLI bunu kabul etmiyor — ikinci müşteride veritabanı çakışıyor.

- `--config <yol>` argümanı; db ve rapor yolu config'in `domain` alanından türetilsin
- `runResearch()` zaten `ResearchOptions` alıyor, değişiklik sadece CLI katmanında

### 1.7 Anthropic AI görünürlük sağlayıcısını tamamla

`src/providers/real/anthropicAiVisibilityProvider.ts` iskelet halinde ve `registry.ts:63`
anahtar verilirse yüksek sesle hata veriyor. Tamamlanması GEO ölçümünü tek motordan iki motora
çıkarır — AI görünürlüğü modele göre ciddi değişir, tek motor yanıltıcıdır.

Model: `claude-haiku-4-5` (dosyada zaten yazılı) doğru seçim — GEO ölçümünde amaç "en iyi
cevabı almak" değil, sıradan bir kullanıcının aldığı cevabı görmek.

---

## Faz 2 — Ortak `Finding` modeli + crawler (Mod 1'in temeli) ✅ TAMAMLANDI

**Durum notu (uygulama sırasında iki düzeltme):**

1. **2.1 (`CwvFinding` → genel `Finding`) planlanmadan önce zaten yapılmıştı** — Faz 1.0/1.1'de
   (commit `f12a93d`) `Finding` genel tipi `src/core/findings.ts`'e taşınmış,
   `CwvFinding` bunun daraltılmış alt tipi olarak kurulmuştu. `category` bu fazda yalnız
   `'links'` aldı (`'structured-data'` ayrı bir kategori açmadı — schema.org/OG `onpage`'e,
   robots.txt/sitemap uyuşmazlıkları `indexing`'e girdi; `'code'` Faz 3'e bırakıldı).
2. **"`findings` tablosu" (eski satır 172) mimariyle çelişiyordu, açılmadı.** `Finding` hiçbir
   yerde kalıcı bir tabloya yazılmıyor — `indexingFindings`/`cannibalizationFindings`'le aynı
   desen: yalnız ham `pages`/`page_links` DB'ye yazılır (migration v8), bulgular her run'da
   `detectOnPageIssues`/`detectLinkIssues`/`detectCrawlabilityIssues` ile ham veriden
   yeniden hesaplanır (`src/analysis/crawl/`).

**Uygulanan crawler kapsamı:** `src/providers/real/crawlProvider.ts` (fetchPage/fetchRobotsRules/
fetchSitemapUrls — CrUX'un domain-şekilli, ham metin sızdırmayan deseniyle), HTML/robots.txt/
sitemap ayrıştırması `cheerio` + `robots-parser` ile (yeni bağımlılıklar — dürüstçe eklendi,
elle yazmak robots.txt eşleştirmesinde risk taşırdı). `src/collectors/crawlSite.ts`: robots.txt +
sitemap.xml bir kez çekilir, seed URL'lerden (anasayfa + `auditUrls`) BFS ile dalga dalga taranır;
`crawlMaxPages`/`crawlMaxDepth`/`crawlExcludePaths` (`config/project.json`) ile sınırlanır. Tek
sayfa hatası (4xx/5xx/ağ) tüm taramayı düşürmez.

**Kapsam dışı bırakılanlar (bilinçli):**
- **JS-render geçişi** (ham HTML vs render edilmiş DOM) — repo'da programatik Chromium kontrolü
  yok (Lighthouse CLI alt süreç, ham DOM vermiyor), `playwright`/`puppeteer` gibi yeni ve ağır
  bir bağımlılık ister. Kullanıcı kararı: önce ham HTML — bu adım ileride ayrı planlanacak.
- **Rakip site crawl'ı** — yalnız `config.domain` taranıyor, rakip karşılaştırması (CWV/CrUX'ta
  zaten var) crawler'a genişletilmedi.
- `hreflang`, `Cache-Control`, `lastmod` tazeliği gibi ikincil sinyaller ilk sürüme girmedi —
  getiri/emek oranı daha düşük, ileride eklenebilir.

---

## Faz X — Operasyonel: VPS dağıtımı + zamanlayıcı + çoklu müşteri orkestrasyonu (planlanacak)

Kullanıcı isteği: proje VPS üzerinde sürekli veri toplayan, birden fazla sitenin işini
yapabilen bir hizmete dönüşebilmeli. Sıklık kararı: **günlük/haftalık zamanlanmış çalıştırma**
(neredeyse gerçek-zamanlı değil) — cron benzeri, her client için ayrı
`npm run research --config <yol>` tetiklemesi.

Mevcut mimari buna **zaten uygun**: Faz 1.6'daki `--config` → müşteri başına ayrı
`data/<slug>.db` + `reports/<tarih>_<slug>/`, izolasyon hazır. Büyük bir yeniden tasarım
beklenmiyor. Detaylandırma (systemd/cron seçimi, log toplama, hata/robots-block izleme, VPS
kaynak sınırları, crawler'ın eşzamanlılık bütçesinin client'lar arası paylaşımı gerekip
gerekmediği) **Faz 2'den sonra, ayrı bir plan turunda** yapılacak — şimdilik yalnız karar notu.

---

## Faz 3 — Kod erişimli denetçi (Mod 2) ✅ TAMAMLANDI

**Durum notu (planlanandan iki fark):**

1. **Kapsam sırası ters çevrildi.** Bu bölümün ilk hali tamamen Next.js/React'e yazılmıştı, ama
   yapılandırılmış tek gerçek müşteri (mamcreatives.com) framework'süz özel PHP: 1205 PHP
   dosyası, `.htaccess` front-controller. Uygulama sırası: **agnostik → PHP → Next.js** (kullanıcı
   kararıyla üçü de yapıldı, ama PHP gerçek kanıtla önce doğrulandı).
2. **`ts-morph` kullanılmadı.** Next.js kurallarının (render stratejisi, metadata, assets) tamamı
   dosya-konvansiyonu + satır-çapalı regex ile bulunabiliyor — tam TypeScript derleyicisini
   bağımlılık yapmak tek bir kural için haklı değildi.

**Uygulanan mimari:** `src/codeaudit/` sağlayıcı DEĞİL — `registry.ts`'e dokunulmadı, mock/gerçek
ikiliği yok (yerel dosya: yol varsa okunur, yoksa dal atlanır). `readSourceTree` (allowlist +
boyut/dosya-sayısı sınırlı, `redactSecrets` ile kimlik bilgisi zorunlu maskeli) → `detectStack`
(`index.php`+`.htaccess` / `wp-config.php` / `next.config.*` / `nuxt.config.*` / `astro.config.*`
imzalarından) → `rules/agnostic` (her stack'te: legacy görsel formatı, terk edilmiş statik
`.html`, render-blokan 3. parti script, `.htaccess`'te eksik önbellek/HTTPS) + `rules/php`
(çakışan robots meta, eksik OG, no-cache pragma, `<base href>`, JSON-LD yokluğu, hreflang
yokluğu, HTML yorumu içindeki ölü `<h1>`) + `rules/nextjs` (stack'e göre koşullu).

**Ölçüm → kod satırı köprüsü (asıl farklılaştırıcı, planlandığı gibi çalışıyor):**
`linkFindingsToCode` — herhangi bir `Finding`'in (CWV dahil) `culpritSelector`'ını kaynakta
class/id üzerinden arar, bulursa `codeLocation` doldurur, isabetsizse `null` döner (uydurmaz,
`diagnoseCwv` felsefesiyle aynı). `sortFindings` gibi generic — `CwvFinding[]` verilince
`CwvFinding[]` döner.

**Gerçek kanıtla doğrulandı** (`~/Downloads/mamcreatives.com/public_html`, 1090 okunabilir
dosya, `php-custom` tespit edildi): `index.php`'de altı bulgu birebir tuttu (108: çakışan
robots meta, 105: no-cache pragma, 103: eksik OG, 107: 4 ölü meta, 99: `<base href>`, 97: JSON-LD
yok) + `.htaccess`'te çok dilli routing'e rağmen hreflang yokluğu + crawler'ın "H1 yok"
bulgusunun kök nedeni: `inc/hizmet.php:45` ve `partial/banner.php:3`'teki `<h1>`'ler HTML yorumu
içinde, hiç render edilmiyor. Next.js kuralları ajansın `online-his-front` (Next.js 16) projesine
karşı duman testiyle doğrulandı — SEO aracına müşteri olarak tanımlı değil, yalnız kural testi
kaynağı.

**Kapsam dışı bırakılanlar (bilinçli):** WordPress kural seti (aktif proje yok), otomatik patch
uygulama (`fixSnippet` üretilir, dosyaya yazılmaz), LLM katmanı (Katman 1/2 — aşağıdaki bölüm,
ayrı bir plan turu).

---

## LLM katmanı kararı

**Kling ilgisiz** — video üretim modeli, kod analizi yapmaz.

Asıl nokta: *"sert kurallar"* modelden gelmez, **deterministik statik analizden ve şema
doğrulamalı yapılandırılmış çıktıdan** gelir. Mimari şöyle katmanlanmalı:

| Katman | Ne yapar | Anahtar |
|---|---|---|
| 0 — Deterministik | AST + config + HTML kuralları bulguları üretir | yok |
| 1 — Toplu sınıflandırma | Çok sayıda dosya/sayfayı ucuza etiketler, önceliklendirir | Gemini Flash (zaten `.env`'de) |
| 2 — Patch yazımı | Gerçek dosyada gerçek diff üretir | Claude |

Katman 0 tek başına çalışabilmeli — tıpkı `synthesizeWithRules` gibi, anahtarsız da anlamlı
çıktı vermeli. Bu, mevcut mimarînin en güçlü tarafı; bozulmamalı.

Katman 2 için model önerisi (fiyatlar 1M token, giriş/çıkış):

- **Claude Opus 5** (`claude-opus-5`) — $5 / $25, 1M bağlam. Kod okuma ve düzenlemede en güçlü
  seçenek; patch yazımı için önerilen.
- **Claude Sonnet 5** (`claude-sonnet-5`) — $2 / $10, 1M bağlam. Fiyat/performans dengesi;
  hacimli denetimlerde varsayılan yapılabilir.
- **Gemini Flash** — repoda zaten entegre (`geminiAiVisibilityProvider.ts`), ucuz, geniş bağlam.
  Katman 1 için doğru araç; patch yazımında Claude'un gerisinde.
- **DeepSeek** — en ucuzu, OpenAI-uyumlu API. Maliyet tavanı olan işler için makul bir yedek;
  uzun ajan döngülerinde ve yapılandırılmış çıktı garantisinde daha zayıf.

Katı çıktı için üçünde de mekanizma var: Anthropic'te `output_config.format` (yapılandırılmış
çıktı) ve araç tanımında `strict: true`; Gemini'de `responseSchema`; DeepSeek'te
`response_format: json_schema`. Her durumda dönen JSON **zod ile doğrulanmalı ve doğrulama
başarısızsa sert hata verilmeli** — repodaki "yarım yapılandırmayla sessizce mock'a düşülmez"
politikasının aynısı.

Uygulama şekli: LLM'i yeni bir sağlayıcı kategorisi yap (`codeSynthesis`), `registry.ts`'e ekle.
Böylece model değişimi tek satırlık bir seçim olur, kural motoruna hiç dokunulmaz.

---

## Öğrenilecek konular

**Mod 1 (uzaktan denetim)**
- Google Search Central: tarama/indeksleme, canonical seçimi, robots.txt spesifikasyonu, sitemap protokolü
- Search Console API: URL Inspection + Search Analytics (boyutlar, 16 aylık pencere, veri gecikmesi)
- Schema.org + Google zengin sonuç dokümanları: `Organization`, `LocalBusiness`, `Service`, `FAQPage`, `Article`, `BreadcrumbList`
- CrUX API ve alan verisi ile lab verisi arasındaki fark (p75 mantığı, 28 günlük pencere)
- SERP özellikleri ve AI Overviews: kaynak seçimi nasıl oluyor, organik CTR'a etkisi
- GEO (Generative Engine Optimization): varlık/entity inşası, alıntılanan kaynak olma stratejisi
- E-E-A-T, faydalı içerik sistemleri, spam politikaları
- Log dosyası analizi ve tarama bütçesi (büyük siteler için)
- Uluslararası SEO / hreflang — TR dışına çıkılacaksa (README'de bilinen sınır olarak yazılı)

**Mod 2 (kod denetimi)**
- Next.js App Router render modeli: RSC, streaming, `generateMetadata`, `generateStaticParams`, ISR/`revalidate`
- `next/image`, `next/font`, `next/script` iç işleyişi
- JS SEO: Googlebot render süreci, hidrasyon, `useEffect` ile enjekte edilen içeriğin indekslenmesi
- Kritik render yolu: preload scanner, kaynak ipuçları, öncelik ipuçları, bfcache
- AST ayrıştırma: `ts-morph` / TypeScript derleyici API'si; framework-bağımsızlık için `tree-sitter`
- Statik analiz ve özel ESLint kuralı yazımı — kuralların bir kısmı doğrudan lint kuralı olarak dağıtılabilir
- Bundle analizi: `@next/bundle-analyzer`, `source-map-explorer`
- HTTP önbellek semantiği ve CDN yapılandırması
- Erişilebilirlik (axe-core) — SEO ile ciddi kesişimi var

---

## Doğrulama

Faz 1 için, her kalem ayrı ayrı:

```bash
npm install
npm run typecheck
npm test                      # mevcut 118 test yeşil kalmalı
npm run doctor                # yeni kategoriler (indexing, crux) burada görünmeli
npm run research              # mock modda uçtan uca — banner ve rapor bölümleri
```

Her yeni sağlayıcı için mevcut desen tekrarlanır: **saf dönüştürücü fonksiyon + fixture testi**
(`realProviders.test.ts` ve `lighthouseAdapter.test.ts` bu deseni zaten kuruyor) — ağ çağrısı
testte yok, gerçek yanıt bir fixture olarak kaydediliyor.

`diffRuns` regresyonu kritik: yeni tablolar `RunSnapshot`'a girdiği için `storage.test.ts` ve
`analysis.test.ts` genişletilmeli, aksi halde ikinci çalıştırmada sahte alarm üretilebilir
(`serpApiProvider.ts`'teki `organic_results === undefined` yorumunda anlatılan tam olarak bu hata).

Gerçek veriyle doğrulama, anahtarlar eklendikten sonra `mamcreatives.com` üzerinde:
`npm run research` iki kez → ikinci raporda "Değişenler" bölümü + yeni indeksleme/CrUX bölümleri dolu.