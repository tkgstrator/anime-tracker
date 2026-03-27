import {
  configureSync,
  getConsoleSink,
  getJsonLinesFormatter,
  getLogger,
  type LogRecord,
  type Sink
} from '@logtape/logtape'

type LogEntry = Record<string, unknown> & { level?: string }

let buffer: LogEntry[] | null = null

/** ログをバッファに蓄積する Sink（デバッグ用レスポンス返却向け） */
const captureSink: Sink = (record: LogRecord): void => {
  if (!buffer) return
  const props = { ...record.properties }
  const msg = record.message.filter((m) => typeof m === 'string').join('')
  if (msg) props.message = msg
  buffer.push({ ...props, level: record.level })
}

/** LogTape を初期化する。Worker のエントリポイントで一度だけ呼ぶ。 */
export function setupLogger(): void {
  configureSync({
    reset: true,
    sinks: {
      console: getConsoleSink({ formatter: getJsonLinesFormatter() }),
      capture: captureSink
    },
    loggers: [
      {
        category: ['app'],
        lowestLevel: 'debug',
        sinks: ['console', 'capture']
      }
    ]
  })
}

/** キャプチャ開始: 以降のログをバッファに蓄積する */
export function startCapture(): void {
  buffer = []
}

/** キャプチャ停止: 蓄積されたログを返しバッファをクリアする */
export function stopCapture(): LogEntry[] {
  const entries = buffer ?? []
  buffer = null
  return entries
}

/** アプリケーション用ロガーを取得する */
export function getAppLogger(category: string) {
  return getLogger(['app', category])
}
