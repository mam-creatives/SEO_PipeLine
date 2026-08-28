import { describe, expect, test } from 'vitest'
import type { SourceFile } from '../../types.js'
import { detectHeadMetaIssues } from './headMetaIssues.js'

const headFile = (bodyOfHead: string): SourceFile => {
  const content = `<html>\n<head>\n${bodyOfHead}\n</head>\n<body></body>\n</html>`
  return { relPath: 'index.php', ext: '.php', lineCount: content.split('\n').length, content }
}

describe('detectHeadMetaIssues', () => {
  test('<head> etiketi olmayan dosyalar hiç taranmaz', () => {
    const file: SourceFile = { relPath: 'lib.php', ext: '.php', lineCount: 1, content: '<?php echo "no head"; ?>' }
    expect(detectHeadMetaIssues([file])).toEqual([])
  })

  test('gerçek index.php desenini birebir tespit eder — çakışan robots + eksik OG + no-cache + base href + ölü metalar + JSON-LD yok', () => {
    const content = [
      '<head>',
      '<meta charset="utf-8" />',
      '<base href="https://www.mamcreatives.com/">',
      '<title>MAM Creatives</title>',
      '<meta name="description" content="" />',
      '<meta property="og:image" content="x.png" />',
      '<meta http-equiv="pragma" content="no-cache">',
      '<meta http-equiv="expires" content="0">',
      '<meta name="distribution" content="Global / Local">',
      '<meta name="robots" content="all" />',
      '<meta name="robots" content="index, archive, page" />',
      '<meta name="googlebot" content="index, archive, page" />',
      '<meta name="googlebot" content="all" />',
      '<meta name="rating" content="all">',
      '<meta name="audience" content="all">',
      '</head>',
    ].join('\n')
    const file: SourceFile = { relPath: 'index.php', ext: '.php', lineCount: content.split('\n').length, content }
    const findings = detectHeadMetaIssues([file])
    const titles = findings.map((f) => f.title)

    expect(titles.some((t) => t.includes('çakışan/yinelenen robots'))).toBe(true)
    expect(titles.some((t) => t.includes('Open Graph'))).toBe(true)
    expect(titles.some((t) => t.includes('önbellek kapatılıyor'))).toBe(true)
    expect(titles.some((t) => t.includes('base href'))).toBe(true)
    expect(titles.some((t) => t.includes('yok sayılan meta'))).toBe(true)
    expect(titles.some((t) => t.includes('Yapılandırılmış veri'))).toBe(true)
  })

  test('robots meta 2 taneden azsa çakışma bulgusu üretmez', () => {
    const findings = detectHeadMetaIssues([headFile('<meta name="robots" content="index, follow" />')])
    expect(findings.find((f) => f.title.includes('çakışan'))).toBeUndefined()
  })

  test('OG hiç yoksa Open Graph bulgusu üretilmez (tam yokluk farklı bir sinyal, yarım set değil)', () => {
    const findings = detectHeadMetaIssues([headFile('<title>Başlık</title>')])
    expect(findings.find((f) => f.title.includes('Open Graph'))).toBeUndefined()
  })

  test('OG tam setse bulgu üretilmez', () => {
    const content = [
      '<meta property="og:title" content="x" />',
      '<meta property="og:description" content="x" />',
      '<meta property="og:image" content="x" />',
    ].join('\n')
    const findings = detectHeadMetaIssues([headFile(content)])
    expect(findings.find((f) => f.title.includes('Open Graph'))).toBeUndefined()
  })

  test('application/ld+json varsa yapılandırılmış veri bulgusu üretilmez', () => {
    const findings = detectHeadMetaIssues([headFile('<script type="application/ld+json">{}</script>')])
    expect(findings.find((f) => f.title.includes('Yapılandırılmış veri'))).toBeUndefined()
  })

  test('codeLocation doğru satır numarasını taşır', () => {
    const findings = detectHeadMetaIssues([headFile('<base href="https://x.com/">')])
    const baseFinding = findings.find((f) => f.title.includes('base href'))
    expect(baseFinding?.codeLocation?.file).toBe('index.php')
    expect(baseFinding?.codeLocation?.line).toBe(3)
  })

  test('statik .html dosyaları taranmaz — publicDeadHtml zaten tek toplu bulguyla işaretliyor', () => {
    const content = '<head><meta name="robots" content="all" /><meta name="robots" content="index" /></head>'
    const file: SourceFile = { relPath: 'template/about.html', ext: '.html', lineCount: 1, content }
    expect(detectHeadMetaIssues([file])).toEqual([])
  })

  test('hiçbir sorun yoksa yalnız yapılandırılmış veri bulgusu kalır (her zaman kontrol edilir)', () => {
    const content = [
      '<meta name="robots" content="index, follow" />',
      '<script type="application/ld+json">{}</script>',
    ].join('\n')
    const findings = detectHeadMetaIssues([headFile(content)])
    expect(findings).toEqual([])
  })
})
