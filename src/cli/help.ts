/**
 * Dış denetim bulgusu (2026-08-31, Faz C) — hiçbir CLI komutunda `--help` yoktu. Ortak
 * bayrak algılama burada; kullanım metni her komutun kendi dosyasında kalır (`rum.ts`'in
 * zaten sahip olduğu `printUsage` deseniyle aynı ruh — komut başına anlamlı farklı metin).
 */
export const hasHelpFlag = (argv: readonly string[]): boolean => argv.includes('--help') || argv.includes('-h')
