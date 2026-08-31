/**
 * Faz 5.6 — GitHub'ın kendi başlık→anchor algoritmasını taklit eder (lowercase, harf/rakam/
 * boşluk/tire dışını at, boşlukları tireye çevir) — Unicode harfleri (ı/ğ/ü/ş/ö/ç) ASCII'ye
 * katlamaz, GitHub da katlamıyor. Bilerek `normalizeTr` KULLANMAZ: GitHub/çoğu görüntüleyici
 * heading→anchor dönüşümünde locale-aware değil düz `toLowerCase()` kullanıyor — "AI" Türkçe
 * kuralıyla "aı" olurdu ama gerçek anchor "ai" oluyor, link kırılırdı. En iyi çaba.
 *
 * Dış denetim bulgusu (2026-08-31, Faz C) — bu fonksiyon `markdownReport.ts` ve `htmlReport.ts`
 * içinde birebir kopyaydı (DRY ihlali); şimdi tek kaynak, ikisi de buradan import eder.
 * HTML için teknik olarak zorunlu değil (id/href kendi kontrolümüzde) ama iki dosyanın
 * tutarlı kalması için aynı fonksiyon kullanılır.
 */
export const slugAnchor = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^\p{L}\p{N} -]+/gu, '')
    .trim()
    .replace(/\s+/g, '-')
