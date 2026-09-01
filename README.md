# SEO Komuta Merkezi

Türkiye pazarı için otomatik SEO araştırma pipeline'ı. Keyword/SERP, backlink, teknik denetim
(CWV), arama performansı (GSC), indeksleme durumu, gerçek kullanıcı verisi (CrUX), AI görünürlük
(GEO), site içi denetim (crawler: on-page + iç link grafiği) ve kod erişimli denetim (kaynak
kodundan doğrudan bulgu, satır numarasıyla) dallarını toplar, rakipleri otomatik keşfeder, her
çalıştırmayı SQLite'a timestamp'li snapshot olarak kaydeder ve "geçen çalıştırmaya göre ne
değişti" analiziyle Markdown + HTML rapor üretir.

## Hızlı Başlangıç

```bash
npm install
npm run research        # tam araştırma → data/<domain-slug>.db + reports/ altına rapor (--config verilmezse config/project.json)
npm run research        # ikinci çalıştırmada "Değişenler" bölümü dolar
npm run research-all    # config/ altındaki HER müşteriyi ayrı ayrı çalıştırır (bkz. Operasyonel bölümü)
npm run status           # her müşterinin son koşu durumunu tek tabloda gösterir
npm run report          # son snapshot'tan raporu yeniden üret (veri toplamadan)
npm run discover-competitors   # yalnız rakip keşfi, konsol tablosu
npm run codeaudit -- --code /yol/kaynak-kodu   # yalnız kod denetimi, anahtarsız, tek başına
npm test                # birim + uçtan uca test
npm run typecheck
```

### Core Web Vitals teşhisi

```bash
npm run audit -- https://example.com/   # tek sayfa: LCP faz kırılımı + kopyalanabilir düzeltmeler
```

Anahtar gerektirmez — lokalde Lighthouse çalıştırır (Chrome kurulu olmalı). Çıktı yalnız
"LCP 6 saniye" demez; LCP'yi dört faza böler, suçlu elementin CSS seçicisini verir ve
baskın faza göre hazır düzeltme kodu üretir.

### Gerçek kullanıcı verisi (RUM) — anlık ve attribution detaylı

```bash
npm run rum -- snippet https://siten.com/api/rum   # web-vitals snippet kodunu üretir
npm run rum -- serve 8787                          # beacon toplayıcıyı başlatır
npm run rum -- status                              # toplanan örneklerin p75 özeti
```

Lab araçları (Lighthouse/PSI) INP ölçemez (gerçek etkileşim gerekir). Üretilen snippet
[GoogleChrome/web-vitals](https://github.com/GoogleChrome/web-vitals) attribution
build'ini kullanır; toplanan örnekler **75. persentil** ile değerlendirilir (Google'ın
kullandığı yöntem — ortalama değil).

RUM tek INP kaynağı değil: CrUX (`CRUX_API_KEY`, aşağıya bakın) trafiği olan siteler için
INP'yi bedavaya verir ve rakip karşılaştırmasını mümkün kılar — RUM'un yapamadığı şey bu.
İkisi birbirini tamamlar: CrUX geniş ama 28 günlük ve toplu (p75 tek sayı); RUM anlık ve
sayfa/attribution detaylı (hangi etkileşim, hangi element yavaş).

API anahtarı olmadan her şey **MOCK modda** çalışır: Türkçe "ayakkabı" ailesi sentetik verisiyle uçtan uca gerçekçi bir demo raporu üretilir. Raporlarda belirgin bir "⚠ MOCK MODE" banner'ı bulunur.

## Yeni müşteri ekleme

Her müşteri bir config dosyasıdır: `config/project.json`. Şema `src/config/schema.ts`'te
zod ile doğrulanır — hatalı config açık Türkçe mesajla reddedilir.

**Hızlı başlangıç — yalnız domain ile:**

```bash
npm run init-client -- mamcreatives.com
```

`config/mamcreatives-com.json`'ı domainden tahmin edilen değerlerle (brandName, tek
elemanlı brandTokens/seedKeywords, anasayfa auditUrls) hemen çalışır durumda üretir —
`npm run doctor -- --config config/mamcreatives-com.json` doğrudan çalışır. Ama gerçek
SEO değeri için aşağıdaki tabloya göre elle zenginleştirilmesi gerekir (özellikle
`seedKeywords` — tahmin yalnız marka adını içerir, tek başına hiçbir şey ölçmez).
Dosya zaten varsa `--force` olmadan üzerine yazılmaz.

