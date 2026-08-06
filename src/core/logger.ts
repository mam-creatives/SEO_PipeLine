type LogLevel = 'info' | 'warn' | 'error'

export interface Logger {
  readonly info: (message: string) => void
  readonly warn: (message: string) => void
  readonly error: (message: string, cause?: unknown) => void
}

const write = (level: LogLevel, scope: string, message: string): void => {
  const line = `[${new Date().toISOString()}] [${scope}] ${message}`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const createLogger = (scope: string): Logger => ({
  info: (message) => write('info', scope, message),
  warn: (message) => write('warn', scope, message),
  error: (message, cause) => {
    write('error', scope, message)
    if (cause !== undefined) console.error(cause)
  },
})
