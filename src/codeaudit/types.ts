/** Bir proje birden fazla imza taşıyabilir (ör. Next.js önünde özel bir PHP API) — bu yüzden dizi. */
export type StackKind = 'nextjs' | 'php-custom' | 'wordpress' | 'nuxt' | 'astro'

/**
 * `readSourceTree`'nin okuduğu tek bir dosya. `content` her zaman `redactSecrets` ile
 * temizlenmiş hâldedir — kural fonksiyonları ham dosya içeriğine hiç erişemez.
 */
export interface SourceFile {
  readonly relPath: string
  readonly ext: string
  readonly lineCount: number
  readonly content: string
}
