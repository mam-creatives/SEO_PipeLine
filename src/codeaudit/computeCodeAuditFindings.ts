import type { Finding } from '../core/findings.js'
import { detectHeavyAssets } from './rules/agnostic/heavyAssets.js'
import { detectPublicDeadHtml } from './rules/agnostic/publicDeadHtml.js'
import { detectServerConfigIssues } from './rules/agnostic/serverConfig.js'
import { detectThirdPartyScripts } from './rules/agnostic/thirdPartyScripts.js'
import { detectAssetIssues } from './rules/nextjs/assets.js'
import { detectMetadataIssues } from './rules/nextjs/metadata.js'
import { detectRenderStrategyIssues } from './rules/nextjs/renderStrategy.js'
import { detectHeadMetaIssues } from './rules/php/headMetaIssues.js'
import { detectMissingHreflang } from './rules/php/missingHreflang.js'
import { detectCommentedOutHeadings } from './rules/php/templateStructure.js'
import type { SourceFile, StackKind } from './types.js'

/**
 * Agnostik kurallar her stack'te çalışır; PHP/Next.js kuralları yalnız `detectStack`
 * ilgili imzayı bulduysa çalışır — yanlış stack'in kurallarını (ör. bir Next.js projesinde
 * .htaccess kontrolü) sessizce atlamak yerine hiç çağırmamak daha doğru.
 *
 * `runAnalysis.ts` (ana pipeline) ve `cli/codeaudit.ts` (bağımsız komut) ikisi de bunu
 * kullanır — aynı kural-çağırma mantığı iki yerde tekrarlanmasın diye burada, tek yerde.
 */
export const computeCodeAuditFindings = (sourceFiles: readonly SourceFile[], detectedStacks: readonly StackKind[]): readonly Finding[] => {
  if (sourceFiles.length === 0) return []

  const agnosticFindings = [
    ...detectHeavyAssets(sourceFiles),
    ...detectPublicDeadHtml(sourceFiles),
    ...detectThirdPartyScripts(sourceFiles),
    ...detectServerConfigIssues(sourceFiles),
  ]
  const phpFindings = detectedStacks.some((stack) => stack === 'php-custom' || stack === 'wordpress')
    ? [...detectHeadMetaIssues(sourceFiles), ...detectMissingHreflang(sourceFiles), ...detectCommentedOutHeadings(sourceFiles)]
    : []
  const nextjsFindings = detectedStacks.includes('nextjs')
    ? [...detectRenderStrategyIssues(sourceFiles), ...detectMetadataIssues(sourceFiles), ...detectAssetIssues(sourceFiles)]
    : []

  return [...agnosticFindings, ...phpFindings, ...nextjsFindings]
}
