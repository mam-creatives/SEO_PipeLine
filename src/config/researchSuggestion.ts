import { z } from 'zod'
import { ProviderError, summarizeZodError } from '../core/errors.js'
import { err, ok, type Result } from '../core/result.js'
import type { CrawledPage } from '../core/types.js'

const RESEARCH_MODEL_LABEL = 'gemini-research'

export interface ResearchSuggestion {
  readonly brandName: string
  readonly brandTokens: readonly string[]
  readonly seedKeywords: readonly string[]
  readonly seedCompetitors: readonly string[]
  readonly aiQueries: readonly string[]
}

/**
 * `seedCompetitors` BİLEREK zorunlu değil, boş dizi kabul edilir — kullanıcı Gemini'nin
 * emin olmadığında rakip UYDURMASINDANSA boş dönmesini tercih etti (bkz. prompt'taki
 * "emin değilsen boş dizi döndür" talimatı); şema bunu reddetmemeli.
 */
const ResearchSuggestionSchema = z.object({
  brandName: z.string().min(1),
  brandTokens: z.array(z.string().min(1)).min(1),
  seedKeywords: z.array(z.string().min(1)).min(1),
  seedCompetitors: z.array(z.string().min(1)).default([]),
  aiQueries: z.array(z.string().min(1)).default([]),
})

/** Sayfa gövdesi binlerce karakter olabilir — Gemini'ye tam metni değil, ilk N karakteri veririz. */
const BODY_EXCERPT_LENGTH = 1500

/**
 * `initClient.ts --research`'ün Gemini'ye gönderdiği tek istem. Türkiye pazarına özgü
 * (bkz. README "aiQueries içine markanın adını koyma" ve "seedCompetitors otomatik
 * keşifle aynı işi yapmaz" rehberleri) — model bu ikisini de bilerek uygulaması için
 * açıkça yönlendiriliyor. `seedCompetitors` için "emin değilsen boş döndür" talimatı
 * hallüsinasyon riskini azaltır ama SIFIRLAMAZ — initClient.ts çıktısında kullanıcıya
 * bu alanı özellikle doğrulaması hatırlatılır.
 */
export const buildResearchPrompt = (domain: string, page: CrawledPage): string => {
  const h1Label = page.h1s.length > 0 ? page.h1s.join(', ') : '(yok)'
  const bodyExcerpt = page.bodyText.slice(0, BODY_EXCERPT_LENGTH) || '(boş)'
  return `Sen bir SEO danışmanısın. Aşağıdaki web sitesinin ana sayfasından çıkarılan bilgilere
bakarak Türkiye pazarına yönelik bir SEO araştırma başlangıcı hazırla.

Domain: ${domain}
Sayfa başlığı: ${page.title ?? '(yok)'}
Meta açıklama: ${page.metaDescription ?? '(yok)'}
Başlıklar (H1): ${h1Label}
Sayfa metni (özet): ${bodyExcerpt}

SADECE aşağıdaki alanları içeren geçerli bir JSON nesnesi döndür, başka hiçbir metin/açıklama ekleme:

{
  "brandName": "Markanın yazılı hali, ör. 'MAM Creatives'",
  "brandTokens": ["marka adının AI cevaplarında geçebilecek 2-4 varyantı, küçük harf"],
  "seedKeywords": ["Türkçe, bu işletmenin hedeflemesi gereken 8-12 arama sorgusu — ürün/hizmet odaklı + markanın kendi adı dahil"],
  "seedCompetitors": ["Bu işletmeyle GERÇEKTEN aynı pazarda (Türkiye) rekabet eden, SENİN BİLDİĞİN 3-5 gerçek rakip domain — emin değilsen boş dizi döndür, UYDURMA"],
  "aiQueries": ["Potansiyel bir müşterinin ChatGPT/Gemini'ye sorabileceği, MARKANIN ADINI İÇERMEYEN 3 doğal soru"]
}`
}

/** Gemini `responseMimeType: application/json` istense de bazen \`\`\`json çitiyle sarabiliyor — en iyi çaba temizlik. */
const stripJsonFence = (text: string): string => {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  return (fenced?.[1] ?? text).trim()
}

/**
 * Gemini'nin ham metin cevabını (`AiAnswer.text`) doğrulanmış bir `ResearchSuggestion`'a
 * çevirir. Saf fonksiyon — ağ çağrısından ayrı test edilir. Hem "geçersiz JSON" hem
 * "JSON ama beklenen şemaya uymuyor" durumlarını ayrı, açık mesajlarla ProviderError'a çevirir.
 */
export const parseResearchSuggestion = (rawText: string): Result<ResearchSuggestion, ProviderError> => {
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(stripJsonFence(rawText))
  } catch (cause) {
    return err(new ProviderError(RESEARCH_MODEL_LABEL, 'Gemini yanıtı geçerli JSON değil.', { cause }))
  }

  const validated = ResearchSuggestionSchema.safeParse(parsedJson)
  if (!validated.success) {
    return err(
      new ProviderError(RESEARCH_MODEL_LABEL, `Gemini önerisi beklenen şemaya uymuyor: ${summarizeZodError(validated.error.issues)}`),
    )
  }
  return ok(validated.data)
}
