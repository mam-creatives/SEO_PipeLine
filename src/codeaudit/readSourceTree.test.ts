import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { readSourceTree } from './readSourceTree.js'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'seo-codeaudit-test-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('readSourceTree', () => {
  test('allowlist dışı uzantıları atlar', () => {
    writeFileSync(join(root, 'index.php'), '<?php echo "merhaba"; ?>')
    writeFileSync(join(root, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    const result = readSourceTree(root)
    expect(result.files).toHaveLength(1)
    expect(result.files[0]?.relPath).toBe('index.php')
  })

  test('yok sayılan dizinlerin içine hiç girmez', () => {
    mkdirSync(join(root, 'vendor', 'pkg'), { recursive: true })
    writeFileSync(join(root, 'vendor', 'pkg', 'lib.php'), '<?php // 3. parti')
    writeFileSync(join(root, 'index.php'), '<?php // müşteri kodu')
    const result = readSourceTree(root)
    expect(result.files.map((f) => f.relPath)).toEqual(['index.php'])
  })

  test('iç içe dizinleri yinelemeli tarar', () => {
    mkdirSync(join(root, 'inc'), { recursive: true })
    writeFileSync(join(root, 'inc', 'anasayfa.php'), '<?php // anasayfa')
    const result = readSourceTree(root)
    expect(result.files[0]?.relPath).toBe(join('inc', 'anasayfa.php'))
  })

  test('.htaccess gibi uzantısız özel dosya adlarını okur', () => {
    writeFileSync(join(root, '.htaccess'), 'RewriteEngine On')
    const result = readSourceTree(root)
    expect(result.files.map((f) => f.relPath)).toContain('.htaccess')
  })

  test('okunan içerik redactSecrets ile temizlenmiş olur', () => {
    writeFileSync(join(root, 'config.php'), `$db_password = 'gercekSifre123';`)
    const result = readSourceTree(root)
    expect(result.files[0]?.content).not.toContain('gercekSifre123')
    expect(result.files[0]?.content).toContain('***REDACTED***')
  })

  test('lineCount dosyadaki satır sayısını yansıtır', () => {
    writeFileSync(join(root, 'a.php'), 'satır1\nsatır2\nsatır3')
    const result = readSourceTree(root)
    expect(result.files[0]?.lineCount).toBe(3)
  })

  test('maxFileBytes\'ı aşan dosya içerik olmadan atlanır', () => {
    writeFileSync(join(root, 'big.php'), 'x'.repeat(1000))
    writeFileSync(join(root, 'small.php'), 'küçük')
    const result = readSourceTree(root, { maxFiles: 100, maxFileBytes: 500 })
    expect(result.files.map((f) => f.relPath)).toEqual(['small.php'])
    expect(result.oversizedSkipped).toBe(1)
  })

  test('maxFiles sınırına ulaşınca truncated true döner', () => {
    writeFileSync(join(root, 'a.php'), 'a')
    writeFileSync(join(root, 'b.php'), 'b')
    writeFileSync(join(root, 'c.php'), 'c')
    const result = readSourceTree(root, { maxFiles: 2, maxFileBytes: 1000 })
    expect(result.files).toHaveLength(2)
    expect(result.truncated).toBe(true)
  })

  test('dosya sayısı sınırın altındaysa truncated false döner', () => {
    writeFileSync(join(root, 'a.php'), 'a')
    const result = readSourceTree(root, { maxFiles: 100, maxFileBytes: 1000 })
    expect(result.truncated).toBe(false)
  })

  test('var olmayan kök dizin hata fırlatmaz, boş sonuç döner', () => {
    const result = readSourceTree(join(root, 'yok-boyle-bir-dizin'))
    expect(result.files).toEqual([])
    expect(result.truncated).toBe(false)
  })
})
