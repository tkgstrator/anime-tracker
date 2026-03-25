import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_errors/$statusCode/')({
  loader: ({ params }) => {
    const code = Number(params.statusCode)
    const error = new Error(`テスト用エラー (${code})`)
    Object.assign(error, { status: code })
    throw error
  }
})
