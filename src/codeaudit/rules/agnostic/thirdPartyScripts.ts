import { estimateImpact, type Finding } from '../../../core/findings.js'
import type { SourceFile } from '../../types.js'

/** Mutlak URL'e işaret eden <script src="..."> — göreli path (/js/main.js) aynı-origin sayılır, dahil edilmez. */
const EXTERNAL_SCRIPT_TAG = /<script\b[^>]*\bsrc=["'](https?:\/\/[^"']+)["'][^>]*>/gi
const HAS_ASYNC_OR_DEFER = /\b(?:async|defer)\b/i

const extractHost = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

interface ExternalScript {
  readonly host: string
  readonly blocking: boolean
}

const findExternalScripts = (content: string): readonly ExternalScript[] => {
  const scripts: ExternalScript[] = []
  for (const match of content.matchAll(EXTERNAL_SCRIPT_TAG)) {
    const tag = match[0]
    const src = match[1]
    if (src === undefined) continue
    scripts.push({ host: extractHost(src), blocking: !HAS_ASYNC_OR_DEFER.test(tag) })
  }
  return scripts
}

const thirdPartyFinding = (file: SourceFile, scripts: readonly ExternalScript[]): Finding => {
  const blockingCount = scripts.filter((s) => s.blocking).length
  const hosts = [...new Set(scripts.map((s) => s.host))]
  return {
    category: 'onpage',
    severity: blockingCount > 0 ? 'high' : 'medium',
    url: null,
    culpritSelector: 'script',
    title: `${scripts.length} üçüncü parti script referansı${blockingCount > 0 ? `, ${blockingCount} tanesi render'ı blokluyor` : ''}`,
    explanation:
      `${file.relPath} içinde ${hosts.join(', ')} adreslerine ${scripts.length} <script> etiketi bulundu. ` +
      (blockingCount > 0
        ? `${blockingCount} tanesinde async/defer yok — bu scriptler HTML ayrıştırmasını durdurup INP/TBT'ye doğrudan zarar verir.`
        : `Hepsinde async/defer var, ama üçüncü parti sayısı arttıkça ana thread rekabeti büyür.`),
    evidence: hosts.join(', '),
    impact: estimateImpact(blockingCount > 0 ? 'high' : 'medium'),
    effort: 'small',
    fixSnippet: blockingCount > 0 ? '<script src="..." async></script>' : null,
    codeLocation: { file: file.relPath, line: null },
  }
}

/**
 * Her stack'te çalışır — HTML/PHP/JSX kaynağında mutlak URL'li <script src> etiketlerini
 * (gtag, pixel, chat widget vb.) sayar. Gerçek kanıt: index.php'de
 * `<script async src="https://www.googletagmanager.com/gtag/js...">`.
 */
export const detectThirdPartyScripts = (files: readonly SourceFile[]): readonly Finding[] =>
  files.flatMap((file) => {
    const scripts = findExternalScripts(file.content)
    return scripts.length === 0 ? [] : [thirdPartyFinding(file, scripts)]
  })
