import { type ChildProcess, spawn } from 'node:child_process'
import { closeSync, mkdirSync, openSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createLogger } from '../core/logger.js'
import type { ClientTarget } from './discoverClients.js'

const logger = createLogger('research-all')
const TSX_BIN = join('node_modules', '.bin', 'tsx')
const RESEARCH_ENTRY = join('src', 'cli', 'research.ts')

export interface ClientRunResult {
  readonly slug: string
  readonly domain: string
  readonly exitCode: number
  readonly logPath: string
}

/** `runClient`'a geçirilecek çocuk süreç komutu — spawn'dan ayrı, saf: testte doğrulanır. */
export const buildSpawnArgs = (target: ClientTarget): { readonly command: string; readonly args: readonly string[] } => ({
  command: TSX_BIN,
  args: [RESEARCH_ENTRY, '--config', target.configPath],
})

/** Bir müşteri koşusunu tetikleyen fonksiyon imzası — `spawnClient` gerçek, testte sahtesi geçirilir. */
export type ClientRunner = (target: ClientTarget) => Promise<ClientRunResult>

/**
 * Tek bir müşteriyi çocuk süreç olarak çalıştırır; stdout/stderr doğrudan log dosyasına
 * yönlendirilir (bkz. `target.logPath` — discoverClients.ts, tarih + slug içerir).
 * `logger.ts`'e HİÇ dokunulmaz: mimari karar, dosya loglamayı süreç-dışı I/O ile çözer.
 *
 * BU MODÜL bilerek `main()`/`void main()` İÇERMEZ — yalnız `researchAll.ts` (ince giriş
 * noktası) çağırır. research.ts/researchPipeline.ts ayrımıyla aynı desen: gerçek çocuk
 * süreç başlatan kod test dosyasından import edilebilir bir modülde yaşarsa, o dosyayı
 * import etmek (testte olduğu gibi) yan etki olarak gerçek bir araştırma koşusunu
 * TETİKLER — fiilen yaşandı (bu commit bu hatanın düzeltmesidir).
 */
export const spawnClient = (target: ClientTarget): Promise<ClientRunResult> =>
  new Promise((resolve) => {
    mkdirSync(dirname(target.logPath), { recursive: true })
    const fd = openSync(target.logPath, 'a')
    const { command, args } = buildSpawnArgs(target)

    let child: ChildProcess
    try {
      child = spawn(command, args, { stdio: ['ignore', fd, fd] })
    } catch (cause) {
      closeSync(fd)
      logger.error(`${target.domain} başlatılamadı.`, cause)
      resolve({ slug: target.slug, domain: target.domain, exitCode: 1, logPath: target.logPath })
      return
    }

    const finish = (exitCode: number): void => {
      closeSync(fd)
      resolve({ slug: target.slug, domain: target.domain, exitCode, logPath: target.logPath })
    }
    child.on('close', (code) => finish(code ?? 1))
    child.on('error', (cause) => {
      logger.error(`${target.domain} çalıştırılırken hata oluştu.`, cause)
      finish(1)
    })
  })

/**
 * Müşterileri SIRALI işler (paralel değil — nezaket + Lighthouse maliyeti, bkz. plan
 * "Kapsam dışı"). Bir müşterinin sıfır-olmayan çıkış kodu diğerlerini durdurmaz.
 *
 * `runClient` enjekte edilir: gerçek çocuk-süreç I/O'su `spawnClient`, testte sahte bir
 * çalıştırıcıyla (repo'nun `resolveCliPaths(argv, readDomain)` deseniyle aynı) doğrulanır.
 */
export const runAllClients = async (
  targets: readonly ClientTarget[],
  runClient: ClientRunner = spawnClient,
): Promise<readonly ClientRunResult[]> => {
  const results: ClientRunResult[] = []
  for (const target of targets) {
    logger.info(`${target.domain} işleniyor...`)
    const result = await runClient(target)
    logger.info(`${target.domain} bitti — çıkış kodu ${result.exitCode} (log: ${result.logPath})`)
    results.push(result)
  }
  return results
}

/** Konsol özeti — saf, test edilir. */
export const formatSummary = (results: readonly ClientRunResult[]): string => {
  const succeeded = results.filter((result) => result.exitCode === 0)
  const failed = results.filter((result) => result.exitCode !== 0)
  const lines = [
    `Toplam ${results.length} müşteri: ${succeeded.length} başarılı, ${failed.length} başarısız.`,
    ...results.map((result) => `  ${result.exitCode === 0 ? '✓' : '✗'} ${result.domain} (${result.slug}) — log: ${result.logPath}`),
  ]
  return lines.join('\n')
}
