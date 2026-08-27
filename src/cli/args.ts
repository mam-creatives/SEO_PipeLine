import { ConfigError } from '../core/errors.js'
import { slugify } from '../core/text.js'

const DEFAULT_CONFIG_PATH = 'config/project.json'
const DEFAULT_DB_PATH = 'data/seo.db'
const CONFIG_FLAG = '--config'

export interface CliPaths {
  readonly configPath: string
  readonly dbPath: string
}

/**
 * `--config <yol>` veya `--config=<yol>` biçiminde config yolunu çıkarır; yoksa null.
 * Bilinmeyen bir `--` bayrağı görürse (config değerinden SONRA gelse bile) hata verir —
 * sessizce yok saymak yerine erken ve açık başarısızlık.
 */
const extractConfigPath = (argv: readonly string[]): string | null => {
  let configPath: string | null = null
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === undefined) continue

    if (arg === CONFIG_FLAG) {
      const value = argv[index + 1]
      if (value === undefined) {
        throw new ConfigError(`${CONFIG_FLAG} bir yol bekliyor, örn: ${CONFIG_FLAG} config/musteri.json`)
      }
      configPath = value
      index += 1 // değeri atla, bir sonraki turda bayrak gibi değerlendirilmesin
      continue
    }

    if (arg.startsWith(`${CONFIG_FLAG}=`)) {
      configPath = arg.slice(CONFIG_FLAG.length + 1)
      continue
    }

    if (arg.startsWith('--')) {
      throw new ConfigError(`Bilinmeyen argüman: ${arg}`)
    }
  }
  return configPath
}

/**
 * CLI argümanlarını ayrıştırır. `--config` verilmezse bugünkü sabit yollar korunur
 * (geriye dönük uyum: `config/project.json` + `data/seo.db`). Verilirse `dbPath`
 * config'in `domain` alanından türer: `data/<domain-slug>.db` — ikinci müşteride
 * veritabanı çakışmasın diye. `reports/` klasörü değişmez, zaten `<tarih>_<domain-slug>/`
 * alt klasörleriyle müşteriler arası çakışmıyor.
 *
 * `readDomain` enjekte edilir: gerçek dosya okuma CLI giriş noktasında olur, bu
 * fonksiyon saf kalır ve testte sahte bir okuyucuyla doğrulanır.
 */
export const resolveCliPaths = (
  argv: readonly string[],
  readDomain: (configPath: string) => string,
): CliPaths => {
  const configPath = extractConfigPath(argv)
  if (configPath === null) {
    return { configPath: DEFAULT_CONFIG_PATH, dbPath: DEFAULT_DB_PATH }
  }
  const domain = readDomain(configPath)
  return { configPath, dbPath: `data/${slugify(domain)}.db` }
}
