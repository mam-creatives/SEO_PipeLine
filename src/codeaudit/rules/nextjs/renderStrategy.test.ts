import { describe, expect, test } from 'vitest'
import type { SourceFile } from '../../types.js'
import { detectRenderStrategyIssues } from './renderStrategy.js'

const file = (relPath: string, content: string): SourceFile => ({ relPath, ext: '.tsx', lineCount: content.split('\n').length, content })

describe('detectRenderStrategyIssues', () => {
  test("layout.tsx'te 'use client' varsa high severity bulgu üretir", () => {
    const findings = detectRenderStrategyIssues([file('app/layout.tsx', `'use client'\nexport default function Layout() {}`)])
    expect(findings).toHaveLength(1)
    expect(findings[0]?.severity).toBe('high')
  })

  test("page.tsx'te 'use client' varsa layout bulgusu üretmez (yalnız layout hedeflenir)", () => {
    const findings = detectRenderStrategyIssues([file('app/page.tsx', `'use client'\nexport default function Page() {}`)])
    expect(findings.find((f) => f.title.includes('layout.tsx'))).toBeUndefined()
  })

  test("'use client' olmayan layout.tsx bulgu üretmez", () => {
    expect(detectRenderStrategyIssues([file('app/layout.tsx', 'export default function Layout() {}')])).toEqual([])
  })

  test('dynamic(..., { ssr: false }) kullanımını tespit eder', () => {
    const content = `const Widget = dynamic(() => import('./Widget'), { ssr: false })`
    const findings = detectRenderStrategyIssues([file('app/page.tsx', content)])
    expect(findings.find((f) => f.title.includes('ssr: false'))).toBeDefined()
  })

  test("force-dynamic export'unu tespit eder", () => {
    const content = `export const dynamic = 'force-dynamic'`
    const findings = detectRenderStrategyIssues([file('app/page.tsx', content)])
    expect(findings.find((f) => f.title.includes('force-dynamic'))).toBeDefined()
  })

  test('dinamik segment + generateStaticParams yoksa bulgu üretir', () => {
    const findings = detectRenderStrategyIssues([file('app/urun/[slug]/page.tsx', 'export default function Page() {}')])
    expect(findings.find((f) => f.title.includes('generateStaticParams'))).toBeDefined()
  })

  test('dinamik segment + generateStaticParams varsa bulgu üretmez', () => {
    const content = 'export async function generateStaticParams() { return [] }\nexport default function Page() {}'
    const findings = detectRenderStrategyIssues([file('app/urun/[slug]/page.tsx', content)])
    expect(findings.find((f) => f.title.includes('generateStaticParams'))).toBeUndefined()
  })

  test('statik route (dinamik segment yok) generateStaticParams bulgusu üretmez', () => {
    const findings = detectRenderStrategyIssues([file('app/hakkimizda/page.tsx', 'export default function Page() {}')])
    expect(findings.find((f) => f.title.includes('generateStaticParams'))).toBeUndefined()
  })

  test('temiz bir dosya hiç bulgu üretmez', () => {
    expect(detectRenderStrategyIssues([file('app/page.tsx', 'export default function Page() { return null }')])).toEqual([])
  })
})
