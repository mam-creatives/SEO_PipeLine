import { afterEach, describe, expect, test, vi } from 'vitest'
import { createGscAuth } from './gscAuth.js'

const sitesResponse = (siteEntry: readonly { siteUrl: string }[]): Response =>
  new Response(JSON.stringify({ siteEntry }), { status: 200 })

afterEach(() => {
  vi.unstubAllGlobals()
})

// Dış denetim bulgusu (2026-08-31) — resolveSiteUrl her çağrıda /sites'ı yeniden çekiyordu;
// tek koşuda 1 (searchAnalytics) + N (URL Inspection, auditUrl başına) = 4-5 GEREKSİZ GET.
// `resolveSiteUrl` bir jeton (`token`) parametresi alır — imzalama/getAccessToken'a hiç
// girmez, bu yüzden burada gerçek bir RSA anahtarına gerek yok.
describe('createGscAuth resolveSiteUrl cache', () => {
  test('/sites yalnız İLK çağrıda çekilir, sonraki resolveSiteUrl çağrıları cache kullanır', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sitesResponse([{ siteUrl: 'sc-domain:ornek.com' }]))
    vi.stubGlobal('fetch', fetchMock)
    const auth = createGscAuth('svc@ornek.iam.gserviceaccount.com', 'test-key')

    await auth.resolveSiteUrl('token-1', 'ornek.com')
    await auth.resolveSiteUrl('token-1', 'https://ornek.com/urun/bot')
    await auth.resolveSiteUrl('token-1', 'https://www.ornek.com/hakkimizda')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('farklı domain/URL girdileri aynı önbelleğe alınmış listeye karşı doğru eşleşir', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sitesResponse([{ siteUrl: 'sc-domain:ornek.com' }]))
    vi.stubGlobal('fetch', fetchMock)
    const auth = createGscAuth('svc@ornek.iam.gserviceaccount.com', 'test-key')

    const first = await auth.resolveSiteUrl('token-1', 'ornek.com')
    const second = await auth.resolveSiteUrl('token-1', 'https://www.ornek.com/urun/bot')

    expect(first.ok && first.value).toBe('sc-domain:ornek.com')
    expect(second.ok && second.value).toBe('sc-domain:ornek.com')
  })

  test('/sites çağrısı başarısız olursa ÖNBELLEĞE ALINMAZ — bir sonraki çağrı yeniden dener', async () => {
    // fetchWithRetry varsayılan 3 denemeyle 500'de tükeniyor — ilk resolveSiteUrl başarısız olmalı.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(sitesResponse([{ siteUrl: 'sc-domain:ornek.com' }]))
    vi.stubGlobal('fetch', fetchMock)
    const auth = createGscAuth('svc@ornek.iam.gserviceaccount.com', 'test-key')

    const failed = await auth.resolveSiteUrl('token-1', 'ornek.com')
    expect(failed.ok).toBe(false)

    const succeeded = await auth.resolveSiteUrl('token-1', 'ornek.com')
    expect(succeeded.ok).toBe(true)
  })

  test('mülk bulunamazsa erişilebilir mülkleri listeleyen hata döner', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sitesResponse([{ siteUrl: 'sc-domain:baska.com' }]))
    vi.stubGlobal('fetch', fetchMock)
    const auth = createGscAuth('svc@ornek.iam.gserviceaccount.com', 'test-key')

    const result = await auth.resolveSiteUrl('token-1', 'ornek.com')

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.message).toContain('sc-domain:baska.com')
  })
})
