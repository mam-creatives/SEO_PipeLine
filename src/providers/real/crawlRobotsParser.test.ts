import { describe, expect, test } from 'vitest'
import { parseRobotsTxt } from './crawlRobotsParser.js'

const ROBOTS_URL = 'https://mamcreatives.com/robots.txt'

describe('parseRobotsTxt', () => {
  test('Disallow edilen path için isAllowed false döner', () => {
    const rules = parseRobotsTxt('User-agent: *\nDisallow: /wp-admin/\n', ROBOTS_URL)
    expect(rules.isAllowed('https://mamcreatives.com/wp-admin/')).toBe(false)
    expect(rules.isAllowed('https://mamcreatives.com/hakkimizda')).toBe(true)
  })

  test('robots.txt boşsa (ya da 404 gövdesiyse) her şeye izin verir', () => {
    const rules = parseRobotsTxt('', ROBOTS_URL)
    expect(rules.isAllowed('https://mamcreatives.com/herhangi-bir-sayfa')).toBe(true)
  })

  test('Sitemap: satırlarını toplar', () => {
    const rules = parseRobotsTxt('User-agent: *\nSitemap: https://mamcreatives.com/sitemap.xml\n', ROBOTS_URL)
    expect(rules.sitemaps).toEqual(['https://mamcreatives.com/sitemap.xml'])
  })

  test('wildcard (*) desenini destekler', () => {
    const rules = parseRobotsTxt('User-agent: *\nDisallow: /*.pdf$\n', ROBOTS_URL)
    expect(rules.isAllowed('https://mamcreatives.com/dosya.pdf')).toBe(false)
    expect(rules.isAllowed('https://mamcreatives.com/dosya.pdf?x=1')).toBe(true)
  })
})
