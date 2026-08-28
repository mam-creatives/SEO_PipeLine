import { describe, expect, test } from 'vitest'
import { detectStack } from './detectStack.js'

describe('detectStack', () => {
  test('index.php + .htaccess → php-custom', () => {
    expect(detectStack(['index.php', '.htaccess', 'inc/anasayfa.php'])).toEqual(['php-custom'])
  })

  test('yalnız index.php varsa (.htaccess yok) php-custom saymaz', () => {
    expect(detectStack(['index.php'])).toEqual([])
  })

  test('wp-config.php → wordpress, php-custom değil', () => {
    expect(detectStack(['index.php', '.htaccess', 'wp-config.php'])).toEqual(['wordpress'])
  })

  test('next.config.ts → nextjs', () => {
    expect(detectStack(['next.config.ts', 'app/page.tsx'])).toEqual(['nextjs'])
  })

  test('next.config.js de tanınır', () => {
    expect(detectStack(['next.config.js'])).toEqual(['nextjs'])
  })

  test('nuxt.config.ts → nuxt', () => {
    expect(detectStack(['nuxt.config.ts'])).toEqual(['nuxt'])
  })

  test('astro.config.mjs → astro', () => {
    expect(detectStack(['astro.config.mjs'])).toEqual(['astro'])
  })

  test('hiçbir imza yoksa boş dizi döner', () => {
    expect(detectStack(['README.md', 'style.css'])).toEqual([])
  })

  test('iç içe dizindeki imza da tanınır', () => {
    expect(detectStack(['apps/web/next.config.ts'])).toEqual(['nextjs'])
  })

  test('birden fazla stack aynı anda dönebilir', () => {
    const stacks = detectStack(['index.php', '.htaccess', 'admin/next.config.js'])
    expect(stacks).toContain('php-custom')
    expect(stacks).toContain('nextjs')
    expect(stacks).toHaveLength(2)
  })
})
