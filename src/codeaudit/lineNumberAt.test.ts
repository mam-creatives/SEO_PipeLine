import { describe, expect, test } from 'vitest'
import { lineNumberAt } from './lineNumberAt.js'

describe('lineNumberAt', () => {
  test('ilk satırdaki index 1 döner', () => {
    expect(lineNumberAt('merhaba dünya', 3)).toBe(1)
  })

  test('ikinci satırdaki index 2 döner', () => {
    const content = 'satır1\nsatır2\nsatır3'
    expect(lineNumberAt(content, content.indexOf('satır2'))).toBe(2)
  })

  test('üçüncü satırdaki index 3 döner', () => {
    const content = 'a\nb\nc'
    expect(lineNumberAt(content, content.indexOf('c'))).toBe(3)
  })

  test('index 0 için 1 döner', () => {
    expect(lineNumberAt('abc', 0)).toBe(1)
  })
})
