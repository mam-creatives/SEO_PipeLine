import { ConfigError } from '../core/errors.js'
import { slugify } from '../core/text.js'

const DEFAULT_CONFIG_PATH = 'config/project.json'
const DEFAULT_DB_PATH = 'data/seo.db'
const CONFIG_FLAG = '--config'
const CODE_FLAG = '--code'
/** Bilinen bayraklar — extractFlag'in "bilinmeyen argüman" hatası bu ikisini de kabul etmeli. */
const KNOWN_FLAGS = [CONFIG_FLAG, CODE_FLAG]

export interface CliPaths {
  readonly configPath: string
  readonly dbPath: string
  /** `--code <yol>` verildiyse config'in codePath'ini ezer; verilmezse undefined. */
  readonly codePathOverride: string | undefined
}

/**
 * `<flag> <yol>` veya `<flag>=<yol>` biçiminde bir CLI değeri çıkarır; yoksa null.
 * `--config`/`--code` ortak deseni — ikisi de aynı iki biçimi destekler.
 */
const extractFlagValue = (argv: readonly string[], flag: string): string | null => {
  let value: string | null = null
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === undefined) continue

    if (arg === flag) {
      const next = argv[index + 1]
      if (next === undefined) {
        throw new ConfigError(`${flag} bir yol bekliyor, örn: ${flag} config/musteri.json`)
      }
      value = next
      index += 1 // değeri atla, bir sonraki turda bayrak gibi değerlendirilmesin
      continue
    }

    if (arg.startsWith(`${flag}=`)) {
      value = arg.slice(flag.length + 1)
    }
  }
  return value
}

/**
 * Bilinmeyen bir `--` bayrağı görürse hata verir — sessizce yok saymak yerine erken ve
 * açık başarısızlık. `--config`/`--code` değerlerinin KENDİSİ (yol string'i) bu taramadan
 * ayrı çıkarıldığı için burada yalnız bayrak ADLARI kontrol edilir.
 */
const assertNoUnknownFlags = (argv: readonly string[]): void => {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === undefined) continue
    const isKnownFlagOrItsValue = KNOWN_FLAGS.some((flag) => arg === flag || arg.startsWith(`${flag}=`))
    if (isKnownFlagOrItsValue) {
      if (arg === CONFIG_FLAG || arg === CODE_FLAG) index += 1 // ayrı token'lı değeri de atla
      continue
    }
    if (arg.startsWith('--')) {
      throw new ConfigError(`Bilinmeyen argüman: ${arg}`)
    }
  }
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
  assertNoUnknownFlags(argv)
  const configPath = extractFlagValue(argv, CONFIG_FLAG)
  const codePathOverride = extractFlagValue(argv, CODE_FLAG) ?? undefined
  if (configPath === null) {
    return { configPath: DEFAULT_CONFIG_PATH, dbPath: DEFAULT_DB_PATH, codePathOverride }
  }
  const domain = readDomain(configPath)
  return { configPath, dbPath: `data/${slugify(domain)}.db`, codePathOverride }
}
