import { readdirSync, readFileSync, statSync, type Dirent } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { CODE_AUDIT_IGNORED_DIRS, CODE_AUDIT_TEXT_BASENAMES, CODE_AUDIT_TEXT_EXTENSIONS, MAX_SOURCE_FILE_BYTES, MAX_SOURCE_FILES } from '../config/constants.js'
import { redactSecrets } from './redactSecrets.js'
import type { SourceFile } from './types.js'

export interface ReadSourceTreeResult {
  readonly files: readonly SourceFile[]
  /** MAX_SOURCE_FILE_BYTES'ı aşan, içeriği hiç okunmayan dosya sayısı. */
  readonly oversizedSkipped: number
  /** MAX_SOURCE_FILES sınırına ulaşıldı — ağaçta okunmamış başka dosyalar kalmış olabilir. */
  readonly truncated: boolean
}

export interface ReadSourceTreeLimits {
  readonly maxFiles: number
  readonly maxFileBytes: number
}

const DEFAULT_LIMITS: ReadSourceTreeLimits = { maxFiles: MAX_SOURCE_FILES, maxFileBytes: MAX_SOURCE_FILE_BYTES }

const isReadableFile = (basename: string, ext: string): boolean =>
  CODE_AUDIT_TEXT_EXTENSIONS.includes(ext) || CODE_AUDIT_TEXT_BASENAMES.includes(basename)

/**
 * `rootPath` altını yinelemeli tarar; `CODE_AUDIT_IGNORED_DIRS`'i ve allowlist dışı uzantıları
 * atlar. `limits.maxFiles`'a ulaşınca durur (`truncated: true`), `limits.maxFileBytes`'ı aşan
 * tek dosyaları içerik okumadan atlar (`oversizedSkipped`). Her okunan dosyanın içeriği
 * `redactSecrets` ile temizlenmiş olarak döner — çağıran hiçbir zaman ham içeriğe erişemez.
 *
 * `limits` varsayılanı `constants.ts`'teki üretim sınırlarıdır; parametre olarak açık tutulması
 * yalnız testte 2000+ dosyalık bir fixture oluşturmadan kırpma/atlama dallarını tetikleyebilmek
 * içindir (üretim çağrıları hep varsayılanı kullanır).
 */
export const readSourceTree = (rootPath: string, limits: ReadSourceTreeLimits = DEFAULT_LIMITS): ReadSourceTreeResult => {
  const files: SourceFile[] = []
  let oversizedSkipped = 0
  let truncated = false

  const walk = (dirPath: string): void => {
    if (truncated) return
    let entries: Dirent[]
    try {
      entries = readdirSync(dirPath, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (truncated) return
      if (entry.isDirectory()) {
        if (CODE_AUDIT_IGNORED_DIRS.includes(entry.name)) continue
        walk(join(dirPath, entry.name))
        continue
      }
      if (!entry.isFile()) continue

      const ext = extname(entry.name).toLowerCase()
      if (!isReadableFile(entry.name, ext)) continue

      const fullPath = join(dirPath, entry.name)
      const size = statSync(fullPath).size
      if (size > limits.maxFileBytes) {
        oversizedSkipped += 1
        continue
      }

      if (files.length >= limits.maxFiles) {
        truncated = true
        return
      }

      const raw = readFileSync(fullPath, 'utf-8')
      const content = redactSecrets(raw)
      files.push({
        relPath: relative(rootPath, fullPath),
        ext,
        lineCount: content.split('\n').length,
        content,
      })
    }
  }

  walk(rootPath)
  return { files, oversizedSkipped, truncated }
}
