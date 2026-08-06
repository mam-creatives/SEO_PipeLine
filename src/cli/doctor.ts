import { loadEnv } from '../config/env.js'
import { loadProjectConfig } from '../config/loadConfig.js'
import { createLogger } from '../core/logger.js'
import { selectProviders } from '../providers/registry.js'
import type { ProviderCategory, ProviderSet } from '../providers/types.js'

const logger = createLogger('doctor')

const CATEGORY_LABELS: Readonly<Record<ProviderCategory, string>> = {
  keyword: 'Keyword hacmi',
  serp: 'SERP sıralaması',
  backlink: 'Backlink profili',
  tech: 'Teknik denetim (CWV)',
  aiVisibility: 'AI görünürlük (GEO)',
  searchConsole: 'Search Console',
}

const printSelection = (providers: ProviderSet): void => {
  console.log('\nSAĞLAYICI SEÇİMİ')
  console.log('─'.repeat(64))
  for (const category of Object.keys(CATEGORY_LABELS) as ProviderCategory[]) {
    const provider = providers[category]
    const badge = provider.isMock ? '○ MOCK' : '● GERÇEK'
    console.log(`  ${badge.padEnd(9)} ${CATEGORY_LABELS[category].padEnd(24)} ${provider.name}`)
  }
}

const checkGemini = async (providers: ProviderSet): Promise<void> => {
  if (providers.aiVisibility.isMock) {
    console.log('  ⊘ AI görünürlük mock — GEMINI_API_KEY yok, canlı deneme atlandı.')
    return
  }
  const result = await providers.aiVisibility.askQuery('Tek kelimeyle cevap ver: merhaba', 0)
  if (result.ok) {
    console.log(`  ✓ Gemini çalışıyor (${result.value.model}) — örnek cevap: "${result.value.text.slice(0, 60)}"`)
  } else {
    console.log(`  ✗ Gemini başarısız: ${result.error.message}`)
  }
}

const checkSearchConsole = async (providers: ProviderSet, domain: string): Promise<void> => {
  if (providers.searchConsole.isMock) {
    console.log('  ⊘ Search Console mock — GSC anahtarları yok, canlı deneme atlandı.')
    return
  }
  const result = await providers.searchConsole.fetchPerformance(domain)
  if (result.ok) {
    console.log(`  ✓ Search Console çalışıyor — ${result.value.length} sorgu satırı döndü.`)
    for (const row of result.value.slice(0, 3)) {
      console.log(`      "${row.query}" · ${row.clicks} tıklama · ${row.impressions} gösterim`)
    }
  } else {
    console.log(`  ✗ Search Console başarısız: ${result.error.message}`)
  }
}

/**
 * Lighthouse ücretsizdir ama yavaştır; yalnız İLK URL denenir. Bu kontrol aynı
 * zamanda Chrome kurulumunun ve süreç içi Lighthouse davranışının sağlamasıdır.
 */
const checkTechAudit = async (providers: ProviderSet, auditUrls: readonly string[]): Promise<void> => {
  const url = auditUrls[0]
  if (providers.tech.isMock || url === undefined) {
    console.log('  ⊘ Teknik denetim mock ya da denetlenecek URL yok, atlandı.')
    return
  }
  const result = await providers.tech.auditUrl(url)
  if (result.ok) {
    console.log(`  ✓ Lighthouse çalışıyor — ${url} · LCP ${Math.round(result.value.lcpMs)}ms`)
  } else {
    console.log(`  ✗ Lighthouse başarısız: ${result.error.message}`)
  }
}

/**
 * Yapılandırma tanılaması: hangi kategorinin gerçek sağlayıcıya bağlandığını gösterir
 * ve ÜCRETSİZ olanları canlı dener. Ücretli/kotalı çağrılar (SerpApi, DataForSEO)
 * bilerek denenmez — tanı için kota harcamak mantıksız olurdu.
 *
 * Kullanım: npm run doctor
 */
const main = async (): Promise<void> => {
  try {
    const config = loadProjectConfig('config/project.json')
    const providers = selectProviders(loadEnv(), config)

    console.log(`\nHedef domain: ${config.domain}  ·  marka: ${config.brandName}`)
    console.log(
      `Keyword: ${config.seedKeywords.length}  ·  AI sorgusu: ${config.aiQueries.length}  ·  denetlenecek URL: ${config.auditUrls.length}`,
    )
    printSelection(providers)

    console.log('\nCANLI DENEME (yalnız ücretsiz çağrılar)')
    console.log('─'.repeat(64))
    await checkGemini(providers)
    await checkSearchConsole(providers, config.domain)
    await checkTechAudit(providers, config.auditUrls)

    console.log('\nDENENMEYENLER (kota/ücret harcamamak için)')
    console.log('─'.repeat(64))
    console.log(`  SerpApi     : çalıştırma başına ${config.seedKeywords.length} arama (ücretsiz kota 250/ay)`)
    console.log('  DataForSEO  : keyword için 1 çağrı + keşfedilen domain başına 1 backlink çağrısı (ücretli)')
    console.log(`  Lighthouse  : ${config.auditUrls.length} + rakip sayfaları, URL başına 10-30sn (ücretsiz)`)
    console.log('')
  } catch (error) {
    logger.error('Tanı çalıştırılamadı.', error)
    process.exitCode = 1
  }
}

void main()
