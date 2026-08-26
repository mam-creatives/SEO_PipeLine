/**
 * mamcreatives.com anasayfasından `lighthouse --only-categories=seo` ile ALINAN GERÇEK
 * ölçümün kırpılmış hali (Lighthouse 13, 2026-08-26). Uydurma değil.
 *
 * İki gerçek başarısızlık, iki farklı `evidence` yolunu doğrular:
 *  - `meta-description`: `explanation` alanı dolu ("Description text is empty.") — birincil yol.
 *  - `crawlable-anchors`: `explanation` yok, `details.items` içinde 2 node var — sayıya düşen yol.
 *
 * `structured-data` bilerek `score: null, scoreDisplayMode: 'manual'` — asla otomatik
 * puanlanmaz, bulgu üretmemesi gerekir.
 */
export const MAMCREATIVES_LIGHTHOUSE_SEO_RESULT = {
  requestedUrl: 'https://www.mamcreatives.com/',
  finalDisplayedUrl: 'https://www.mamcreatives.com/',
  categories: { seo: { score: 0.85 } },
  audits: {
    'is-crawlable': {
      id: 'is-crawlable',
      score: 1,
      scoreDisplayMode: 'binary',
      details: { type: 'table', headings: [], items: [] },
    },
    'document-title': {
      id: 'document-title',
      score: 1,
      scoreDisplayMode: 'binary',
      details: { type: 'table', headings: [], items: [] },
    },
    'meta-description': {
      id: 'meta-description',
      score: 0,
      scoreDisplayMode: 'binary',
      explanation: 'Description text is empty.',
    },
    'http-status-code': { id: 'http-status-code', score: 1, scoreDisplayMode: 'binary' },
    'link-text': {
      id: 'link-text',
      score: 1,
      scoreDisplayMode: 'binary',
      details: { type: 'table', headings: [], items: [] },
    },
    'crawlable-anchors': {
      id: 'crawlable-anchors',
      score: 0,
      scoreDisplayMode: 'binary',
      details: {
        type: 'table',
        headings: [{ key: 'node', valueType: 'node', label: 'Uncrawlable Link' }],
        items: [
          {
            node: {
              type: 'node',
              selector: 'nav > ul > li.has-dropdown > a',
              snippet: '<a href="javascript:void(0);">',
              nodeLabel: 'Kurumsal',
            },
          },
          {
            node: {
              type: 'node',
              selector: 'nav.tp-mobile-menu-active > ul > li.has-dropdown > a',
              snippet: '<a href="javascript:void(0);">',
              nodeLabel: 'Kurumsal',
            },
          },
        ],
      },
    },
    'robots-txt': {
      id: 'robots-txt',
      score: 1,
      scoreDisplayMode: 'binary',
      details: { type: 'table', headings: [], items: [] },
    },
    'image-alt': {
      id: 'image-alt',
      score: 1,
      scoreDisplayMode: 'binary',
      details: { type: 'table', headings: [], items: [] },
    },
    hreflang: {
      id: 'hreflang',
      score: 1,
      scoreDisplayMode: 'binary',
      details: { type: 'table', headings: [], items: [] },
    },
    canonical: { id: 'canonical', score: 1, scoreDisplayMode: 'binary' },
    'structured-data': { id: 'structured-data', score: null, scoreDisplayMode: 'manual' },
  },
}
