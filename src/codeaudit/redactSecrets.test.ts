import { describe, expect, test } from 'vitest'
import { redactSecrets } from './redactSecrets.js'

describe('redactSecrets', () => {
  test('PHP $değişken ataması maskelenir', () => {
    const result = redactSecrets(`$db_password = 'sifre123';`)
    expect(result).toBe(`$db_password = '***REDACTED***';`)
    expect(result).not.toContain('sifre123')
  })

  test('PHP define() çağrısı maskelenir', () => {
    const result = redactSecrets(`define('PAYTR_MERCHANT_SALT', 'abc123xyz');`)
    expect(result).toBe(`define('PAYTR_MERCHANT_SALT', '***REDACTED***');`)
    expect(result).not.toContain('abc123xyz')
  })

  test('JS/TS obje anahtarı maskelenir (iki nokta üst üste)', () => {
    const result = redactSecrets(`const config = { apiKey: 'sk_live_abcdef' }`)
    expect(result).toContain(`apiKey: '***REDACTED***'`)
    expect(result).not.toContain('sk_live_abcdef')
  })

  test('çift tırnak korunur', () => {
    const result = redactSecrets(`$stripe_secret_key = "sk_test_123";`)
    expect(result).toBe(`$stripe_secret_key = "***REDACTED***";`)
  })

  test('secret-benzeri olmayan atamalara dokunmaz', () => {
    const content = `$title = 'MAM Creatives'; $brandName = "Reklam Ajansı";`
    expect(redactSecrets(content)).toBe(content)
  })

  test('satır sayısını değiştirmez — codeLocation satır numaraları bozulmamalı', () => {
    const content = ['<?php', "$db_pass = 'gizli';", 'echo "merhaba";', ''].join('\n')
    const result = redactSecrets(content)
    expect(result.split('\n').length).toBe(content.split('\n').length)
  })

  test('büyük/küçük harf duyarsız eşleşir', () => {
    const result = redactSecrets(`$DB_PASS = 'gizliSifre';`)
    expect(result).not.toContain('gizliSifre')
  })

  test('birden fazla secret aynı içerikte hepsi maskelenir', () => {
    const content = `$api_key = 'aaa'; $api_secret = 'bbb';`
    const result = redactSecrets(content)
    expect(result).not.toContain('aaa')
    expect(result).not.toContain('bbb')
  })

  test('token içeren anahtar maskelenir', () => {
    const result = redactSecrets(`$access_token = 'ya29.abc123';`)
    expect(result).not.toContain('ya29.abc123')
  })

  test('değer boşsa da güvenli şekilde işlenir', () => {
    expect(() => redactSecrets(`$password = '';`)).not.toThrow()
  })
})
