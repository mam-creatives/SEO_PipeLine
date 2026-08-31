import { ConfigError } from '../core/errors.js'
import { slugify } from '../core/text.js'

const DEFAULT_CONFIG_PATH = 'config/project.json'
const CONFIG_FLAG = '--config'
const CODE_FLAG = '--code'
/** Yalnız `report.ts` tüketir (bkz. `extractRunIdFlag`) — burada listelenmesi diğer
 * komutların onu "bilinmeyen argüman" hatasıyla reddetmesini önler, başka bir etkisi yok. */
const RUN_FLAG = '--run'
/** Bilinen bayraklar — extractFlag'in "bilinmeyen argüman" hatası bunları kabul etmeli. */
const KNOWN_FLAGS = [CONFIG_FLAG, CODE_FLAG, RUN_FLAG]

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
      if (arg === CONFIG_FLAG || arg === CODE_FLAG || arg === RUN_FLAG) index += 1 // ayrı token'lı değeri de atla
      continue
    }
    if (arg.startsWith('--')) {
      throw new ConfigError(`Bilinmeyen argüman: ${arg}`)
    }
  }
}

/**
 * CLI argümanlarını ayrıştırır. `dbPath` HER ZAMAN config'in `domain` alanından türer:
 * `data/<domain-slug>.db` — `--config` verilmese bile (varsayılan `config/project.json`
 * okunur). İkinci müşteride veritabanı çakışmasın diye. `reports/` klasörü değişmez,
 * zaten `<tarih>_<domain-slug>/` alt klasörleriyle müşteriler arası çakışmıyor.
 *
 * Dış denetim düzeltmesi (2026-08-31, BLOKER 2) — önceden `--config` verilmediğinde
 * sabit `data/seo.db`'ye düşülüyordu; `npm run research` ve
 * `npm run research -- --config config/project.json` AYNI müşteri için İKİ AYRI
 * veritabanına yazıyordu ve trend geçmişi (diff, "kaçıncı çalıştırma") sessizce
 * çatallanıyordu — README bunu düzeltmek yerine bir tuzak olarak belgeliyordu.
 * Artık ikisi de aynı `data/<domain-slug>.db`'ye yazar.
 *
 * `readDomain` enjekte edilir: gerçek dosya okuma CLI giriş noktasında olur, bu
 * fonksiyon saf kalır ve testte sahte bir okuyucuyla doğrulanır.
 */
export const resolveCliPaths = (
  argv: readonly string[],
  readDomain: (configPath: string) => string,
): CliPaths => {
  assertNoUnknownFlags(argv)
  const configPath = extractFlagValue(argv, CONFIG_FLAG) ?? DEFAULT_CONFIG_PATH
  const codePathOverride = extractFlagValue(argv, CODE_FLAG) ?? undefined
  const domain = readDomain(configPath)
  return { configPath, dbPath: `data/${slugify(domain)}.db`, codePathOverride }
}

/**
 * Dış denetim bulgusu (2026-08-31, Faz C) — `report.ts` her zaman SON tamamlanmış run'ı
 * yeniden render ediyordu; [runRepository.ts](../storage/runRepository.ts) içindeki
 * `getRunById` zaten vardı ama hiç kullanılmıyordu. `--run <id>` yalnız `report.ts` tüketir.
 */
export const extractRunIdFlag = (argv: readonly string[]): number | null => {
  const raw = extractFlagValue(argv, RUN_FLAG)
  if (raw === null) return null
  const id = Number(raw)
  if (!Number.isInteger(id) || id < 1) {
    throw new ConfigError(`${RUN_FLAG} pozitif bir tam sayı bekliyor, alınan: "${raw}"`)
  }
  return id
}
