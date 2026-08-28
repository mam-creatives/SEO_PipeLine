import { describe, expect, test } from 'vitest'
import type { SourceFile } from '../../types.js'
import { detectMetadataIssues } from './metadata.js'

const file = (relPath: string, content: string): SourceFile => ({ relPath, ext: '.tsx', lineCount: content.split('\n').length, content })

describe('detectMetadataIssues', () => {
  test('metadata export\'u olmayan page.tsx high severity bulgu üretir', () => {
    const findings = detectMetadataIssues([file('app/page.tsx', 'export default function Page() { return null }')])
    expect(findings.find((f) => f.title.includes('metadata'))?.severity).toBe('high')
  })

  test('metadata export\'u varsa bulgu üretmez', () => {
    const content = "export const metadata: Metadata = { title: 'x' }\nexport default function Page() {}"
    const findings = detectMetadataIssues([file('app/page.tsx', content)])
    expect(findings.find((f) => f.title.includes('ne metadata ne'))).toBeUndefined()
  })

  test('generateMetadata varsa da yeterli sayılır', () => {
    const content = 'export async function generateMetadata() { return {} }\nexport default function Page() {}'
    const findings = detectMetadataIssues([file('app/urun/[slug]/page.tsx', content)])
    expect(findings.find((f) => f.title.includes('ne metadata ne'))).toBeUndefined()
  })

  test('page.tsx olmayan dosyalar metadata kontrolüne girmez (yalnız proje-geneli robots/sitemap bulgusu kalabilir)', () => {
    const findings = detectMetadataIssues([file('app/components/Button.tsx', 'export const Button = () => null')])
    expect(findings.find((f) => f.title.includes('metadata'))).toBeUndefined()
  })

  test('hiçbir sayfa alternates.canonical kullanmıyorsa tek proje-geneli bulgu üretir', () => {
    const files = [
      file('app/a/page.tsx', "export const metadata = { title: 'a' }"),
      file('app/b/page.tsx', "export const metadata = { title: 'b' }"),
    ]
    const findings = detectMetadataIssues(files)
    const canonicalFindings = findings.filter((f) => f.title.includes('canonical'))
    expect(canonicalFindings).toHaveLength(1)
    expect(canonicalFindings[0]?.evidence).toContain('2 sayfa')
  })

  test('en az bir sayfa alternates.canonical kullanıyorsa canonical bulgusu üretilmez', () => {
    const files = [
      file('app/a/page.tsx', "export const metadata = { title: 'a', alternates: { canonical: '/a' } }"),
      file('app/b/page.tsx', "export const metadata = { title: 'b' }"),
    ]
    expect(detectMetadataIssues(files).find((f) => f.title.includes('canonical'))).toBeUndefined()
  })

  test('app/ dizini varsa ve robots.ts/sitemap.ts yoksa bulgu üretir', () => {
    const findings = detectMetadataIssues([file('app/page.tsx', "export const metadata = { title: 'x' }")])
    expect(findings.find((f) => f.title.includes('robots.ts'))).toBeDefined()
  })

  test('app/robots.ts ve app/sitemap.ts varsa bulgu üretilmez', () => {
    const files = [
      file('app/page.tsx', "export const metadata = { title: 'x' }"),
      file('app/robots.ts', 'export default function robots() {}'),
      file('app/sitemap.ts', 'export default function sitemap() {}'),
    ]
    expect(detectMetadataIssues(files).find((f) => f.title.includes('robots.ts'))).toBeUndefined()
  })

  test('app/ dizini hiç yoksa (pages router ya da başka stack) robots/sitemap bulgusu üretilmez', () => {
    expect(detectMetadataIssues([file('pages/index.tsx', 'export default function Page() {}')])).toEqual([])
  })
})