| Alan | Zorunlu | Ne yazılır |
|---|:---:|---|
| `domain` | ✓ | Kök domain, protokolsüz ve www'suz: `mamcreatives.com` |
| `brandName` | ✓ | Markanın yazılı hali: `MAM Creatives` |
| `brandTokens` | ✓ | Markanın AI cevaplarında geçebileceği tüm varyantları |
| `seedKeywords` | ✓ | Takip edilecek aramalar — kota sürücüsü, her biri 1 SerpApi çağrısı |
| `seedCompetitors` | — | Bildiğin gerçek rakipler; boş bırakılırsa sistem SERP'ten kendisi bulur |
| `aiQueries` | — | GEO ölçümü için müşteri ağzından sorular |
| `auditUrls` | — | CWV denetlenecek temsilci sayfalar |
| `codePath` | — | Kaynak kodun yerel yolu — verilirse "Kod Denetimi" bölümü çalışır (aşağıya bakın) |

### Doldururken dikkat edilecekler

**`brandTokens` en çok yanlış doldurulan alan.** AI görünürlüğü tamamen buna bağlı:
Gemini cevabında marka geçiyor mu diye bakan kod bu listeyi kullanıyor. Aksan ve boşluk
farkları otomatik tolere edilir (Hotiç ↔ hotic), ama kısaltmaları ve yaygın yanlış
yazımları elle eklemek gerekir. Eksik yazılırsa ölçüm sessizce "%0 görünürlük" der.

**`aiQueries` içine markanın adını koyma.** "MAM Creatives iyi bir ajans mı?" diye
sorulursa cevap doğal olarak markayı anar ve ölçüm anlamsızlaşır. Doğrusu potansiyel
müşterinin soracağı hali: "İstanbul'da startup'lar için en iyi dijital ajanslar hangileri?"

**`auditUrls` için şablon başına bir sayfa seç** — anasayfa, bir hizmet sayfası, bir blog
yazısı. Aynı şablondaki sayfalar aynı koddan üretildiği için CWV davranışları benzerdir.
Boş bırakılırsa sistem SERP'te sıralanan gerçek URL'lerden şablon başına temsilci seçer.

**`seedKeywords` sayısı kotayı belirler.** Her keyword çalıştırma başına 1 SerpApi
araması demek. Ücretsiz kota 250/ay: 15 keyword'lük bir müşteri ayda ~16 çalıştırma
eder, beş müşteride bu üçe düşer. Ücretli plana geçilirse bu sınır kalkar.

**`seedCompetitors` otomatik keşifle aynı işi yapmaz** — ikisi farklı soruyu cevaplar:

- *Otomatik keşif*: "benim önemsediğim aramalarda fiilen kim kazanıyor?" Veriden gelir,
  sürpriz çıkarır. Ama **yalnız senin keyword listenin içinden** rakip bulabilir.
- *`seedCompetitors`*: "iş hayatında gerçekten kiminle yarışıyorum?" Aramanın göremediği
  bilgi. Üç faydası var: (1) %15'lik görünme eşiğini aşar, yani SEO'su şu an kötü olan
  gerçek bir rakip de izlenir; (2) farklı kelimeleri hedefleyen veya teklif masasında
  karşına çıkan rakibi yakalar; (3) backlink ve CWV karşılaştırmasına dahil olmayı garantiler.

Bilmiyorsan boş bırak — uydurmaktansa veriye bırakmak daha doğru. Biliyorsan doldur.

### Site dışı ön koşullar

**GSC için** o müşterinin Search Console mülküne servis hesabı adresinin
(`GSC_CLIENT_EMAIL` değeri) kullanıcı olarak eklenmesi gerekir — her müşteri için ayrı
ayrı, "Sınırlı" yetki yeterli. Eklenmezse yalnız o dal düşer, rapor uyarıyı gösterir,
gerisi çalışır. Not: sitede zaten bir `google-site-verification` etiketi varsa mülk
oluşturulmuş demektir; DNS TXT kaydına gerek yok, sahibinin kullanıcı eklemesi yeter.

**RUM için** (anlık, attribution detaylı INP) müşterinin sitesine web-vitals snippet'inin
gömülmesi ve beacon'ların bir endpoint'e gitmesi gerekir (`npm run rum -- snippet`). Bu
daha büyük bir iş; ilk kurulumda atlanabilir — `CRUX_API_KEY` eklenirse INP zaten (toplu,
28 günlük) geliyor olur, RUM sonradan eklenebilir.

### Site denetimi (crawler) — on-page + iç link grafiği

