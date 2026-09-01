import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadEnv } from '../config/env.js'
import { researchDomainWithGemini } from '../config/researchClient.js'
import { buildScaffoldConfig } from '../config/scaffoldConfig.js'
import { ProjectConfigSchema, type ProjectConfig } from '../config/schema.js'
import { createLogger } from '../core/logger.js'
import { slugify } from '../core/text.js'
import { createCrawlProvider } from '../providers/real/crawlProvider.js'
import { hasHelpFlag } from './help.js'

const logger = createLogger('init-client')

const USAGE = `Kullanım: npm run init-client -- <domain> [--force]

Yalnız domain vererek config/<domain-slug>.json iskeleti üretir. Üretilen dosya
şemayı hemen geçer (npm run doctor/research çalışır).

.env'de GEMINI_API_KEY varsa otomatik olarak AI destekli araştırma dener: siteyi
canlı çeker, Gemini'ye bağlamla sorup gerçekçi seedKeywords/seedCompetitors/
aiQueries önerisi ister. Anahtar yoksa ya da araştırma başarısız olursa (ağ
hatası, geçersiz cevap vb.) sessizce yalnız domainden türetilen basit tahmine
düşer — komut asla bu yüzden başarısız olmaz.

  <domain>    zorunlu, örn. mamcreatives.com (https://, www. YAZMAYIN)
  --force     config/<slug>.json zaten varsa üzerine yazar
  --help, -h  bu metni gösterir`

const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i

const printNextSteps = (configPath: string, config: ProjectConfig, usedAiResearch: boolean): void => {
  const sourceNote = usedAiResearch
    ? `"${config.brandName}" ve içerik AI (Gemini) tarafından siteye bakılarak önerildi.`
    : `"${config.brandName}" yalnız domainden tahmin edildi (AI araştırması çalışmadı/atlandı).`
  const competitorWarning = usedAiResearch
    ? '\n  ⚠ seedCompetitors AI TAHMİNİ — LLM\'ler yanlış/eski domain önerebilir, MUTLAKA doğrulayın.'
    : ''

  console.log(`
${configPath} oluşturuldu — ${sourceNote}${competitorWarning}

Sıradaki adımlar (${configPath} içinde elle düzenleyin ve gözden geçirin):
  1. brandName/brandTokens'ı doğrulayın — markanın gerçek yazılışını ve
     AI cevaplarında geçebilecek varyantlarını ekleyin/düzeltin.
  2. seedKeywords'ü gözden geçirin ve gerçek hedef anahtar kelimelerle
     zenginleştirin (${usedAiResearch ? 'AI önerisi bir başlangıç, kotanızı bu belirler' : 'şu an yalnız marka adı var'}).
  3. seedCompetitors'ı doğrulayın${usedAiResearch ? ' (yukarıdaki uyarıya bakın)' : ' (opsiyonel, bilinen rakipleri ekleyin)'}.
  4. aiQueries'i gözden geçirin — markanın adını sorunun içine YAZMAYIN.
  5. (opsiyonel) auditUrls'e şablon başına bir sayfa daha ekleyin
     (şu an yalnız anasayfa var).

Doğrulamak için : npm run doctor -- --config ${configPath}
Çalıştırmak için: npm run research -- --config ${configPath}
`)
}

/**
 * GEMINI_API_KEY varsa AI destekli araştırmayı dener, sonucu scaffold'a birleştirir.
 * Başarısızlık HİÇBİR ZAMAN komutu düşürmez — yalnız uyarı loglanıp domain-tahmini
 * scaffold aynen kullanılır (bkz. USAGE metnindeki sözleşme).
 */
const enrichWithAiResearch = async (
  domain: string,
  scaffold: ProjectConfig,
): Promise<{ readonly config: ProjectConfig; readonly usedAiResearch: boolean }> => {
  const apiKey = loadEnv().GEMINI_API_KEY
  if (apiKey === undefined) {
    logger.info('GEMINI_API_KEY yok — yalnız domain tahminiyle devam ediliyor.')
    return { config: scaffold, usedAiResearch: false }
  }

  logger.info(`GEMINI_API_KEY bulundu — ${domain} için AI destekli araştırma deneniyor...`)
  const suggestion = await researchDomainWithGemini(domain, apiKey, createCrawlProvider().fetchPage)
  if (!suggestion.ok) {
    logger.warn(`AI araştırması başarısız oldu (${suggestion.error.message}) — yalnız domain tahminiyle devam ediliyor.`)
    return { config: scaffold, usedAiResearch: false }
  }

  logger.info('AI araştırması başarılı — öneriler kullanıldı (yine de gözden geçirin).')
  return {
    config: {
      ...scaffold,
      brandName: suggestion.value.brandName,
      // ProjectConfig alanları mutable string[] (zod z.array çıktısı) — ResearchSuggestion
      // ise readonly string[] taşır (Finding/Result desenleriyle tutarlı, bkz. core/*.ts).
      // Spread ile taze mutable dizilere kopyalanır.
      brandTokens: [...suggestion.value.brandTokens],
      seedKeywords: [...suggestion.value.seedKeywords],
      seedCompetitors: [...suggestion.value.seedCompetitors],
      aiQueries: [...suggestion.value.aiQueries],
    },
    usedAiResearch: true,
  }
}

const main = async (): Promise<void> => {
  const argv = process.argv.slice(2)
  if (hasHelpFlag(argv)) {
    console.log(USAGE)
    return
  }

  const force = argv.includes('--force')
  const domain = argv.find((arg) => !arg.startsWith('--'))

  if (domain === undefined || !DOMAIN_PATTERN.test(domain)) {
    logger.error('Geçerli bir domain verin (protokolsüz, www\'suz), örn: npm run init-client -- mamcreatives.com')
    console.log(USAGE)
    process.exitCode = 1
    return
  }

  const configPath = join('config', `${slugify(domain)}.json`)
  if (existsSync(configPath) && !force) {
    logger.error(`${configPath} zaten var — üzerine yazmak için --force ekleyin.`)
    process.exitCode = 1
    return
  }

  try {
    const { config, usedAiResearch } = await enrichWithAiResearch(domain, buildScaffoldConfig(domain))
    // Üretilen iskeletin ELLE düzenleme yapılmadan çalışır durumda olması bu komutun
    // sözleşmesi ("yalnız domain ile ilerle") — schema doğrulaması bunun sağlamasıdır.
    // AI önerisi şemaya uymazsa bile (olmamalı, ama savunmacı) buradaki parse yakalar.
    const validated = ProjectConfigSchema.parse(config)

    mkdirSync('config', { recursive: true })
    writeFileSync(configPath, `${JSON.stringify(validated, null, 2)}\n`, 'utf-8')

    printNextSteps(configPath, validated, usedAiResearch)
  } catch (error) {
    logger.error(`${domain} için config iskeleti üretilemedi.`, error)
    process.exitCode = 1
  }
}

void main()
