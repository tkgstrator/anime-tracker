export const queryKeys = {
  anime: {
    all: ['anime'] as const,
    list: (filters: Record<string, unknown>) => ['anime', 'list', filters] as const,
    detail: (id: string) => ['anime', 'detail', id] as const
  },
  home: {
    data: ['home'] as const
  },
  nagisa: {
    status: ['nagisa', 'status'] as const
  }
}
