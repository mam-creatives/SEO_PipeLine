import { lookup } from 'node:dns/promises'
import { isIPv4, isIPv6 } from 'node:net'
import { ProviderError } from '../core/errors.js'
import { err, ok, type Result } from '../core/result.js'

const PROVIDER_NAME = 'ssrf-guard'

const IPV4_PRIVATE_RANGES: readonly { readonly base: string; readonly bits: number }[] = [
  { base: '0.0.0.0', bits: 8 },
  { base: '10.0.0.0', bits: 8 },
  { base: '100.64.0.0', bits: 10 }, // CGNAT
  { base: '127.0.0.0', bits: 8 }, // loopback
  { base: '169.254.0.0', bits: 16 }, // link-local — bulut metadata servisleri burada (ör. 169.254.169.254)
  { base: '172.16.0.0', bits: 12 },
  { base: '192.0.0.0', bits: 24 },
  { base: '192.168.0.0', bits: 16 },
  { base: '198.18.0.0', bits: 15 },
  { base: '224.0.0.0', bits: 4 }, // multicast
  { base: '240.0.0.0', bits: 4 }, // reserved
]

const ipv4ToInt = (ip: string): number => ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0

const isIpv4InRange = (ip: string, base: string, bits: number): boolean => {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask)
}

const isPrivateIpv4 = (ip: string): boolean => IPV4_PRIVATE_RANGES.some((range) => isIpv4InRange(ip, range.base, range.bits))

/** IPv6 — en yaygın/kritik aralıklar: loopback, unique-local (fc00::/7), link-local (fe80::/10), IPv4-mapped. */
const isPrivateIpv6 = (ip: string): boolean => {
  const normalized = ip.toLowerCase()
  if (normalized === '::1') return true
  if (normalized.startsWith('fe80:')) return true
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized)
  return mapped?.[1] !== undefined ? isPrivateIpv4(mapped[1]) : false
}

/** Ne IPv4 ne IPv6 olarak tanınan bir adres bilerek ÖZEL sayılır — "emin değilsen reddet". */
export const isPrivateAddress = (address: string): boolean => {
  if (isIPv4(address)) return isPrivateIpv4(address)
  if (isIPv6(address)) return isPrivateIpv6(address)
  return true
}

export interface SafeDomainCheck {
  readonly domain: string
  readonly resolvedIp: string
}

/**
 * Dış denetim bulgusu (2026-09-02, Versiyon A — kamuya açık web aracı) — bugüne kadar
 * crawler/Lighthouse hedefi hep operatörün kendi girdiğiydi (güvenilir); kamuya açık
 * bir formda domain SALDIRGAN kontrollü girdi olur. Klasik SSRF: `localhost`, dahili bir
 * IP'ye çözülen bir domain, ya da bulut metadata servisi (169.254.169.254) verilip
 * crawler/Lighthouse'un bu iç kaynaklara gerçek bir istek atması sağlanabilir.
 *
 * DNS çözülür, dönen HER IP kamuya açık olmalı — biri bile özel/loopback/link-local ise
 * TÜM domain reddedilir (yalnız ilk IP'ye bakmak DNS round-robin/rebinding'e karşı
 * savunmasız bırakırdı). `liteAnalysis.ts` bu doğrulama geçmeden ne crawler ne
 * Lighthouse/PSI'yi çağırır.
 */
export const assertPublicDomain = async (domain: string): Promise<Result<SafeDomainCheck, ProviderError>> => {
  let addresses: readonly { readonly address: string; readonly family: number }[]
  try {
    addresses = await lookup(domain, { all: true })
  } catch (cause) {
    return err(new ProviderError(PROVIDER_NAME, `'${domain}' çözülemedi.`, { cause }))
  }
  if (addresses.length === 0) {
    return err(new ProviderError(PROVIDER_NAME, `'${domain}' için IP adresi bulunamadı.`))
  }

  const privateHit = addresses.find((entry) => isPrivateAddress(entry.address))
  if (privateHit !== undefined) {
    return err(new ProviderError(PROVIDER_NAME, `'${domain}' özel/yerel bir IP'ye çözülüyor (${privateHit.address}) — reddedildi.`))
  }

  return ok({ domain, resolvedIp: addresses[0]!.address })
}