Anahtar gerektirmez, yalnız müşterinin **kendi** sitesini tarar (rakip crawl'ı yok). Varsayılan
olarak **mock** — canlı siteye gerçek istek atmak için `.env`'de `CRAWL_PROVIDER=live` açık
olarak verilmeli (bkz. aşağıdaki tablo). robots.txt'e uyar, sitemap.xml'i okur ve sitemap
URL'lerini de crawl kuyruğuna ekler (Faz 5.5) — seed URL'lerden (anasayfa + `auditUrls`)
başlayıp iç linkleri dalga dalga (derinlik sınırlı) takip eder.

Tespit ettiği bulgular: eksik/uzun title, boş/uzun meta description, H1 yok/birden fazla,
canonical yok/erişilemiyor/yönlendiriyor/zincirli/noindex hedefli, schema.org (JSON-LD) yok ya
da zorunlu alan eksik, eksik Open Graph, alt'sız/boyutsuz görsel, kırık iç link (4xx/5xx ya da
ağ hatası), yönlendirme zinciri/döngüsü, öksüz sayfa, sitemap yok/uyumsuz (iki yönlü), noindex+
sitemap çelişkisi (meta VEYA `X-Robots-Tag` başlığı), karma içerik (mixed content), viewport/
`lang` eksik, hedef keyword title/H1/gövdede geçmiyor (Faz 5.4). Tarama bütçesi
`config/project.json`'daki `crawlMaxPages`/`crawlMaxDepth`/`crawlExcludePaths` ile ayarlanır
(varsayılan 300 sayfa / derinlik 5).

**JS render karşılaştırması henüz yok** — yalnız ham HTML taranır (bilinçli bir sıralama kararı:
önce ham HTML, render sonra). Client-side render edilen içerik crawler'a görünmez.

### Kod erişimli denetim — kaynak koddan doğrudan bulgu, satır numarasıyla

Anahtar gerektirmez, `config/project.json`'daki `codePath` (ya da `--code <yol>`) yapılandırılmışsa
çalışır. Crawler canlı HTML'den "bu sorun var" der; kod denetimi kaynak dosyayı okuyup "şurada,
şu satırda" der — bazı bulgularda (`culpritSelector`'ı olan CWV bulguları dahil) doğrudan
`dosya:satır` eşleşmesi üretir.

Desteklenen stack'ler: framework-bağımsız kurallar (legacy görsel formatı, terk edilmiş statik
`.html` yığını, render'ı blokan 3. parti script, `.htaccess`'te eksik önbellek/HTTPS direktifi)
her stack'te çalışır; özel PHP siteleri (`index.php` + `.htaccess` imzası) için ayrıca çakışan
robots meta, eksik Open Graph, no-cache pragma meta, `<base href>` riski, JSON-LD yokluğu,
HTML yorumu içinde ölü `<h1>`, çok dilli routing'e rağmen hreflang yokluğu; Next.js (App Router)
için `'use client'`in layout kökünde olması, `dynamic(...,{ssr:false})`, `force-dynamic`, eksik
`generateStaticParams`, eksik `metadata`/`generateMetadata`, `<img>` yerine `next/image` yokluğu,
`next/font`/`next/script` kullanılmaması.

**Neden `ts-morph` yok:** yukarıdaki kuralların tamamı dosya-konvansiyonu + satır-çapalı regex ile
bulunabiliyor. Tam TypeScript derleyicisini bağımlılık yapmak tek bir kural için haklı değildi —
gerçekten kapsam/tip çözümü isteyen bir kural çıkarsa eklenir.

WordPress kural seti henüz yok (ajansın aktif projelerinin hiçbiri WP değil). Bulgular asla
otomatik uygulanmaz — `fixSnippet` üretilir, dosyaya yazılmaz.

```bash
npm run codeaudit -- --code /yol/kaynak-kodu   # tek başına, hızlı bakış
npm run doctor -- --code /yol/kaynak-kodu      # kaç dosya okundu + tespit edilen stack
```

### Bilinen sınır: şu an yalnız Türkiye pazarı

`locale` alanı fiilen dekoratif. SerpApi çağrısı `google.com.tr` / `gl=tr` / `hl=tr`,
DataForSEO ise Türkiye konum koduyla (2792) sabit yazılı. Niyet sınıflandırmasındaki
işaret kelimeleri ve pazaryeri/haber filtresi de Türkiye pazarına göre. Yurt dışı müşteri
için bu üç yerin config'ten okunacak şekilde açılması gerekir.

## Gerçek Veriye Geçiş

`.env.example` → `.env` kopyalayıp anahtar ekleyin. Kategori başına bağımsız geçiş:

