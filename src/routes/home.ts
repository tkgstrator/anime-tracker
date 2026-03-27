import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import dayjs from 'dayjs'
import { createPrismaClient } from '../lib/db'
import { HomeDataSchema } from '../schemas/anime.dto'

type Bindings = { DB: D1Database }

const home = new OpenAPIHono<{ Bindings: Bindings }>()

function getCurrentQuarter(): number {
  const month = dayjs().month()
  if (month < 3) return 0
  if (month < 6) return 1
  if (month < 9) return 2
  return 3
}

home.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Home'],
    summary: 'トップページ用データを一括取得',
    responses: {
      200: {
        description: 'トップページデータ',
        content: { 'application/json': { schema: HomeDataSchema } }
      }
    }
  }),
  async (c) => {
    const prisma = createPrismaClient(c.env.DB)
    const sevenDaysAgo = dayjs().subtract(7, 'day').toDate()
    const currentYear = dayjs().year()
    const currentQuarter = getCurrentQuarter()

    // 1回のクエリで全レコードを取得し、JS側で振り分ける
    const allAnime = await prisma.anime.findMany({
      where: { isIdentified: true },
      include: { seasons: { select: { episodes: { select: { releaseDate: true } } } } }
    })

    const recentlyUpdated = allAnime
      .filter((a) => a.seasons.some((s) => s.episodes.some((e) => e.releaseDate >= sevenDaysAgo)))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 50)
      .map(({ seasons: _, ...rest }) => rest)

    const upcoming = allAnime
      .filter((a) => a.nextEpisodeDate !== null)
      .sort((a, b) => a.nextEpisodeDate!.getTime() - b.nextEpisodeDate!.getTime())
      .slice(0, 20)
      .map(({ seasons: _, ...rest }) => rest)

    const expiring = allAnime
      .filter((a) => a.expiredAt !== null)
      .sort((a, b) => a.expiredAt!.getTime() - b.expiredAt!.getTime())
      .slice(0, 20)
      .map(({ seasons: _, ...rest }) => rest)

    const currentSeason = allAnime
      .filter((a) => a.year === currentYear && a.quarter === currentQuarter)
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, 20)
      .map(({ seasons: _, ...rest }) => rest)

    const scheduled = allAnime
      .filter((a) => a.scheduled)
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, 20)
      .map(({ seasons: _, ...rest }) => rest)

    c.header('Cache-Control', 'no-store')
    return c.json({ recentlyUpdated, upcoming, expiring, currentSeason, scheduled })
  }
)

export default home
