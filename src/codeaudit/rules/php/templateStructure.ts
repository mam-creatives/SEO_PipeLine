import { estimateImpact, type Finding } from '../../../core/findings.js'
import { lineNumberAt } from '../../lineNumberAt.js'
import type { SourceFile } from '../../types.js'

const H1_TAG = /<h1[\s>]/i
const HTML_COMMENT = /<!--[\s\S]*?-->/g

const stripHtmlComments = (content: string): string => content.replace(HTML_COMMENT, (match) => ' '.repeat(match.length))

/**
 * Her stack'te çalışır — bir dosyanın kaynak kodunda `<h1` görünüyor ama HTML yorumu
 * (`<!-- ... -->`) dışında hiç `<h1` kalmıyorsa, o başlık ölü koddur: şablon "H1 üretiyormuş
 * gibi görünür" ama render edilen sayfada asla çıkmaz.
 *
 * Bu, Faz 2 crawler'ının "sayfada hiç <h1> yok" bulgusunun KÖK NEDENİ olabilir — bulgunun
 * kendisini değil, NEDEN olduğunu açıklar. Gerçek kanıt: mamcreatives.com'un
 * `inc/hizmet.php:30-58` satırları arasındaki tüm hero bloğu (h1 dahil, satır 45) bir HTML
 * yorumu içinde — canlıda `/hizmet/*` sayfalarının hiçbirinde <h1> olmamasıyla birebir örtüşüyor.
 * `stripHtmlComments` eşleşen aralığı boşlukla doldurur (silmez) ki satır numaraları kaymasın.
 */
export const detectCommentedOutHeadings = (files: readonly SourceFile[]): readonly Finding[] =>
  files.flatMap((file) => {
    const rawMatch = H1_TAG.exec(file.content)
    if (rawMatch === null) return []

    const withoutComments = stripHtmlComments(file.content)
    if (H1_TAG.test(withoutComments)) return [] // en az bir CANLI h1 var, sorun yok

    const finding: Finding = {
      category: 'onpage',
      severity: 'high',
      url: null,
      culpritSelector: 'h1',
      title: '<h1> yalnız bir HTML yorumu içinde bulundu — hiç render edilmiyor',
      explanation:
        `${file.relPath} içinde <h1> etiketi bulundu, ama bu şablondaki TÜM <h1> geçişleri ` +
        `<!-- ... --> yorum bloğu içinde. Muhtemelen eski bir tasarım kaldırılırken yorum satırına ` +
        `alınmış ve yenisi eklenmemiş — sayfa fiilen hiç H1 üretmiyor.`,
      evidence: `${file.relPath}:${lineNumberAt(file.content, rawMatch.index)} — <h1> yorum bloğu içinde`,
      impact: estimateImpact('high'),
      effort: 'small',
      fixSnippet: null,
      codeLocation: { file: file.relPath, line: lineNumberAt(file.content, rawMatch.index) },
    }
    return [finding]
  })
