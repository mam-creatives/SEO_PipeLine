import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { ProviderError } from '../../core/errors.js'
import { err, type Result } from '../../core/result.js'
import type { TechAudit } from '../../core/types.js'
import { lighthouseResultToTechAudit } from '../lighthouse/lighthouseAdapter.js'
import type { TechAuditProvider } from '../types.js'

const PROVIDER_NAME = 'lighthouse-local'
const RUN_TIMEOUT_MS = 120_000
/** Lighthouse JSON'u büyüktür (400KB+); stdout tamponu yerine dosyaya yazdırılır. */
const MAX_BUFFER_BYTES = 32 * 1024 * 1024

const execFileAsync = promisify(execFile)

/**
 * Lighthouse ALT SÜREÇTE çalıştırılır, kütüphane olarak değil.
 *
 * Sebep ölçülmüş bir davranış: Lighthouse süreç-global durum tutuyor
 * (`performance.mark` işaretleri, logger tekili). Pipeline'da diğer dallarla
 * aynı `Promise.all` içinde koşturulduğunda her denetim
 * `The "start lh:runner:gather" performance mark has not been set` hatasıyla
 * düşüyordu — tek başına aynı URL sorunsuz denetleniyorken. Süreç izolasyonu
 * bu sınıf hataları tamamen ortadan kaldırır (Lighthouse CI de böyle yapar).
 *
 * `.bin` sembolik bağı yerine CLI giriş noktası çözümlenip mevcut Node ile
 * çalıştırılır; böylece PATH ve kurulum düzeni farklarından etkilenmez.
 */
const resolveLighthouseCli = (): string => createRequire(import.meta.url).resolve('lighthouse/cli/index.js')

/** Mobil öykünme: Google sıralama sinyali olarak mobil deneyimi kullanır. */
const cliArguments = (url: string, outputPath: string): readonly string[] => [
  url,
  '--quiet',
  '--output=json',
  `--output-path=${outputPath}`,
  '--only-categories=performance,seo',
  '--form-factor=mobile',
  '--screenEmulation.mobile',
  '--chrome-flags=--headless=new --no-sandbox --disable-gpu',
]

export const createLighthouseProvider = (): TechAuditProvider => ({
  name: PROVIDER_NAME,
  isMock: false,
  auditUrl: async (url: string): Promise<Result<TechAudit, ProviderError>> => {
    let workDir: string | null = null
    try {
      workDir = await mkdtemp(join(tmpdir(), 'seo-lh-'))
      const outputPath = join(workDir, 'report.json')

      await execFileAsync(process.execPath, [resolveLighthouseCli(), ...cliArguments(url, outputPath)], {
        timeout: RUN_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER_BYTES,
      })

      const raw: unknown = JSON.parse(await readFile(outputPath, 'utf-8'))
      return lighthouseResultToTechAudit(raw, PROVIDER_NAME)
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause)
      return err(new ProviderError(PROVIDER_NAME, `'${url}' denetlenemedi: ${reason}`, { cause }))
    } finally {
      if (workDir !== null) {
        // Temizlik hatası asıl sonucu gölgelememeli.
        await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
      }
    }
  },
})
