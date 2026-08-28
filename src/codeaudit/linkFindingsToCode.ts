import type { Finding } from '../core/findings.js'
import { lineNumberAt } from './lineNumberAt.js'
import type { SourceFile } from './types.js'

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Bileşik bir CSS seçicisinin ("section.hero > img.banner" gibi) SON basit parçasından
 * aranabilir bir sınıf/id token'ı çıkarır. Salt etiket adı (ör. "img", "h1") görürse null
 * döner — bu kadar genel bir token kaynak kodda anlamsız/aşırı sayıda eşleşme üretir,
 * yanlış konuma işaret etmek "isabetsizse uydurma" ilkesini ihlal eder.
 */
const extractSearchToken = (selector: string): string | null => {
  const lastPart = selector
    .trim()
    .split(/[\s>]+/)
    .filter((part) => part.length > 0)
    .pop()
  if (lastPart === undefined) return null
  const classMatch = /\.([a-zA-Z0-9_-]+)/.exec(lastPart)
  if (classMatch?.[1] !== undefined) return classMatch[1]
  const idMatch = /#([a-zA-Z0-9_-]+)/.exec(lastPart)
  if (idMatch?.[1] !== undefined) return idMatch[1]
  return null
}

interface SourceMatch {
  readonly file: SourceFile
  readonly index: number
}

const findInSource = (token: string, files: readonly SourceFile[]): SourceMatch | null => {
  const pattern = new RegExp(`(?:class(?:Name)?|id)=["'][^"']*\\b${escapeRegExp(token)}\\b[^"']*["']`)
  for (const file of files) {
    const match = pattern.exec(file.content)
    if (match !== null) return { file, index: match.index }
  }
  return null
}

/**
 * `Finding.culpritSelector`'ı (tipik olarak CWV bulgularının Lighthouse/CrUX'tan gelen
 * seçicisi, ör. `.hero-title`) kaynak kodda arar ve bulursa `codeLocation` doldurur.
 *
 * Zaten `codeLocation` taşıyan bulgulara DOKUNMAZ — code-audit kuralları (Faz 3.2-3.4) kendi
 * konumunu zaten kendi üretiminde biliyor, burada yeniden aranmaz. İsabetsizse ya da
 * `culpritSelector` aranabilir bir sınıf/id'ye indirgenemiyorsa `codeLocation: null` —
 * `diagnoseCwv`'nin "isabetsizse null döner, uydurmaz" felsefesiyle aynı. Yeni `Finding`
 * kopyaları döner, girdiyi mutate etmez.
 */
export const linkFindingsToCode = (findings: readonly Finding[], files: readonly SourceFile[]): readonly Finding[] =>
  findings.map((finding) => {
    if (finding.codeLocation !== undefined) return finding
    if (finding.culpritSelector === null) return { ...finding, codeLocation: null }

    const token = extractSearchToken(finding.culpritSelector)
    if (token === null) return { ...finding, codeLocation: null }

    const match = findInSource(token, files)
    if (match === null) return { ...finding, codeLocation: null }

    return { ...finding, codeLocation: { file: match.file.relPath, line: lineNumberAt(match.file.content, match.index) } }
  })
