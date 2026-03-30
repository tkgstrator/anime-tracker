import type { AnimeListQuerySchema } from '../schemas/anime.dto'

const EXCLUSIVE_SUBQUERY =
  'SELECT anilist_id FROM anime WHERE is_identified = 1 GROUP BY anilist_id HAVING COUNT(DISTINCT provider) > 1'

const SELECT_COLUMNS = [
  'id',
  'title',
  'description',
  'provider',
  'content_id AS contentId',
  'entity_type AS entityType',
  'maturity_rating AS maturityRating',
  'image_url AS imageUrl',
  'year',
  'quarter',
  'is_identified AS isIdentified',
  'status',
  'anilist_id AS aniListId',
  'badge',
  'next_episode_date AS nextEpisodeDate',
  'expired_at AS expiredAt',
  'expiring_season AS expiringSeason',
  'scheduled',
  'recorded',
  'created_at AS createdAt',
  'updated_at AS updatedAt'
].join(', ')

type ExclusiveFilterParams = Pick<
  AnimeListQuerySchema,
  | 'provider'
  | 'year'
  | 'quarter'
  | 'status'
  | 'scheduled'
  | 'recorded'
  | 'q'
  | 'badge'
  | 'aniListId'
  | 'sort'
  | 'order'
  | 'exclusive'
> & { page: number; limit: number }

/**
 * 独占配信フィルター用の SQL + バインドパラメータを組み立てる。
 * Prisma の通常 API では表現できないサブクエリを使うため、
 * $queryRawUnsafe に渡す形で返す。
 */
export function buildExclusiveQuery(params: ExclusiveFilterParams) {
  const {
    provider,
    year,
    quarter,
    status,
    scheduled,
    recorded,
    q,
    badge,
    aniListId,
    sort,
    order,
    exclusive,
    page,
    limit
  } = params

  const conditions: string[] = ['is_identified = 1']
  const binds: (string | number)[] = []

  if (provider) {
    conditions.push('provider = ?')
    binds.push(provider)
  }
  if (year) {
    conditions.push('year = ?')
    binds.push(year)
  }
  if (quarter != null) {
    conditions.push('quarter = ?')
    binds.push(quarter)
  }
  if (status) {
    conditions.push('status = ?')
    binds.push(status)
  }
  if (scheduled != null) {
    conditions.push('scheduled = ?')
    binds.push(scheduled ? 1 : 0)
  }
  if (recorded != null) {
    conditions.push('recorded = ?')
    binds.push(recorded ? 1 : 0)
  }
  if (q) {
    conditions.push('title LIKE ?')
    binds.push(`%${q}%`)
  }
  if (badge) {
    conditions.push('badge = ?')
    binds.push(badge)
  }
  if (aniListId) {
    conditions.push('anilist_id = ?')
    binds.push(aniListId)
  }

  conditions.push(exclusive ? `anilist_id NOT IN (${EXCLUSIVE_SUBQUERY})` : `anilist_id IN (${EXCLUSIVE_SUBQUERY})`)

  const whereSql = conditions.join(' AND ')
  const orderCol = sort === 'year' ? 'year' : sort === 'updatedAt' ? 'updated_at' : 'title'
  const orderDir = order === 'desc' ? 'DESC' : 'ASC'
  const offset = (page - 1) * limit

  return {
    countSql: `SELECT COUNT(*) as cnt FROM anime WHERE ${whereSql}`,
    countBinds: binds,
    dataSql: `SELECT ${SELECT_COLUMNS} FROM anime WHERE ${whereSql} ORDER BY ${orderCol} ${orderDir} LIMIT ? OFFSET ?`,
    dataBinds: [...binds, limit, offset]
  }
}
