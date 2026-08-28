import { estimateImpact, type Finding } from '../../../core/findings.js'
import type { SourceFile } from '../../types.js'

const CACHE_DIRECTIVE = /\b(?:ExpiresActive|Cache-Control|mod_expires)\b/i
const HTTPS_ENFORCEMENT = /%\{HTTPS\}/i
const HTACCESS_BASENAME = /(^|\/)\.htaccess$/

const cacheFinding = (file: SourceFile): Finding => ({
  category: 'cwv',
  severity: 'medium',
  url: null,
  culpritSelector: null,
  title: 'Sunucu tarafında tarayıcı önbellek direktifi yok',
  explanation:
    `${file.relPath} içinde Cache-Control/ExpiresActive gibi bir önbellek direktifi bulunamadı. ` +
    `Statik varlıklar (CSS/JS/görsel) her istekte yeniden indiriliyor — tekrar ziyaretlerde LCP'yi doğrudan yavaşlatır.`,
  evidence: `${file.relPath}: mod_expires/Cache-Control direktifi bulunamadı`,
  impact: estimateImpact('medium'),
  effort: 'small',
  fixSnippet: '<IfModule mod_expires.c>\n  ExpiresActive On\n  ExpiresByType image/webp "access plus 1 year"\n</IfModule>',
  codeLocation: { file: file.relPath, line: null },
})

const httpsFinding = (file: SourceFile): Finding => ({
  category: 'indexing',
  severity: 'medium',
  url: null,
  culpritSelector: null,
  title: 'HTTPS zorlaması .htaccess içinde tanımlı değil',
  explanation:
    `${file.relPath} içinde %{HTTPS} kontrolüyle bir yönlendirme kuralı bulunamadı. HTTPS zorlaması ` +
    `barındırma/DNS panelinde ayrı yapılandırılmış olabilir, ama kaynak kod bunu garanti etmiyor — ` +
    `taşınma/göç sırasında sessizce kaybolabilir.`,
  evidence: `${file.relPath}: RewriteCond %{HTTPS} bulunamadı`,
  impact: estimateImpact('medium'),
  effort: 'trivial',
  fixSnippet: 'RewriteCond %{HTTPS} off\nRewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]',
  codeLocation: { file: file.relPath, line: null },
})

/**
 * Her stack'te çalışır ama pratikte yalnız `.htaccess` içeren (Apache/PHP) projelerde
 * tetiklenir — Next.js/Vercel projelerinde bu dosya hiç bulunmaz, bulgu üretilmez.
 * Gerçek kanıt: mamcreatives.com'un 42 satırlık `.htaccess`'i yalnız RewriteRule içeriyor;
 * Cache-Control/ExpiresActive/`RewriteCond %{HTTPS}` hiçbiri yok (doğrulandı, 0 eşleşme).
 */
export const detectServerConfigIssues = (files: readonly SourceFile[]): readonly Finding[] => {
  const htaccessFiles = files.filter((file) => HTACCESS_BASENAME.test(file.relPath))
  return htaccessFiles.flatMap((file) => {
    const findings: Finding[] = []
    if (!CACHE_DIRECTIVE.test(file.content)) findings.push(cacheFinding(file))
    if (!HTTPS_ENFORCEMENT.test(file.content)) findings.push(httpsFinding(file))
    return findings
  })
}
