import robotsParserImport from 'robots-parser'
import type { RobotsRules } from '../types.js'

const CRAWLER_USER_AGENT = 'SEOPipelineBot'

interface Robot {
  isAllowed(url: string, ua?: string): boolean | undefined
  getSitemaps(): string[]
}

// robots-parser'ın kendi index.d.ts'i bozuk (`declare module` gövdesiz kapanıyor, sonraki
// export'lar ambient bloğun dışında kalıyor) — runtime'da doğru çalıştığı Node ile doğrulandı
// (`typeof default === 'function'`), yalnız TS'in tip çıkarımı yanlış. İzole tip düzeltmesi.
const robotsParser = robotsParserImport as unknown as (url: string, robotstxt: string) => Robot

/**
 * robots.txt metnini kurallara çevirir — saf fonksiyon. `isAllowed` tam URL bekler
 * (robots-parser'ın kendi sözleşmesi). Eşleşen kural yoksa robots-parser `undefined`
 * döner; bu "yasak yok" demektir, `!== false` ile true'ya çevrilir.
 */
export const parseRobotsTxt = (text: string, robotsUrl: string): RobotsRules => {
  const robot = robotsParser(robotsUrl, text)
  return {
    isAllowed: (url: string) => robot.isAllowed(url, CRAWLER_USER_AGENT) !== false,
    sitemaps: robot.getSitemaps(),
  }
}
