/**
 * GoogleChrome/web-vitals attribution build'i için tarayıcı snippet'i üretir.
 *
 * Bu, kütüphaneyi FİİLEN kullanan katman: sayfaya gömülür, gerçek kullanıcılardan
 * metrik + attribution toplar ve kendi toplayıcı endpoint'ine gönderir.
 * Lab araçlarının ölçemediği INP yalnız buradan gelir.
 *
 * Üretilen kod bir şablondur — TypeScript ile tip denetimi yapılmaz, bu yüzden
 * sade ve bağımlılıksız tutulur.
 */

export interface SnippetOptions {
  /** Toplayıcının tam adresi, ör. https://ornekayakkabi.com.tr/api/rum */
  readonly endpoint: string
}

const SHARED_BODY = `
  // Sekme gizlendiğinde/kapanırken gönder: unload olayı güvenilir değildir.
  const queue = [];
  const flush = () => {
    if (queue.length === 0) return;
    const body = JSON.stringify(queue.splice(0, queue.length));
    // sendBeacon sayfa kapanırken bile teslim eder; yoksa keepalive fetch'e düş.
    if (!navigator.sendBeacon || !navigator.sendBeacon(ENDPOINT, body)) {
      fetch(ENDPOINT, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } })
        .catch(() => {});
    }
  };
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  addEventListener('pagehide', flush);

  const report = (metric) => {
    queue.push({
      url: location.origin + location.pathname,
      metric: metric.name,
      value: metric.value,
      rating: metric.rating,
      navigationType: metric.navigationType,
      attribution: metric.attribution ?? null,
    });
  };

  onLCP(report);
  onINP(report);
  onCLS(report);
  onTTFB(report);
`

/** npm ile kurulan projeler (Next.js, Vite vb.) için — önerilen yol. */
export const buildNpmSnippet = (options: SnippetOptions): string =>
  `// 1) Kurulum:  npm install web-vitals
// 2) Bu dosyayı uygulamanın istemci tarafında bir kez çalıştır
//    (Next.js App Router: app/web-vitals.tsx içinde 'use client' ile).
import { onCLS, onINP, onLCP, onTTFB } from 'web-vitals/attribution';

const ENDPOINT = ${JSON.stringify(options.endpoint)};
${SHARED_BODY}`

/** Derleme adımı olmayan siteler için — script etiketi olarak eklenir. */
export const buildCdnSnippet = (options: SnippetOptions): string =>
  `<script type="module">
import { onCLS, onINP, onLCP, onTTFB } from 'https://unpkg.com/web-vitals@5/dist/web-vitals.attribution.js?module';

const ENDPOINT = ${JSON.stringify(options.endpoint)};
${SHARED_BODY}
</script>`
