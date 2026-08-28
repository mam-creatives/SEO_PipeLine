import { detectStack } from './detectStack.js'
import { readSourceTree } from './readSourceTree.js'
import type { SourceFile, StackKind } from './types.js'

export interface SourceCodeData {
  readonly sourceFiles: readonly SourceFile[]
  readonly detectedStacks: readonly StackKind[]
  readonly truncated: boolean
}

const EMPTY: SourceCodeData = { sourceFiles: [], detectedStacks: [], truncated: false }

/**
 * `config.codePath` yapılandırılmamışsa boş sonuç döner — kod denetimi bu run'da atlanır,
 * sessizce (diğer opsiyonel dallar gibi). Ağ I/O'su yok, senkron yerel dosya okuması;
 * `collectors.ts`'teki diğer (async, network) collector'larla aynı katmanda ama
 * `Promise.all`'a girmesi gerekmez.
 */
export const collectSourceCode = (codePath: string | undefined): SourceCodeData => {
  if (codePath === undefined) return EMPTY
  const { files, truncated } = readSourceTree(codePath)
  return { sourceFiles: files, detectedStacks: detectStack(files.map((file) => file.relPath)), truncated }
}
