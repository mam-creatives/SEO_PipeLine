import { estimateImpact, type Finding } from '../../../core/findings.js'
import type { SourceFile } from '../../types.js'

const SAMPLE_SIZE = 5

/**
 * Her stack'te çalışır — `readSourceTree` yalnız `codePath` altını taradığı için burada
 * bulunan her `.html` dosyası, uygulamanın router/CMS katmanından geçmeden doğrudan
 * sunucudan servis edilebilecek durumda demektir (framework build çıktısı `.next`/`dist`
 * zaten `CODE_AUDIT_IGNORED_DIRS` ile taramaya hiç girmiyor).
 *
 * Gerçek kanıt: mamcreatives.com `template/` altında 88 adet `.html`, `robots.txt`
 * `Allow: /` — hiçbiri engellenmemiş, hepsi indekslenebilir ince/yinelenen içerik adayı.
 */
export const detectPublicDeadHtml = (files: readonly SourceFile[]): readonly Finding[] => {
  const htmlFiles = files.filter((file) => file.ext === '.html' || file.ext === '.htm')
  if (htmlFiles.length === 0) return []

  const sample = htmlFiles.slice(0, SAMPLE_SIZE).map((file) => file.relPath)
  const remaining = htmlFiles.length - sample.length

  const finding: Finding = {
    category: 'content',
    severity: htmlFiles.length >= 10 ? 'medium' : 'low',
    url: null,
    culpritSelector: null,
    title: `${htmlFiles.length} statik .html dosyası uygulama router'ından bağımsız, doğrudan erişilebilir`,
    explanation:
      `Kaynak ağacında ${htmlFiles.length} adet .html dosyası bulundu. Bunlar genellikle şablon/tema ` +
      `demo dosyalarıdır ve canonical/meta yönetimi olmadan doğrudan URL ile erişilip indekslenebilir — ` +
      `ana sitedeki içerikle yarışan ince/yinelenen sayfalar üretir. Ya kaldırılmalı ya da robots.txt'te ` +
      `açıkça engellenmeli.`,
    evidence: sample.join(', ') + (remaining > 0 ? ` (+${remaining} daha)` : ''),
    impact: estimateImpact(htmlFiles.length >= 10 ? 'medium' : 'low'),
    effort: 'small',
    fixSnippet: null,
  }
  return [finding]
}