| Kategori | Anahtar | Kaynak | Maliyet |
|---|---|---|---|
| SERP | `SERPAPI_KEY` | SerpApi | 250 arama/ay ücretsiz |
| Keyword + Backlink | `DATAFORSEO_LOGIN/PASSWORD` | DataForSEO | pay-as-you-go |
| Teknik denetim (CWV) | *anahtar yok* → `TECH_AUDIT_PROVIDER=lighthouse` | Lokal Lighthouse | **ücretsiz, kotasız** |
| Teknik denetim (yedek) | `PAGESPEED_API_KEY` | Google PageSpeed | ücretsiz, ama kotalı |
| GSC (kendi siteniz) | `GSC_CLIENT_EMAIL/PRIVATE_KEY` | Search Console | ücretsiz — **en değerli gerçek veri** |
| İndeksleme durumu | *aynı GSC anahtarları* | Search Console URL Inspection | ücretsiz, ek anahtar gerekmez |
| CrUX alan verisi (rakipler dahil) | `CRUX_API_KEY` | Chrome UX Report | ücretsiz |
| AI görünürlük (GEO) | `GEMINI_API_KEY` | Gemini API | token başına |
| Site denetimi (crawler) | *anahtar yok* → `CRAWL_PROVIDER=live` | Kendi sitenize `fetch` | **ücretsiz** |
| Kod erişimli denetim | *anahtar yok* → `codePath` / `--code` | Yerel dosya okuma | **ücretsiz** |
| Keyword fırsatları (rakipte var, sende yok) | *aynı* `DATAFORSEO_LOGIN/PASSWORD` | DataForSEO Labs | pay-as-you-go |
| Bildirim (yalnız başarısızlıkta) | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | Telegram Bot API | ücretsiz |

