import { estimateImpact, type Finding } from '../../../core/findings.js'
import { lineNumberAt } from '../../lineNumberAt.js'
import type { SourceFile } from '../../types.js'

const USE_CLIENT_DIRECTIVE = /^\s*['"]use client['"]/m
const IS_LAYOUT_FILE = /(^|\/)layout\.tsx?$/
const DYNAMIC_SSR_FALSE = /\bdynamic\s*\([\s\S]*?ssr\s*:\s*false/
const FORCE_DYNAMIC = /export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/
const IS_PAGE_FILE = /(^|\/)page\.tsx?$/
const HAS_DYNAMIC_SEGMENT = /\[[^/\]]+\]/
const HAS_GENERATE_STATIC_PARAMS = /export\s+(?:async\s+)?function\s+generateStaticParams/

const finding = (file: SourceFile, index: number, spec: Omit<Finding, 'url' | 'codeLocation'>): Finding => ({
  ...spec,
  url: null,
  codeLocation: { file: file.relPath, line: lineNumberAt(file.content, index) },
})

/** layout.tsx tüm alt ağacı client component'e çevirir — bir sayfanın DEĞİL, TÜM route grubunun sunucu render'ını kapatır. */
const useClientInLayoutFinding = (file: SourceFile): Finding | null => {
  if (!IS_LAYOUT_FILE.test(file.relPath)) return null
  const match = USE_CLIENT_DIRECTIVE.exec(file.content)
  if (match === null) return null
  return finding(file, match.index, {
    category: 'onpage',
    severity: 'high',
    culpritSelector: null,
    title: "'use client' bir layout.tsx'te — altındaki TÜM sayfalar client-render oluyor",
    explanation:
      `${file.relPath} 'use client' direktifi taşıyor. Bir layout client component olduğunda, App Router altındaki ` +
      `tüm sayfalar da client boundary'ye girer — sunucu tarafında render edilen indekslenebilir içerik miktarı ` +
      `daralır. Client state gerekiyorsa yalnız ihtiyaç duyan yaprak component'e taşınmalı.`,
    evidence: `${file.relPath}: 'use client' route grubunun kökünde`,
    impact: estimateImpact('high'),
    effort: 'medium',
    fixSnippet: null,
  })
}

const dynamicSsrFalseFinding = (file: SourceFile): Finding | null => {
  const match = DYNAMIC_SSR_FALSE.exec(file.content)
  if (match === null) return null
  return finding(file, match.index, {
    category: 'onpage',
    severity: 'low',
    culpritSelector: null,
    title: 'dynamic(..., { ssr: false }) kullanımı — bu bileşen sunucuda hiç render edilmiyor',
    explanation:
      `${file.relPath} içinde ssr:false ile içe aktarılan bir bileşen bulundu. Sunucu HTML'inde bu bileşenin ` +
      `içeriği hiç yok — ana içerikse indekslenmez. Bir provider/widget sarmalıyorsa muhtemelen kasıtlı ve zararsız; ` +
      `görünür sayfa içeriğiyse SEO kaybı demektir.`,
    evidence: `${file.relPath}: ssr: false`,
    impact: estimateImpact('low'),
    effort: 'medium',
    fixSnippet: null,
  })
}

const forceDynamicFinding = (file: SourceFile): Finding | null => {
  const match = FORCE_DYNAMIC.exec(file.content)
  if (match === null) return null
  return finding(file, match.index, {
    category: 'cwv',
    severity: 'medium',
    culpritSelector: null,
    title: "export const dynamic = 'force-dynamic' statik optimizasyonu tamamen kapatıyor",
    explanation:
      `${file.relPath} her istekte sunucuda yeniden render edilmeye zorlanıyor — ISR/statik önbellek devre dışı. ` +
      `Sayfa gerçekten her istekte değişen veri taşımıyorsa bu, gereksiz yere TTFB'yi büyütür.`,
    evidence: `${file.relPath}: dynamic = 'force-dynamic'`,
    impact: estimateImpact('medium'),
    effort: 'small',
    fixSnippet: null,
  })
}

/** app/urun/[slug]/page.tsx gibi dinamik route segmentleri generateStaticParams olmadan her istekte sıfırdan render edilir. */
const missingGenerateStaticParamsFinding = (file: SourceFile): Finding | null => {
  if (!IS_PAGE_FILE.test(file.relPath)) return null
  if (!HAS_DYNAMIC_SEGMENT.test(file.relPath)) return null
  if (HAS_GENERATE_STATIC_PARAMS.test(file.content)) return null
  return finding(file, 0, {
    category: 'cwv',
    severity: 'low',
    culpritSelector: null,
    title: 'Dinamik route generateStaticParams tanımlamıyor',
    explanation:
      `${file.relPath} bir dinamik segment ([param]) içeriyor ama generateStaticParams export etmiyor — ` +
      `build zamanında hiçbir varyant önceden üretilmiyor, her ziyaret sıfırdan sunucu render'ı gerektiriyor. ` +
      `Sayfa sayısı sınırlıysa (ör. ürün/hizmet listesi) bu değer önceden hesaplanabilir.`,
    evidence: `${file.relPath}: dinamik segment var, generateStaticParams yok`,
    impact: estimateImpact('low'),
    effort: 'medium',
    fixSnippet: 'export async function generateStaticParams() {\n  return items.map((item) => ({ slug: item.slug }))\n}',
  })
}

/**
 * Next.js'e özgü — yalnız `detectStack` sonucu `'nextjs'` içerdiğinde çağrılır (3.7 orkestratörü).
 * `ts-morph`/gerçek tip çözümü kullanmaz (bkz. plan'ın "neden ts-morph yok" notu) — dosya
 * konvansiyonu + satır-çapalı regex yeterli, tek bir kural için ağır bağımlılık haklı değil.
 */
export const detectRenderStrategyIssues = (files: readonly SourceFile[]): readonly Finding[] =>
  files.flatMap((file) =>
    [
      useClientInLayoutFinding(file),
      dynamicSsrFalseFinding(file),
      forceDynamicFinding(file),
      missingGenerateStaticParamsFinding(file),
    ].filter((f): f is Finding => f !== null),
  )
