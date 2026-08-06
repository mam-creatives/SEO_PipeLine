/**
 * aizho.me üzerinden Lighthouse 13.4.1 ile ALINAN GERÇEK ölçümün kırpılmış hali.
 * Uydurma değil: adaptörün gerçek dünyadaki şemaya karşı doğrulanması için saklanıyor.
 *
 * Dikkat çeken iki nokta:
 *  - LCP bir METİN (span) — bu yüzden kaynak fazları (resourceLoadDelay/Duration) hiç yok.
 *  - Fazların toplamı (2407ms) rapor edilen LCP'ye (5966ms) eşit değil; adaptör ve
 *    teşhis motoru payları fazların toplamına göre hesapladığı için bu tutarsızlık sorun çıkarmaz.
 */
export const AIZHO_LIGHTHOUSE_RESULT = {
  lighthouseVersion: '13.4.1',
  requestedUrl: 'https://aizho.me/',
  finalDisplayedUrl: 'https://aizho.me/vibes',
  categories: { performance: { score: 0.7 } },
  audits: {
    'largest-contentful-paint': {
      id: 'largest-contentful-paint',
      score: 0.13,
      numericValue: 5966.246,
      displayValue: '6.0 s',
    },
    'cumulative-layout-shift': { id: 'cumulative-layout-shift', score: 1, numericValue: 0 },
    'total-blocking-time': { id: 'total-blocking-time', score: 0.99, numericValue: 68 },
    'server-response-time': { id: 'server-response-time', score: 1, numericValue: 126 },
    'lcp-breakdown-insight': {
      id: 'lcp-breakdown-insight',
      score: 1,
      details: {
        type: 'list',
        items: [
          {
            type: 'table',
            headings: [
              { key: 'label', valueType: 'text', label: 'Subpart' },
              { key: 'duration', valueType: 'ms', label: 'Duration' },
            ],
            items: [
              { subpart: 'timeToFirstByte', label: 'Time to first byte', duration: 334.931 },
              { subpart: 'elementRenderDelay', label: 'Element render delay', duration: 2072.65 },
            ],
          },
          {
            type: 'node',
            lhId: 'page-0-SPAN',
            path: '1,HTML,1,BODY,2,DIV,0,DIV,0,DIV,0,SPAN,0,SPAN',
            selector: 'div.flex > div.flex > span.flex > span.px-5',
            snippet: '<span class="px-5 text-lg">',
            nodeLabel: 'KAHVEDEN KOKTEYLE',
          },
        ],
      },
    },
    'image-delivery-insight': {
      id: 'image-delivery-insight',
      score: 0.5,
      displayValue: 'Est savings of 1,790 KiB',
      details: {
        type: 'table',
        items: [
          {
            node: {
              type: 'node',
              lhId: 'page-1-IMG',
              selector: 'div.mx-auto > div.grid > figure.relative > img.aspect-square',
              snippet:
                '<img src="/vibes/api/media/681f31a1-2309-443e-98f4-bc7b62fc34e6.jpg" alt="" loading="lazy" decoding="async" class="aspect-square w-full border border-ink/15 object-cover">',
              nodeLabel: 'div.mx-auto > div.grid > figure.relative > img.aspect-square',
            },
            url: 'https://aizho.me/vibes/api/media/681f31a1-2309-443e-98f4-bc7b62fc34e6.jpg',
            totalBytes: 1839953,
            wastedBytes: 1832926,
            subItems: {
              type: 'subitems',
              items: [
                {
                  reason:
                    "Using a modern image format (WebP, AVIF) or increasing the image compression could improve this image's download size.",
                  wastedBytes: 1597744,
                },
                {
                  reason:
                    'This image file is larger than it needs to be (1206x1205) for its displayed dimensions (154x274). Use responsive images to reduce the image download size.',
                  wastedBytes: 1786575,
                },
              ],
            },
          },
        ],
      },
    },
    'render-blocking-insight': {
      id: 'render-blocking-insight',
      score: 0.5,
      details: {
        type: 'table',
        items: [{ url: 'https://aizho.me/vibes/_next/static/chunks/0e-sda9jn9twa.css', totalBytes: 10310 }],
      },
    },
    'document-latency-insight': {
      id: 'document-latency-insight',
      score: 0,
      displayValue: 'Est savings of 210 ms',
      details: {
        type: 'checklist',
        items: {
          noRedirects: { label: 'Had redirects (1 redirects, +208 ms)', value: false },
          serverResponseIsFast: { label: 'Server responds quickly (observed 126 ms)', value: true },
          usesCompression: { label: 'Applies text compression', value: true },
        },
      },
    },
    'layout-shifts': { id: 'layout-shifts', score: 1, details: { type: 'table', items: [] } },
  },
} as const
