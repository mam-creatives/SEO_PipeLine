import { describe, expect, test } from 'vitest'
import type { SourceFile } from '../../types.js'
import { detectAssetIssues } from './assets.js'

const file = (relPath: string, content: string): SourceFile => ({ relPath, ext: '.tsx', lineCount: content.split('\n').length, content })

describe('detectAssetIssues', () => {
  test('ham <img>, next/image import\'u olmadan bulgu üretir', () => {
    const findings = detectAssetIssues([file('app/page.tsx', '<img src="/a.jpg" alt="x" />')])
    expect(findings.find((f) => f.title.includes('next/image değil'))).toBeDefined()
  })

  test('next/image import edilmişse <img> bulgusu üretilmez (kasıtlı karışım varsayılır)', () => {
    const content = `import Image from 'next/image'\n<img src="/icon.svg" />`
    const findings = detectAssetIssues([file('app/page.tsx', content)])
    expect(findings.find((f) => f.title.includes('next/image değil'))).toBeUndefined()
  })

  test('page.tsx\'te <Image> var ama hiçbirinde priority yoksa bulgu üretir', () => {
    const content = `import Image from 'next/image'\n<Image src="/hero.jpg" alt="x" />`
    const findings = detectAssetIssues([file('app/page.tsx', content)])
    expect(findings.find((f) => f.title.includes('priority yok'))).toBeDefined()
  })

  test('priority varsa bulgu üretilmez', () => {
    const content = `import Image from 'next/image'\n<Image src="/hero.jpg" alt="x" priority />`
    const findings = detectAssetIssues([file('app/page.tsx', content)])
    expect(findings.find((f) => f.title.includes('priority yok'))).toBeUndefined()
  })

  test('Google Fonts <link> var, next/font yoksa proje-geneli bulgu üretir', () => {
    const files = [file('app/layout.tsx', '<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet" />')]
    const findings = detectAssetIssues(files)
    expect(findings.find((f) => f.title.includes('next/font kullanılmıyor'))).toBeDefined()
  })

  test('next/font import edilmişse Google Fonts bulgusu üretilmez', () => {
    const files = [
      file('app/layout.tsx', '<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet" />'),
      file('app/fonts.ts', "import { Inter } from 'next/font/google'"),
    ]
    expect(detectAssetIssues(files).find((f) => f.title.includes('next/font kullanılmıyor'))).toBeUndefined()
  })

  test('Google Fonts hiç kullanılmıyorsa font bulgusu üretilmez', () => {
    expect(detectAssetIssues([file('app/layout.tsx', '<div>içerik</div>')])).toEqual([])
  })

  test('ham <script>, next/script olmadan bulgu üretir', () => {
    const findings = detectAssetIssues([file('app/page.tsx', '<script src="https://example.com/a.js"></script>')])
    expect(findings.find((f) => f.title.includes('next/script değil'))).toBeDefined()
  })

  test('application/ld+json script\'i next/script bulgusuna girmez (JSON-LD meşru bir istisna)', () => {
    const findings = detectAssetIssues([file('app/page.tsx', '<script type="application/ld+json">{}</script>')])
    expect(findings.find((f) => f.title.includes('next/script değil'))).toBeUndefined()
  })

  test('next/script import edilmişse ham script bulgusu üretilmez', () => {
    const content = `import Script from 'next/script'\n<script src="https://example.com/a.js"></script>`
    const findings = detectAssetIssues([file('app/page.tsx', content)])
    expect(findings.find((f) => f.title.includes('next/script değil'))).toBeUndefined()
  })

  test('temiz bir dosya hiç bulgu üretmez', () => {
    const content = `import Image from 'next/image'\n<Image src="/a.jpg" alt="x" priority />`
    expect(detectAssetIssues([file('app/page.tsx', content)])).toEqual([])
  })
})
