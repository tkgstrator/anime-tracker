export const queryKeys = {
  anime: {
    all: ['anime'] as const,
    list: (filters: Record<string, unknown>) => ['anime', 'list', filters] as const,
    badged: ['anime', 'badged'] as const,
    detail: (id: string) => ['anime', 'detail', id] as const
  },
  nagisa: {
    status: ['nagisa', 'status'] as const
  },
  changelog: ['changelog'] as const,
  admin: {
    unidentified: (filters: Record<string, unknown>) => ['admin', 'unidentified', filters] as const
  }
}
