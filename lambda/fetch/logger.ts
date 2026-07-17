/**
 * Lambda 全体で共有する logtape ロガー。
 * setupLogger() は index.ts (Lambda entry) で 1 度だけ呼ばれる。
 * 各モジュールはこの logger を import して構造化ログを吐く。
 */
import { getAppLogger } from '../../src/lib/logger'

export const logger = getAppLogger('lambda-fetch')
