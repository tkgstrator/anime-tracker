export const logger = {
  info(data: Record<string, unknown>) {
    console.log(JSON.stringify(data))
  },
  warn(data: Record<string, unknown>) {
    console.warn(JSON.stringify(data))
  },
  error(data: Record<string, unknown>) {
    console.error(JSON.stringify(data))
  }
}
