type LogEntry = Record<string, unknown> & { level?: string }

let buffer: LogEntry[] | null = null

export const logger = {
  info(data: Record<string, unknown>) {
    console.log(JSON.stringify(data))
    buffer?.push({ ...data, level: 'info' })
  },
  warn(data: Record<string, unknown>) {
    console.warn(JSON.stringify(data))
    buffer?.push({ ...data, level: 'warn' })
  },
  error(data: Record<string, unknown>) {
    console.error(JSON.stringify(data))
    buffer?.push({ ...data, level: 'error' })
  },
  startCapture() {
    buffer = []
  },
  stopCapture(): LogEntry[] {
    const entries = buffer ?? []
    buffer = null
    return entries
  }
}
