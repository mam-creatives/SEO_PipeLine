import { SCHEMA_REQUIRED_FIELDS } from '../../config/constants.js'
import { estimateImpact, type Finding } from '../../core/findings.js'
import type { CrawledPage } from '../../core/types.js'

const isEvaluable = (page: CrawledPage): boolean => page.statusCode !== null && page.statusCode >= 200 && page.statusCode < 300

/** Tanınmayan `@type` (SCHEMA_REQUIRED_FIELDS'te yok) sessizce atlanır — gürültü üretmemek için, tam tip hiyerarşisi bilinmiyor. */
const missingFieldFindings = (pages: readonly CrawledPage[]): readonly Finding[] =>
  pages.flatMap((page) =>
    page.schemaFields.flatMap((block): readonly Finding[] => {
      const required = SCHEMA_REQUIRED_FIELDS[block.type]
      if (required === undefined) return []
      const missing = required.filter((field) => !block.keys.includes(field))
      if (missing.length === 0) return []
      return [
        {
          category: 'onpage',
          severity: 'medium',
          url: page.url,
          culpritSelector: 'script[type="application/ld+json"]',
          title: `"${block.type}" şemasında zorunlu alan eksik: ${missing.join(', ')}`,
          explanation:
            `Sayfada "${block.type}" tipinde yapılandırılmış veri var ama Google'ın zengin sonuç için beklediği ` +
            `${missing.join(', ')} alan(lar)ı eksik. Zorunlu alan eksikse Google genelde zengin sonucu hiç ` +
            'göstermez — şema teknik olarak var ama fiilen etkisiz.',
          evidence: `${block.type}: mevcut [${block.keys.join(', ') || '(hiç alan yok)'}], eksik [${missing.join(', ')}]`,
          impact: estimateImpact('medium'),
          effort: 'small',
          fixSnippet: null,
        },
      ]
    }),
  )

/**
 * Faz 5.3 — `schemaTypes` toplanıp saklanıyordu ama hiçbir kuralda kullanılmıyordu (dış inceleme
 * bulgusu #3, ölü veri). `detectOnPageIssues.ts`'teki mevcut kural yalnız "şema var mı yok mu"
 * bakıyor; bu tamamlayıcı — VARSA, Google'ın zengin sonuç için gerektirdiği asgari alanları
 * taşıyor mu. CSR şüphesi olan sayfalarda bastırılır — JSON-LD istemci tarafında enjekte
 * edilmiş olabilir, `likelyClientRendered.ts`'in genel felsefesiyle tutarlı.
 */
export const detectSchemaIssues = (pages: readonly CrawledPage[]): readonly Finding[] =>
  missingFieldFindings(pages.filter(isEvaluable).filter((page) => !page.likelyClientRendered))
