import { estimateImpact, type Finding } from '../../../core/findings.js'
import { lineNumberAt } from '../../lineNumberAt.js'
import type { SourceFile } from '../../types.js'

const RAW_IMG_TAG = /<img\b/i
const NEXT_IMAGE_IMPORT = /from\s+['"]next\/image['"]/
const NEXT_IMAGE_COMPONENT = /<Image\b/
const PRIORITY_PROP = /\bpriority\b/
const IS_PAGE_FILE = /(^|\/)page\.tsx?$/
const GOOGLE_FONTS_LINK = /fonts\.(googleapis|gstatic)\.com/i
const NEXT_FONT_IMPORT = /from\s+['"]next\/font/
const RAW_SCRIPT_TAG = /<script\b(?![^>]*type=["']application\/ld\+json["'])/i
const NEXT_SCRIPT_IMPORT = /from\s+['"]next\/script['"]/

const rawImgFinding = (file: SourceFile): Finding | null => {
  const match = RAW_IMG_TAG.exec(file.content)
  if (match === null) return null
  if (NEXT_IMAGE_IMPORT.test(file.content)) return null // hem <img> hem next/image varsa muhtemelen kasıtlı (ör. harici SVG ikon)
  return {
    category: 'cwv',
    severity: 'medium',
    url: null,
    culpritSelector: 'img',
    title: 'Ham <img> kullanılmış, next/image değil',
    explanation:
      `${file.relPath} içinde <img> etiketi var ama next/image import edilmemiş. next/image otomatik boyutlandırma, ` +
      `lazy-loading, modern format (webp/avif) dönüşümü ve LCP önceliklendirmesini bedavaya verir — bunları elle ` +
      `yeniden inşa etmek yerine framework'ün kendi çözümü kullanılmalı.`,
    evidence: `${file.relPath}: <img> var, next/image import'u yok`,
    impact: estimateImpact('medium'),
    effort: 'small',
    fixSnippet: "import Image from 'next/image'\n<Image src=\"...\" alt=\"...\" width={800} height={600} />",
    codeLocation: { file: file.relPath, line: lineNumberAt(file.content, match.index) },
  }
}

/** page.tsx'te next/image kullanılıyor ama hiçbirinde priority yoksa, muhtemel LCP adayı geç yükleniyor demektir. */
const missingPriorityFinding = (file: SourceFile): Finding | null => {
  if (!IS_PAGE_FILE.test(file.relPath)) return null
  if (!NEXT_IMAGE_COMPONENT.test(file.content)) return null
  if (PRIORITY_PROP.test(file.content)) return null
  return {
    category: 'cwv',
    severity: 'low',
    url: null,
    culpritSelector: 'Image',
    title: 'Sayfadaki next/image görsellerinin hiçbirinde priority yok',
    explanation:
      `${file.relPath} next/image kullanıyor ama hiçbir <Image> priority prop'u taşımıyor. Varsayılan olarak ` +
      `next/image lazy-load eder — sayfanın LCP adayı görseli (genelde ilk ekranda görünen en büyük görsel) ` +
      `priority olmadan gecikmeli yüklenir ve LCP'yi kötüleştirir.`,
    evidence: `${file.relPath}: <Image> var, priority hiçbirinde yok`,
    impact: estimateImpact('low'),
    effort: 'trivial',
    fixSnippet: '<Image src="..." alt="..." priority />',
    codeLocation: { file: file.relPath, line: null },
  }
}

/** Proje geneli — Google Fonts <link>/@import kullanan bir yer var ama next/font hiç import edilmemiş. */
const missingNextFontFinding = (files: readonly SourceFile[]): Finding | null => {
  const usesGoogleFontsLink = files.some((file) => GOOGLE_FONTS_LINK.test(file.content))
  if (!usesGoogleFontsLink) return null
  const usesNextFont = files.some((file) => NEXT_FONT_IMPORT.test(file.content))
  if (usesNextFont) return null
  const offendingFile = files.find((file) => GOOGLE_FONTS_LINK.test(file.content))
  return {
    category: 'cwv',
    severity: 'medium',
    url: null,
    culpritSelector: null,
    title: 'Google Fonts <link> ile yükleniyor, next/font kullanılmıyor',
    explanation:
      `${offendingFile?.relPath ?? '(bilinmiyor)'} fonts.googleapis.com/fonts.gstatic.com'a doğrudan <link> ile ` +
      `bağlanıyor. next/font build zamanında fontu indirip kendi sunucusundan servis eder — harici DNS/bağlantı ` +
      `turu ve layout shift riski ortadan kalkar (next/font otomatik self-host + font-display).`,
    evidence: `${offendingFile?.relPath ?? '(bilinmiyor)'}: harici Google Fonts <link>, next/font import'u yok`,
    impact: estimateImpact('medium'),
    effort: 'small',
    fixSnippet: "import { Inter } from 'next/font/google'\nconst inter = Inter({ subsets: ['latin'] })",
    codeLocation: offendingFile === undefined ? null : { file: offendingFile.relPath, line: null },
  }
}

const rawScriptFinding = (file: SourceFile): Finding | null => {
  const match = RAW_SCRIPT_TAG.exec(file.content)
  if (match === null) return null
  if (NEXT_SCRIPT_IMPORT.test(file.content)) return null
  return {
    category: 'onpage',
    severity: 'low',
    url: null,
    culpritSelector: 'script',
    title: 'Ham <script> kullanılmış, next/script değil',
    explanation:
      `${file.relPath} içinde ham <script> etiketi var, next/script import edilmemiş. next/script'in \`strategy\` ` +
      `prop'u (afterInteractive/lazyOnload/beforeInteractive) 3. parti scriptlerin ana thread'i ne zaman ` +
      `bloklayacağını açıkça kontrol etmeyi sağlar — ham <script> bu kontrolü framework'ten alır.`,
    evidence: `${file.relPath}: <script> var, next/script import'u yok`,
    impact: estimateImpact('low'),
    effort: 'small',
    fixSnippet: "import Script from 'next/script'\n<Script src=\"...\" strategy=\"afterInteractive\" />",
    codeLocation: { file: file.relPath, line: lineNumberAt(file.content, match.index) },
  }
}

/** Next.js'e özgü — yalnız `detectStack` sonucu `'nextjs'` içerdiğinde çağrılır (3.7 orkestratörü). */
export const detectAssetIssues = (files: readonly SourceFile[]): readonly Finding[] => [
  ...files.flatMap((file) => {
    const results = [rawImgFinding(file), missingPriorityFinding(file), rawScriptFinding(file)]
    return results.filter((f): f is Finding => f !== null)
  }),
  missingNextFontFinding(files),
].filter((f): f is Finding => f !== null)
