import { describe, expect, test } from 'vitest'
import { computeCodeAuditFindings } from './computeCodeAuditFindings.js'
import type { SourceFile } from './types.js'

const nextConfig: SourceFile = { relPath: 'next.config.ts', ext: '.ts', lineCount: 1, content: 'export default {}' }
const rawImgPage: SourceFile = { relPath: 'app/page.tsx', ext: '.tsx', lineCount: 1, content: '<img src="/a.jpg" />' }
// headMetaIssues.ts (PHP-gated, agnostik değil) — çakışan robots meta'sı yalnız php-custom/wordpress'te üretilir.
const duplicateRobotsMeta: SourceFile = {
  relPath: 'index.php',
  ext: '.php',
  lineCount: 1,
  content: '<head><meta name="robots" content="all" /><meta name="robots" content="index" /><meta name="googlebot" content="all" /></head>',
}

describe('computeCodeAuditFindings', () => {
  test('sourceFiles boşsa boş dizi döner', () => {
    expect(computeCodeAuditFindings([], ['php-custom'])).toEqual([])
  })

  test('stack php-custom değilse PHP kuralları çalışmaz (çakışan robots meta bulgusu üretilmez)', () => {
    const findings = computeCodeAuditFindings([duplicateRobotsMeta], [])
    expect(findings.find((f) => f.title.includes('çakışan/yinelenen robots'))).toBeUndefined()
  })

  test('stack php-custom ise PHP kuralları çalışır', () => {
    const findings = computeCodeAuditFindings([duplicateRobotsMeta], ['php-custom'])
    expect(findings.find((f) => f.title.includes('çakışan/yinelenen robots'))).toBeDefined()
  })

  test('stack wordpress ise de PHP kuralları çalışır', () => {
    const findings = computeCodeAuditFindings([duplicateRobotsMeta], ['wordpress'])
    expect(findings.find((f) => f.title.includes('çakışan/yinelenen robots'))).toBeDefined()
  })

  test('stack nextjs değilse Next.js kuralları çalışmaz', () => {
    const findings = computeCodeAuditFindings([rawImgPage], ['php-custom'])
    expect(findings.find((f) => f.title.includes('next/image değil'))).toBeUndefined()
  })

  test('stack nextjs ise Next.js kuralları çalışır', () => {
    const findings = computeCodeAuditFindings([rawImgPage, nextConfig], ['nextjs'])
    expect(findings.find((f) => f.title.includes('next/image değil'))).toBeDefined()
  })

  test('agnostik kurallar stack fark etmeksizin her zaman çalışır', () => {
    const scriptFile: SourceFile = { relPath: 'a.php', ext: '.php', lineCount: 1, content: '<script src="https://x.com/a.js"></script>' }
    const findings = computeCodeAuditFindings([scriptFile], [])
    expect(findings.find((f) => f.title.includes('üçüncü parti'))).toBeDefined()
  })

  test('birden fazla stack aynı anda tespit edilirse ilgili kuralların hepsi çalışır', () => {
    const findings = computeCodeAuditFindings([duplicateRobotsMeta, rawImgPage, nextConfig], ['php-custom', 'nextjs'])
    expect(findings.find((f) => f.title.includes('çakışan/yinelenen robots'))).toBeDefined()
    expect(findings.find((f) => f.title.includes('next/image değil'))).toBeDefined()
  })
})
