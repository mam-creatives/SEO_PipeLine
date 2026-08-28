import { describe, expect, test } from 'vitest'
import { parseSitemapXml } from './crawlSitemapParser.js'

describe('parseSitemapXml', () => {
  test('urlset içindeki <loc> adreslerini çıkarır', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://mamcreatives.com/</loc></url>
        <url><loc>https://mamcreatives.com/hakkimizda</loc></url>
      </urlset>`
    expect(parseSitemapXml(xml)).toEqual(['https://mamcreatives.com/', 'https://mamcreatives.com/hakkimizda'])
  })

  test('sitemap index (nested <sitemap><loc>) adreslerini de çıkarır', () => {
    const xml = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>https://mamcreatives.com/sitemap-pages.xml</loc></sitemap>
      </sitemapindex>`
    expect(parseSitemapXml(xml)).toEqual(['https://mamcreatives.com/sitemap-pages.xml'])
  })

  test('CDATA sarmalı <loc> içeriğini düz metin olarak çıkarır', () => {
    const xml = `<urlset><url><loc><![CDATA[https://mamcreatives.com/bloglar]]></loc></url></urlset>`
    expect(parseSitemapXml(xml)).toEqual(['https://mamcreatives.com/bloglar'])
  })

  test('boş/bozuk XML boş dizi döner, hata fırlatmaz', () => {
    expect(parseSitemapXml('')).toEqual([])
    expect(parseSitemapXml('bu xml değil')).toEqual([])
  })
})
