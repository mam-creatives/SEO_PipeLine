import { ProviderError } from '../core/errors.js'
import { err, type Result } from '../core/result.js'
import { fetchWithRetry } from '../core/retry.js'
import type { CrawledPage } from '../core/types.js'
import { buildGeminiUrl, geminiResponseToAnswer } from '../providers/real/geminiAiVisibilityProvider.js'
import { buildResearchPrompt, parseResearchSuggestion, type ResearchSuggestion } from './researchSuggestion.js'

const REQUEST_TIMEOUT_MS = 60_000
const RESEARCH_LABEL = 'gemini-research'

/**
 * `geminiAiVisibilityProvider.ts`'in `buildGeminiRequestBody`'sinden BİLEREK ayrı: GEO
 * ölçümü serbest metin cevap ister (marka geçiyor mu diye okunur), bu istek ise
 * `responseMimeType: 'application/json'` ile Gemini'yi doğrudan JSON döndürmeye zorlar —
 * çok daha güvenilir ayrıştırma (yine de `parseResearchSuggestion` \`\`\`json çitine karşı
 * savunmacı kalır, model garanti değildir).
 */
export const buildResearchRequestBody = (prompt: string): string =>
  JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 2048, responseMimeType: 'application/json' },
  })

/**
 * `initClient.ts --research` orkestrasyonu: anasayfayı çek → Gemini'ye bağlamla sor →
 * doğrulanmış öneriye çevir. `crawlPage` enjekte edilir (gerçek istek `createCrawlProvider`,
 * testte sahte) — `runAllCollectors.ts`'in `CollectorDeps` deseniyle aynı gerekçe.
 *
 * Tek bir hata sınıfı yok: sayfa çekilemezse, Gemini 4xx/5xx dönerse, ya da cevap
 * ayrıştırılamazsa hepsi aynı `Result` sözleşmesiyle `err()` döner — çağıran taraf
 * (initClient.ts) HER durumda aynı şekilde domain-tahmini iskelete düşer.
 */
export const researchDomainWithGemini = async (
  domain: string,
  apiKey: string,
  crawlPage: (url: string) => Promise<Result<CrawledPage, ProviderError>>,
): Promise<Result<ResearchSuggestion, ProviderError>> => {
  const pageResult = await crawlPage(`https://${domain}/`)
  if (!pageResult.ok) return pageResult

  const prompt = buildResearchPrompt(domain, pageResult.value)

  let response: Response
  try {
    response = await fetchWithRetry(buildGeminiUrl(apiKey), () => ({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: buildResearchRequestBody(prompt),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }))
  } catch (cause) {
    return err(new ProviderError(RESEARCH_LABEL, `${domain} için Gemini araştırma çağrısı başarısız.`, { cause }))
  }
  if (!response.ok) {
    return err(new ProviderError(RESEARCH_LABEL, `${domain} için Gemini ${response.status} döndü.`))
  }

  const answer = geminiResponseToAnswer(await response.json(), `araştırma: ${domain}`)
  if (!answer.ok) return answer

  return parseResearchSuggestion(answer.value.text)
}
