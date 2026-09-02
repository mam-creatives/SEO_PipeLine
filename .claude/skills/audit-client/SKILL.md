---
name: audit-client
description: Bir müşterinin canlı sitesini VE yerel kaynak kodunu TEK bir çalıştırmada birlikte denetler, ikisini karşılaştırıp kök nedeni gösteren kısa bir özet üretir. Yalnız yerel/kişisel kullanım için — dağıtılmaz, pazarlanmaz.
metadata:
  origin: seo-komuta-merkezi
  version: A (Versiyon C — yerel birleşik analiz)
---

# Müşteri Denetimi (Kod + Canlı Site)

Bu skill, `seo-komuta-merkezi` pipeline'ının zaten yaptığı bir şeyi kolay erişilir hale
getirir: `config.codePath` verildiğinde `npm run research` zaten kod denetimini
(`src/codeaudit/computeCodeAuditFindings.ts`) canlı crawl/on-page bulgularıyla AYNI
raporda birleştirir (`Finding.codeLocation` alanı, raporun "Kod Denetimi" bölümü). Bu
skill'in tek işi: config dosyasını elle düzenlemeden bunu tetiklemek ve sonucu kısa,
okunabilir bir özete çevirmek.

**Yeni TypeScript kodu YOK — bu, mevcut CLI'nin bir orkestrasyon katmanı.**

## Ne zaman kullanılır

Kullanıcı bir müşterinin sitesini VE o sitenin kaynak kodunu birlikte, tek seferde
denetlemek istediğinde ("şu müşteriyi hem kod hem site tarafında denetle", "kodları da
kontrol et" gibi isteklerde). Yalnız canlı site denetimi isteniyorsa (kod erişimi yok/
gerekmiyor), bunun yerine doğrudan `npm run research -- --config config/<slug>.json`
öner — bu skill'e gerek yok.

## Girdi

Kullanıcıdan (ya da konuşma bağlamından) şunlar gerekir:
- **domain** — zorunlu, örn. `mamcreatives.com`
- **yerel kod yolu** — zorunlu, müşterinin kaynak kodunun bu makinedeki mutlak yolu

İkisi de yoksa kullanıcıya sor; tahmin etme.

## Adımlar

1. **Repo kökünü doğrula.** `package.json`'da `"name": "seo-komuta-merkezi"` olduğunu
   kontrol et (yanlış projede çalıştırılmasın).

2. **Config var mı kontrol et.** `slugify(domain)` mantığıyla ([src/core/text.ts](../../../src/core/text.ts))
   `config/<slug>.json` yolunu türet (örn. `mamcreatives.com` → `config/mamcreatives-com.json`).
   Dosya yoksa: kullanıcıya `npm run init-client -- <domain>` çalıştırmayı öner (mevcut
   komut — `.env`'de `GEMINI_API_KEY` varsa otomatik AI destekli araştırma da yapar),
   sonra devam et. Dosya varsa doğrudan 3. adıma geç.

3. **Kod yolunun geçerli olduğunu doğrula.** Verilen yerel kod yolunun var olduğunu
   kontrol et (`ls` ya da benzeri). Yoksa kullanıcıya sor, tahmin etme.

4. **Araştırmayı çalıştır:**
   ```bash
   npm run research -- --config config/<slug>.json --code <yerel-kod-yolu>
   ```
   Bu, `--code` bayrağını config'teki `codePath`'i GEÇİCİ olarak ezmek için kullanır
   ([src/cli/args.ts](../../../src/cli/args.ts)) — config dosyasını kalıcı değiştirmez.
   Komut birkaç dakika sürebilir (Lighthouse URL başına 10-30sn, crawler yüzlerce sayfa
   olabilir) — arka planda çalıştır, bitmesini bekle.

5. **Üretilen raporu oku.** Komutun çıktısındaki `.md` rapor yolunu (`reports/<tarih>_<slug>/report-run<id>.md`)
   oku. İki bölüme özellikle bak:
   - **"Kod Denetimi"** — `codeLocation.file`/`line` içeren bulgular (kaynak kod seviyesi).
   - **"Site Denetimi (Crawler)"** — canlı sayfalarda tespit edilen bulgular.

6. **Kök nedeni eşleştir.** Aynı sorunun HEM kod tarafında (ör. bir PHP şablonunda eksik
   meta description mantığı) HEM canlı sitede (o şablonu kullanan N sayfada "meta
   description eksik" bulgusu) göründüğü durumları öne çıkar — bu, skill'in asıl kattığı
   değer: "bu N sayfadaki sorun aslında TEK bir dosyadaki TEK bir satırdan kaynaklanıyor"
   demek, N ayrı sayfa düzeltmek yerine.

7. **Kısa bir özet sun.** Sohbette:
   - Kaç kritik/önemli bulgu var (toplam, kategori bazında değil — kısa tutulsun).
   - Kod↔canlı eşleşen 2-4 örnek (varsa) — "kök neden" çerçevesiyle.
   - Rapor dosyasının tam yolu (detay orada).
   - **Uydurma yapma** — yalnız raporda GERÇEKTEN yazan bulguları özetle, sayıları rapordan
     birebir al.

## Sınırlar

- Bu skill DB'ye yazar (normal `npm run research` gibi — immutable snapshot modeli),
  yani müşterinin normal trend geçmişine bir run daha ekler. Bu istenmeyen bir yan etki
  DEĞİL — asıl pipeline'ın parçası, ayrı/gizli bir mod değil.
- GSC/DataForSEO gibi kategoriler `.env`'de anahtar yoksa mock kalır — bu skill bunu
  değiştirmez, yalnız kod+canlı birleştirmeyi kolaylaştırır.
- Yalnız yerel/kişisel kullanım için tasarlandı — dağıtım/pazarlama/paylaşım amacı yok.
