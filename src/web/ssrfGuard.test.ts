import { describe, expect, test } from 'vitest'
import { isPrivateAddress } from './ssrfGuard.js'

describe('isPrivateAddress', () => {
  test('loopback (127.0.0.1) özel sayılır', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true)
  })

  test('IPv6 loopback (::1) özel sayılır', () => {
    expect(isPrivateAddress('::1')).toBe(true)
  })

  test('RFC1918 özel aralıklar (10.x, 172.16-31.x, 192.168.x) özel sayılır', () => {
    expect(isPrivateAddress('10.0.0.1')).toBe(true)
    expect(isPrivateAddress('172.16.5.5')).toBe(true)
    expect(isPrivateAddress('172.31.255.255')).toBe(true)
    expect(isPrivateAddress('192.168.1.1')).toBe(true)
  })

  // Dış denetim bulgusu (2026-09-02) — bulut metadata servisleri (AWS/GCP/Azure) bu
  // link-local aralıkta yaşıyor; bir SSRF saldırganının en sık hedeflediği adres.
  test('link-local / bulut metadata (169.254.169.254) özel sayılır', () => {
    expect(isPrivateAddress('169.254.169.254')).toBe(true)
  })

  test('IPv6 unique-local (fc00::/7) ve link-local (fe80::/10) özel sayılır', () => {
    expect(isPrivateAddress('fc00::1')).toBe(true)
    expect(isPrivateAddress('fd12:3456:789a::1')).toBe(true)
    expect(isPrivateAddress('fe80::1')).toBe(true)
  })

  test('IPv4-mapped IPv6 (::ffff:127.0.0.1) gömülü IPv4\'e göre değerlendirilir', () => {
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true)
    expect(isPrivateAddress('::ffff:8.8.8.8')).toBe(false)
  })

  test('CGNAT (100.64.0.0/10) ve multicast/reserved özel sayılır', () => {
    expect(isPrivateAddress('100.64.0.1')).toBe(true)
    expect(isPrivateAddress('224.0.0.1')).toBe(true)
    expect(isPrivateAddress('240.0.0.1')).toBe(true)
  })

  test('gerçek kamuya açık IP\'ler özel SAYILMAZ', () => {
    expect(isPrivateAddress('8.8.8.8')).toBe(false)
    expect(isPrivateAddress('1.1.1.1')).toBe(false)
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false) // Cloudflare DNS IPv6
  })

  test('ne IPv4 ne IPv6 olan bir string "emin değilsen reddet" ile özel sayılır', () => {
    expect(isPrivateAddress('bu-bir-ip-degil')).toBe(true)
  })
})
