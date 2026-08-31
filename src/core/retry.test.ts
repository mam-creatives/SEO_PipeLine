import { afterEach, describe, expect, test, vi } from 'vitest'
import { fetchWithRetry } from './retry.js'

/** Testlerde gerçek gecikmeyi önlemek için minik baseDelayMs kullanılır — fake timer'lara gerek yok. */
const FAST_RETRY_OPTIONS = { maxAttempts: 3, baseDelayMs: 1 }

const jsonResponse = (status: number, headers: Record<string, string> = {}): Response =>
  new Response('{}', { status, headers })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchWithRetry', () => {
  test('ilk denemede 2xx dönerse tek seferde başarılı olur, yeniden denemez', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200))
    vi.stubGlobal('fetch', fetchMock)

    const response = await fetchWithRetry('https://example.test/', () => ({}), FAST_RETRY_OPTIONS)

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('404 gibi kalıcı hatalarda YENİDEN DENEMEZ — hemen döner', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404))
    vi.stubGlobal('fetch', fetchMock)

    const response = await fetchWithRetry('https://example.test/', () => ({}), FAST_RETRY_OPTIONS)

    expect(response.status).toBe(404)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('401 de yeniden denenmez (kimlik hatası geçici değil)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401))
    vi.stubGlobal('fetch', fetchMock)

    await fetchWithRetry('https://example.test/', () => ({}), FAST_RETRY_OPTIONS)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('429 sonra 200 gelirse yeniden dener ve başarılı sonucu döner', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(429)).mockResolvedValueOnce(jsonResponse(200))
    vi.stubGlobal('fetch', fetchMock)

    const response = await fetchWithRetry('https://example.test/', () => ({}), FAST_RETRY_OPTIONS)

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('500 sonra 200 gelirse yeniden dener', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(503)).mockResolvedValueOnce(jsonResponse(200))
    vi.stubGlobal('fetch', fetchMock)

    const response = await fetchWithRetry('https://example.test/', () => ({}), FAST_RETRY_OPTIONS)

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('Retry-After başlığına saygı gösterir', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(429, { 'retry-after': '0' })).mockResolvedValueOnce(jsonResponse(200))
    vi.stubGlobal('fetch', fetchMock)
    const start = Date.now()

    const response = await fetchWithRetry('https://example.test/', () => ({}), { maxAttempts: 3, baseDelayMs: 5000 })

    // Retry-After: 0 verilmişse 5000ms'lik varsayılan backoff'u BEKLEMEMELİ.
    expect(Date.now() - start).toBeLessThan(1000)
    expect(response.status).toBe(200)
  })

  test('tüm denemeler tükenirse SON başarısız yanıtı döner (throw etmez)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500))
    vi.stubGlobal('fetch', fetchMock)

    const response = await fetchWithRetry('https://example.test/', () => ({}), FAST_RETRY_OPTIONS)

    expect(response.status).toBe(500)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  test('ağ hatası (fetch throw) sonra başarılı olursa yeniden dener', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('network error')).mockResolvedValueOnce(jsonResponse(200))
    vi.stubGlobal('fetch', fetchMock)

    const response = await fetchWithRetry('https://example.test/', () => ({}), FAST_RETRY_OPTIONS)

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('ağ hatası tüm denemelerde sürerse SON hatayı fırlatır', async () => {
    const persistentError = new TypeError('network error')
    const fetchMock = vi.fn().mockRejectedValue(persistentError)
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchWithRetry('https://example.test/', () => ({}), FAST_RETRY_OPTIONS)).rejects.toBe(persistentError)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  // BLOKER olabilecek bir sınıf hata: AbortSignal.timeout() oluşturulduğu anda saymaya
  // başlar — initFactory HER denemede yeniden çağrılmazsa ikinci deneme "önceden ateşlenmiş"
  // bir sinyal kullanabilir. Bu test initFactory'nin deneme başına bir kez çağrıldığını kilitler.
  test('initFactory her deneme için yeniden çağrılır (taze AbortSignal için)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(503)).mockResolvedValueOnce(jsonResponse(200))
    vi.stubGlobal('fetch', fetchMock)
    const initFactory = vi.fn(() => ({ headers: { 'x-attempt': String(initFactory.mock.calls.length) } }))

    await fetchWithRetry('https://example.test/', initFactory, FAST_RETRY_OPTIONS)

    expect(initFactory).toHaveBeenCalledTimes(2)
  })

  test('varsayılan seçeneklerle (options verilmeden) çalışır', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200))
    vi.stubGlobal('fetch', fetchMock)

    const response = await fetchWithRetry('https://example.test/', () => ({}))

    expect(response.status).toBe(200)
  })
})
