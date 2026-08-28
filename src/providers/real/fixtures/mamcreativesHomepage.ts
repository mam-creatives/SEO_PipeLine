/**
 * mamcreatives.com anasayfasından çekilen GERÇEK HTML'in kırpılmış hali (2026-08-28).
 * Uydurma değil — `<head>` etiketleri ve `<body>`'den temsili bir kesit birebir korunmuş,
 * yalnızca büyük script/style blokları ve tekrar eden bölümler kırpılmış.
 *
 * Bilinçli olarak GERÇEK ve KUSURLU: bu üç bulgu şu an canlı sitede fiilen mevcut —
 * `mamcreativesLighthouseSeo.ts` fixture'ındaki "Description text is empty." ile tutarlı:
 *  - `meta name="description"` içeriği BOŞ (`content=""`)
 *  - Sayfada hiç `<h1>` yok — ilk başlık `<h3>`, sonra `<h2>` geliyor (hiyerarşi atlaması + H1 yok)
 *  - `application/ld+json` (schema.org) hiç yok
 *  - `og:image` var ama `og:title`/`og:description` yok (eksik OG)
 *  - 38 görselden 1'i `alt` özniteliği taşımıyor
 *  - `https://mamcreatives.com/` → 301 → `https://www.mamcreatives.com/` (finalUrl farklı)
 */
export const MAMCREATIVES_HOMEPAGE_HTML = `<!DOCTYPE html>
<html class="no-js" lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MAM Creatives | Reklam Ajansı &amp; Yazılım Şirketi</title>
<meta name="description" content="">
<link rel="canonical" href="https://www.mamcreatives.com/" />
<meta property="og:image" content="https://www.mamcreatives.com/upload/1768823294-696e19feee0ab.png" />
</head>
<body>
<nav>
<a href="https://www.mamcreatives.com/">Anasayfa</a>
<a href="javascript:void(0);">Kurumsal</a>
<a href="hakkimizda">Hakkımızda</a>
<a href="bloglar">Bloglar</a>
<a href="hizmetlerimiz">Hizmetlerimiz</a>
<a href="hizmet/dijital-pazarlama">Dijital Pazarlama</a>
<a href="hizmet/marka-analizi">Marka Analizi</a>
<a href="tel:0532 659 34 72">0532 659 34 72</a>
<a href="mailto:info@mamcreatives.com">info@mamcreatives.com</a>
<a href="https://www.instagram.com/mamcreatives">Instagram</a>
</nav>
<main>
<img src="/upload/logo.png" alt="Mam Creatives logosu" />
<img src="/upload/hero-banner.jpg" />
<h3>Mam Creatives</h3>
<h2>Building Bright Futures, Hand in Hand</h2>
<h3>Yaratıcı Dijital Çözümlerle Markanızı Geleceğe Taşıyoruz</h3>
<h4>Mam Creatives - 360° Reklam Ajansı</h4>
<h2>Sunduğumuz Hizmetler</h2>
<h3>Dijital Pazarlama</h3>
<h3>Marka Analizi</h3>
<h3>Prodüksiyon Hizmetleri</h3>
</main>
</body>
</html>`
