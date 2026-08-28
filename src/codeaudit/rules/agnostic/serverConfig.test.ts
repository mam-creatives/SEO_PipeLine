import { describe, expect, test } from 'vitest'
import type { SourceFile } from '../../types.js'
import { detectServerConfigIssues } from './serverConfig.js'

const htaccess = (content: string): SourceFile => ({ relPath: '.htaccess', ext: '', lineCount: 1, content })

describe('detectServerConfigIssues', () => {
  test('.htaccess dosyası yoksa bulgu üretmez', () => {
    const files: SourceFile[] = [{ relPath: 'index.php', ext: '.php', lineCount: 1, content: '<?php ?>' }]
    expect(detectServerConfigIssues(files)).toEqual([])
  })

  test('cache ve HTTPS direktifi ikisi de yoksa iki bulgu üretir', () => {
    const findings = detectServerConfigIssues([htaccess('RewriteEngine On\nRewriteRule ^x$ index.php [L]')])
    expect(findings).toHaveLength(2)
    expect(findings.map((f) => f.title)).toEqual([
      'Sunucu tarafında tarayıcı önbellek direktifi yok',
      'HTTPS zorlaması .htaccess içinde tanımlı değil',
    ])
  })

  test('ExpiresActive varsa cache bulgusu üretilmez', () => {
    const findings = detectServerConfigIssues([htaccess('ExpiresActive On\nRewriteEngine On')])
    expect(findings.find((f) => f.title.includes('önbellek'))).toBeUndefined()
  })

  test('%{HTTPS} kontrolü varsa HTTPS bulgusu üretilmez', () => {
    const content = 'RewriteCond %{HTTPS} off\nRewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]'
    const findings = detectServerConfigIssues([htaccess(content)])
    expect(findings.find((f) => f.title.includes('HTTPS'))).toBeUndefined()
  })

  test('ikisi de mevcutsa hiç bulgu üretilmez', () => {
    const content = 'ExpiresActive On\nRewriteCond %{HTTPS} off'
    expect(detectServerConfigIssues([htaccess(content)])).toEqual([])
  })

  test('iç içe dizindeki .htaccess de taranır', () => {
    const file: SourceFile = { relPath: 'sub/.htaccess', ext: '', lineCount: 1, content: 'RewriteEngine On' }
    expect(detectServerConfigIssues([file])).toHaveLength(2)
  })
})
