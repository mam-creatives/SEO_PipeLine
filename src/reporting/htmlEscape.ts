/** HTML enjeksiyonuna karşı temel kaçış — rapor metinleri (audit başlığı, açıklama, URL) kullanıcı/3. parti kaynaklı olabilir. */
export const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
