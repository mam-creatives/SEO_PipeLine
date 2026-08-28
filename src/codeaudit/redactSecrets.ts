/**
 * Anahtar adı bu kalıplardan birini içeriyorsa değeri maskelenir. `\w*` her iki yönde de
 * uzanır ki `DB_PASS`, `dbPassword`, `PAYTR_MERCHANT_SALT`, `stripe_secret_key` gibi
 * varyasyonların hepsi yakalansın.
 */
const SECRET_KEY_FRAGMENT =
  '\\w*(?:api[_-]?key|secret|password|passwd|token|auth|private[_-]?key|access[_-]?key|db[_-]?pass|salt|credential)\\w*'

/** PHP/JS atama biçimleri: `$foo = 'x'`, `foo: 'x'`, `foo => 'x'`, `foo = "x"`. */
const ASSIGNMENT_PATTERN = new RegExp(`(\\$?${SECRET_KEY_FRAGMENT})(\\s*(?:=>|=|:)\\s*)(['"])([^'"]*)(\\3)`, 'gi')

/** PHP `define('KEY', 'value')` biçimi — anahtar adı sabit isim, değer ikinci argüman. */
const DEFINE_PATTERN = new RegExp(`(define\\s*\\(\\s*['"])(${SECRET_KEY_FRAGMENT})(['"]\\s*,\\s*)(['"])([^'"]*)(\\4)`, 'gi')

const MASK = '***REDACTED***'

/**
 * Müşteri kaynak kodu iyzipay/paytr/stripe/shopier entegrasyonları ve `admin/site-ayarlari.php`
 * gibi kimlik bilgisi taşıyan dosyalar içerebilir. Bu fonksiyon `readSourceTree` tarafından
 * HER dosyaya, içerik `SourceFile.content`'e girmeden önce zorunlu uygulanır — hiçbir bulgunun
 * `evidence`'ı bir kimlik bilgisi taşıyamaz.
 *
 * Yalnız DEĞER maskelenir, satır sayısı ve anahtar adı korunur — `codeLocation` (Faz 3.5)
 * satır numaralarının redaksiyon sonrası da doğru kalması buna bağlı.
 */
export const redactSecrets = (content: string): string =>
  content
    .replace(DEFINE_PATTERN, (_match, prefix: string, key: string, mid: string, quote: string) => `${prefix}${key}${mid}${quote}${MASK}${quote}`)
    .replace(ASSIGNMENT_PATTERN, (_match, key: string, op: string, quote: string) => `${key}${op}${quote}${MASK}${quote}`)
