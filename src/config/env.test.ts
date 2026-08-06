import { describe, expect, test } from 'vitest'
import { parseEnvFile, unquoteEnvValue } from './env.js'

describe('unquoteEnvValue', () => {
  test('tırnaksız değer olduğu gibi kalır', () => {
    expect(unquoteEnvValue('abc123')).toBe('abc123')
  })

  test('çift tırnak soyulur', () => {
    expect(unquoteEnvValue('"abc123"')).toBe('abc123')
  })

  test('tek tırnak soyulur ama kaçış çözülmez (kabuk davranışı)', () => {
    expect(unquoteEnvValue("'a\\nb'")).toBe('a\\nb')
  })

  test('çift tırnaklı değerde \\n gerçek satır sonuna çevrilir', () => {
    expect(unquoteEnvValue('"a\\nb"')).toBe('a\nb')
  })

  test('kaçırılmış ters bölü tek geçişte doğru çözülür', () => {
    // "\\n" = kaçırılmış ters bölü + n → satır sonu DEĞİL, "\n" metni
    expect(unquoteEnvValue('"a\\\\nb"')).toBe('a\\nb')
  })

  test('tanınmayan kaçış olduğu gibi bırakılır', () => {
    expect(unquoteEnvValue('"a\\qb"')).toBe('a\\qb')
  })

  test('tek tırnak karakteri tek başına değeri bozmaz', () => {
    expect(unquoteEnvValue('"')).toBe('"')
  })
})

describe('parseEnvFile', () => {
  test('yorum ve boş satırlar atlanır', () => {
    expect(parseEnvFile('# yorum\n\nA=1\n')).toEqual({ A: '1' })
  })

  test('değerdeki = işareti korunur (ilk = ayırıcıdır)', () => {
    expect(parseEnvFile('TOKEN=abc=def==')['TOKEN']).toBe('abc=def==')
  })

  test('boş değer boş string olur — şema bunu "yok" sayar', () => {
    expect(parseEnvFile('SERPAPI_KEY=')['SERPAPI_KEY']).toBe('')
  })

  test('çok satırlı PEM anahtarı gerçek satır sonlarıyla geri gelir', () => {
    // Gerçek anahtar değil, yapıyı temsil eden sentetik örnek
    const line = 'GSC_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nSAHTEANAHTAR\\n-----END PRIVATE KEY-----\\n"'
    const value = parseEnvFile(line)['GSC_PRIVATE_KEY'] ?? ''
    expect(value.split('\n')).toEqual([
      '-----BEGIN PRIVATE KEY-----',
      'SAHTEANAHTAR',
      '-----END PRIVATE KEY-----',
      '',
    ])
    // Düzeltme öncesi buradaki hata sessizdi: PEM tek satır kalıyor, imzalama patlıyordu.
    expect(value).not.toContain('\\n')
  })

  test('ayırıcısı olmayan satır yok sayılır', () => {
    expect(parseEnvFile('GECERSIZ_SATIR\nA=1')).toEqual({ A: '1' })
  })
})