Gemini birincil AI motoru çünkü Google AI Overviews'ı besleyen model odur — oradaki
görünürlük doğrudan arama sonuç sayfasına yansır. `ANTHROPIC_API_KEY` **implemente edilmiş
bir sağlayıcı** — `GEMINI_API_KEY` verilmemişse devreye girer (tek-motor seçimi:
`registry.ts`'teki `selectAiVisibility`, Gemini varsa Gemini kazanır). *(2026-08-31 dış
denetimde doküman hatası olarak düzeltildi — sağlayıcı `registry.ts:78`'de zaten çalışıyordu.)*

`CRUX_API_KEY` ayrı bir Google API'si — aynı Google Cloud projesindeki bir anahtar
çalışır ama projede **Chrome UX Report API** ayrıca etkinleştirilmeli, aksi halde
`403 PERMISSION_DENIED` döner. Anahtar kısıtlaması "Application restrictions" için
**None** ya da **IP addresses** olmalı — "Websites" (HTTP referrer) sunucu taraflı
çağrılarda çalışmaz, Node.js `Referer` başlığı göndermez. Verilmezse kategori mock'a
düşer, pipeline hata vermez (tek anahtarlı, opsiyonel bir zenginleştirme).

Önemli politika: yarım yapılandırma sessizce mock'a düşmez. DataForSEO ve GSC gibi çok
anahtarlı kategorilerde anahtarlardan biri eksikse pipeline **yüksek sesle hata verir**
(`src/providers/registry.ts`) — kullanıcı gerçek veri beklerken sahte veri raporlamak
en tehlikeli sessiz hatadır.

Yapılandırmayı doğrulamak için: `npm run doctor` — hangi kategorinin gerçek sağlayıcıya
bağlandığını gösterir ve ücretsiz olanları (Gemini, GSC, İndeksleme, Lighthouse) canlı
dener; kotalı olanları bilerek denemez.

**Not (İndeksleme durumu):** `gscUrlInspectionProvider.ts`'in şeması Google'ın resmi
dokümantasyonundan yazıldı, henüz **canlı bir GSC servis hesabına karşı doğrulanmadı**
(bu depoda GSC anahtarları henüz yok). GSC anahtarlarını ekledikten sonra `npm run doctor`
çalıştırıp "İndeksleme durumu" satırının ✓ verdiğini kontrol edin.

**Not (Keyword fırsatları):** `dataForSeoProviders.ts`'teki `domain_intersection` şeması da
aynı gerekçeyle **canlı doğrulanmadı** (Faz 4.4 uygulanırken DataForSEO bakiyesi boştu).
Alan adları uyuşmazsa sessizce yanlış veri ÜRETMEZ — savunmacı zod şeması açık bir hata
döner (`dataForSeoResponseToKeywordGaps` yorumu). Bakiye yüklenip ilk gerçek çağrı
yapıldığında şema doğrulanmalı, gerekirse düzeltilmeli.

## Operasyonel: VPS + çoklu müşteri

Araç elle tetiklemenin ötesine geçip kendi kendine çalışabilir: `config/` dizinine
her müşteri için bir `*.json` dosyası koyduğunuzda, `npm run research-all` hepsini
sırayla (nezaket + Lighthouse maliyeti gerekçesiyle paralel değil) ayrı birer çocuk
süreç olarak çalıştırır. Bir müşterinin başarısız olması diğerlerini durdurmaz.

- `npm run research-all` — her müşteriyi çalıştırır, çıktıyı `logs/<tarih>_<slug>.log`'a yazar.
- `npm run status` — her müşterinin son koşu zamanı/durumu/rapor yolunu tek tabloda gösterir.
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` verilirse, **yalnız en az bir müşteri
  başarısız olduğunda** Telegram'a bildirim gider (her koşuda "her şey yolunda"
  mesajı yok — `status` zaten bunu sorulduğunda söylüyor). İkisinden yalnız biri
  verilirse pipeline yüksek sesle hata verir; yarım yapılandırmayla sessizce atlanmaz.

Bir Linux VPS'te `systemd` zamanlayıcısıyla günlük otomatik çalıştırma için
[`deploy/README.md`](deploy/README.md)'ye bakın (Node/Chrome kurulumu, systemd
birimleri, `journalctl` ile izleme, log rotasyonu).

**Not (2026-08-31 düzeltildi):** `npm run research` (`--config` VERMEDEN) daha önce sabit
`data/seo.db`'ye yazıyordu — `research-all`'ın kullandığı `data/<müşteri-slug>.db`
geçmişinden AYRI, trend geçmişini sessizce çatallayan bir tuzaktı (dış denetim bulgusu).
Artık `--config` verilmese bile varsayılan `config/project.json` okunur ve `dbPath`
domain'den türer — bare `npm run research` ve
`npm run research -- --config config/project.json` AYNI veritabanına yazar.

## Mimari

```
config/project.json → src/config (zod doğrulama)
        ↓
src/providers/registry.ts  ← kategori başına mock/gerçek seçimi (TEK yer)
        ↓
src/collectors  ← 2 aşama: (1) keyword+SERP omurga, (2) SERP'ten türetilen
        ↓          rakiplerle backlink/teknik/AI/GSC paralel. Omurga çökerse run
        ↓          'failed'; diğer dallar kısmi hatayla devam eder ve raporda görünür.
src/analysis    ← saf fonksiyonlar: intent sınıflandırma (TR marker'lar),
        ↓          kümeleme, rakip keşfi (frekans %15 eşiği + pazaryeri/haber filtresi),
        ↓          fırsat skoru (hacim × kolaylık × vuruş-mesafesi), AI boşluk tespiti,
        ↓          crawl/ → on-page + link grafiği + taranabilirlik bulgu tespiti,
        ↓          diffRuns (sıra/rakip/CWV/AI-oran/sayfa sayısı değişimleri + alert'ler)
src/codeaudit   ← readSourceTree (güvenli okuma + redactSecrets) → detectStack →
        ↓          rules/agnostic + rules/php + rules/nextjs (stack'e göre koşullu) →
        ↓          linkFindingsToCode (CWV bulgularını culpritSelector'dan kaynağa bağlar).
        ↓          Sağlayıcı DEĞİL — mock/gerçek ikiliği yok, config.codePath varsa çalışır.
src/storage     ← better-sqlite3; her run immutable snapshot (yalnız INSERT),
        ↓          diff = iki runId okuması, UNIQUE(runId, doğalAnahtar)
src/synthesis   ← kural tabanlı deterministik sentez (anahtarsız çalışır)
src/reporting   ← tek ReportModel → Markdown + self-contained HTML
```

Türkçe not: tüm string karşılaştırmaları `src/core/text.ts` içindeki `normalizeTr()` üzerinden yapılır (İ/i sorunu), marka eşleştirme aksan-bağımsızdır (Hotiç ↔ hotic.com.tr).

## Bilinen Sınırlar (tasarım gereği)

- Keyword takibi seçilen örneklemle sınırlıdır — "her aramayı" izlemek yerine niyet kümeleri üzerinden temsili izleme yapılır.
- AI görünürlük deterministik değildir; sorgu başına 3 örnekleme alınır ve oran raporlanır.
- Rakip trafiği tahmindir; ölçülmüş gerçek veri yalnız kendi siteniz için (GSC) mümkündür.
# SEO_PipeLine
