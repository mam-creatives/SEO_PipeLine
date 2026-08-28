import type { StackKind } from './types.js'

const hasMatch = (relPaths: readonly string[], pattern: RegExp): boolean => relPaths.some((p) => pattern.test(p))

const WORDPRESS_SIGNATURE = /(^|\/)wp-config\.php$/
const INDEX_PHP_SIGNATURE = /(^|\/)index\.php$/
const HTACCESS_SIGNATURE = /(^|\/)\.htaccess$/
const NEXTJS_SIGNATURE = /(^|\/)next\.config\.(js|mjs|ts|cjs)$/
const NUXT_SIGNATURE = /(^|\/)nuxt\.config\.(js|mjs|ts)$/
const ASTRO_SIGNATURE = /(^|\/)astro\.config\.(js|mjs|ts)$/

/**
 * Dosya yolu listesinden (readSourceTree'nin relPath'leri) proje stack'ini tespit eder.
 * Saf fonksiyon — birden fazla stack aynı anda dönebilir (ör. Next.js önünde özel bir PHP API).
 *
 * `wp-config.php` varsa WordPress imzası `index.php` + `.htaccess`'ten önceliklidir — WP de
 * front-controller + .htaccess kullanır, ayrım yalnız wp-config.php'nin varlığıyla yapılabilir.
 */
export const detectStack = (relPaths: readonly string[]): readonly StackKind[] => {
  const isWordpress = hasMatch(relPaths, WORDPRESS_SIGNATURE)
  const isPhpCustom = !isWordpress && hasMatch(relPaths, INDEX_PHP_SIGNATURE) && hasMatch(relPaths, HTACCESS_SIGNATURE)
  const isNextjs = hasMatch(relPaths, NEXTJS_SIGNATURE)
  const isNuxt = hasMatch(relPaths, NUXT_SIGNATURE)
  const isAstro = hasMatch(relPaths, ASTRO_SIGNATURE)

  const stacks: StackKind[] = []
  if (isWordpress) stacks.push('wordpress')
  if (isPhpCustom) stacks.push('php-custom')
  if (isNextjs) stacks.push('nextjs')
  if (isNuxt) stacks.push('nuxt')
  if (isAstro) stacks.push('astro')
  return stacks
}
