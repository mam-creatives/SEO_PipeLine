import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildScaffoldConfig } from '../config/scaffoldConfig.js'
import { ProjectConfigSchema } from '../config/schema.js'
import { createLogger } from '../core/logger.js'
import { slugify } from '../core/text.js'
import { hasHelpFlag } from './help.js'

const logger = createLogger('init-client')

const USAGE = `Kullanım: npm run init-client -- <domain> [--force]

Yalnız domain vererek config/<domain-slug>.json iskeleti üretir. Üretilen dosya
şemayı hemen geçer (npm run doctor/research çalışır) ama brandName/brandTokens/
seedKeywords yalnız domainden TAHMİN edilir — gerçek SEO değeri için elle
zenginleştirilmeli.

  <domain>    zorunlu, örn. mamcreatives.com (https://, www. YAZMAYIN)
  --force     config/<slug>.json zaten varsa üzerine yazar
  --help, -h  bu metni gösterir`

const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i

const printNextSteps = (configPath: string, brandName: string): void => {
  console.log(`
${configPath} oluşturuldu — "${brandName}" yalnız domainden tahmin edildi.

Sıradaki adımlar (${configPath} içinde elle düzenleyin):
  1. brandName/brandTokens'ı doğrulayın — markanın gerçek yazılışını ve
     AI cevaplarında geçebilecek varyantlarını ekleyin.
  2. seedKeywords'e GERÇEK hedef anahtar kelimeleri ekleyin (şu an yalnız
     marka adı var — bu, hacim/sıra ölçmek için neredeyse hiç değer üretmez).
  3. (opsiyonel) seedCompetitors'a bilinen rakip domain'leri ekleyin.
  4. (opsiyonel) aiQueries'e AI görünürlük (GEO) için müşteri ağzından
     sorular ekleyin — markanın adını sorunun içine YAZMAYIN.
  5. (opsiyonel) auditUrls'e şablon başına bir sayfa daha ekleyin
     (şu an yalnız anasayfa var).

Doğrulamak için : npm run doctor -- --config ${configPath}
Çalıştırmak için: npm run research -- --config ${configPath}
`)
}

const main = (): void => {
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

  const scaffold = buildScaffoldConfig(domain)
  // Üretilen iskeletin ELLE düzenleme yapılmadan çalışır durumda olması bu komutun
  // sözleşmesi ("yalnız domain ile ilerle") — schema doğrulaması bunun sağlamasıdır.
  const validated = ProjectConfigSchema.parse(scaffold)

  mkdirSync('config', { recursive: true })
  writeFileSync(configPath, `${JSON.stringify(validated, null, 2)}\n`, 'utf-8')

  printNextSteps(configPath, validated.brandName)
}

main()
