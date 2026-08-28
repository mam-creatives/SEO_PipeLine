import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { collectSourceCode } from './collectSourceCode.js'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'seo-collectsourcecode-test-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('collectSourceCode', () => {
  test('codePath undefined ise boş sonuç döner', () => {
    expect(collectSourceCode(undefined)).toEqual({ sourceFiles: [], detectedStacks: [], truncated: false })
  })

  test('codePath verilmişse dosyaları okur ve stack tespit eder', () => {
    writeFileSync(join(root, 'index.php'), '<?php ?>')
    writeFileSync(join(root, '.htaccess'), 'RewriteEngine On')
    const result = collectSourceCode(root)
    expect(result.sourceFiles).toHaveLength(2)
    expect(result.detectedStacks).toEqual(['php-custom'])
  })

  test('imza yoksa detectedStacks boş döner', () => {
    writeFileSync(join(root, 'style.css'), 'body{}')
    expect(collectSourceCode(root).detectedStacks).toEqual([])
  })
})
