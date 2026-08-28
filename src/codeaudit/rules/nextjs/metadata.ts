import { estimateImpact, type Finding } from '../../../core/findings.js'
import type { SourceFile } from '../../types.js'

const IS_PAGE_FILE = /(^|\/)page\.tsx?$/
const HAS_METADATA_EXPORT = /export\s+const\s+metadata\s*[:=]/
const HAS_GENERATE_METADATA = /export\s+(?:async\s+)?function\s+generateMetadata/
const HAS_ALTERNATES_CANONICAL = /alternates\s*:\s*\{[^}]*canonical/s
const IS_APP_DIR_FILE = /(^|\/)app\//
const IS_ROBOTS_OR_SITEMAP_FILE = /(^|\/)app\/(robots|sitemap)\.tsx?$/

const missingMetadataFinding = (file: SourceFile): Finding | null => {
  if (!IS_PAGE_FILE.test(file.relPath)) return null
  if (HAS_METADATA_EXPORT.test(file.content) || HAS_GENERATE_METADATA.test(file.content)) return null
  return {
    category: 'onpage',
    severity: 'high',
    url: null,
    culpritSelector: null,
    title: 'Sayfa ne metadata ne de generateMetadata export ediyor',
    explanation:
      `${file.relPath} title/description gibi temel meta verileri ne statik \`metadata\` export'uyla ne de ` +
      `dinamik \`generateMetadata\` fonksiyonuyla tanımlıyor — sayfa üst layout'un genel başlığını/açıklamasını ` +
      `miras alır, bu genelde sayfaya özgü olmayan, SERP'te ayırt edici olmayan bir sonuç üretir.`,
    evidence: `${file.relPath}: metadata/generateMetadata bulunamadı`,
    impact: estimateImpact('high'),
    effort: 'small',
    fixSnippet: "export const metadata: Metadata = {\n  title: '...',\n  description: '...',\n}",
    codeLocation: { file: file.relPath, line: null },
  }
}

/**
 * Proje geneli, sayfa başına DEĞİL — hiçbir sayfada `alternates.canonical` yoksa tek bulgu
 * üretir. Sayfa başına kontrol (Faz 3.3'teki headMetaIssues gürültü dersiyle aynı) her
 * `page.tsx`'i tek tek işaretleyip raporu boğardı; burada asıl soru "proje HİÇ bu deseni
 * kullanıyor mu" — kullanmıyorsa bir kez söylemek yeterli.
 */
const missingCanonicalConventionFinding = (pageFiles: readonly SourceFile[]): Finding | null => {
  if (pageFiles.length === 0) return null
  const anyHasCanonical = pageFiles.some((file) => HAS_ALTERNATES_CANONICAL.test(file.content))
  if (anyHasCanonical) return null
  return {
    category: 'indexing',
    severity: 'low',
    url: null,
    culpritSelector: null,
    title: 'Hiçbir sayfa alternates.canonical tanımlamıyor',
    explanation:
      `${pageFiles.length} sayfa taranan hiçbirinde \`metadata.alternates.canonical\` yok. Next.js \`metadataBase\` ` +
      `yapılandırılmışsa örtük bir canonical üretir, ama query-parametreli/çoklu-path erişilebilen sayfalarda ` +
      `açık canonical olmadan yinelenen içerik URL'leri Google'a eşit görünebilir.`,
    evidence: `${pageFiles.length} sayfa tarandı, hiçbirinde alternates.canonical yok`,
    impact: estimateImpact('low'),
    effort: 'medium',
    fixSnippet: "alternates: { canonical: '/urun/ornek' }",
    codeLocation: null,
  }
}

const missingRobotsSitemapFinding = (files: readonly SourceFile[]): Finding | null => {
  const hasAppDir = files.some((file) => IS_APP_DIR_FILE.test(file.relPath))
  if (!hasAppDir) return null
  const hasConventionFile = files.some((file) => IS_ROBOTS_OR_SITEMAP_FILE.test(file.relPath))
  if (hasConventionFile) return null
  return {
    category: 'indexing',
    severity: 'medium',
    url: null,
    culpritSelector: null,
    title: 'app/robots.ts ve app/sitemap.ts dosya konvansiyonu hiç kullanılmamış',
    explanation:
      `Next.js'in yerleşik \`app/robots.ts\`/\`app/sitemap.ts\` dosya konvansiyonu bulunamadı. Bunlar elle yazılmış ` +
      `statik \`robots.txt\`/\`sitemap.xml\`'e göre daha az hataya açık (route değişince otomatik güncellenir) — ` +
      `hiçbiri yoksa muhtemelen elle bakım gerektiren bir statik dosya kullanılıyor ya da hiç yok.`,
    evidence: 'app/robots.ts ve app/sitemap.ts bulunamadı',
    impact: estimateImpact('medium'),
    effort: 'small',
    fixSnippet: "export default function robots(): MetadataRoute.Robots {\n  return { rules: { userAgent: '*', allow: '/' }, sitemap: 'https://ornek.com/sitemap.xml' }\n}",
    codeLocation: null,
  }
}

/** Next.js'e özgü — yalnız `detectStack` sonucu `'nextjs'` içerdiğinde çağrılır (3.7 orkestratörü). */
export const detectMetadataIssues = (files: readonly SourceFile[]): readonly Finding[] => {
  const pageFiles = files.filter((file) => IS_PAGE_FILE.test(file.relPath))
  return [
    ...pageFiles.flatMap((file) => {
      const f = missingMetadataFinding(file)
      return f === null ? [] : [f]
    }),
    missingCanonicalConventionFinding(pageFiles),
    missingRobotsSitemapFinding(files),
  ].filter((f): f is Finding => f !== null)
}
