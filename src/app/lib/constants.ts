export const providerLabel: Record<string, string> = {
  amazon: 'Prime Video',
  hulu: 'Hulu',
  crunchyroll: 'Crunchyroll',
  abema: 'ABEMA',
  netflix: 'Netflix'
}

export const providerColor: Record<string, string> = {
  amazon: 'bg-brand-amazon text-brand-amazon-foreground',
  hulu: 'bg-brand-hulu text-brand-hulu-foreground',
  crunchyroll: 'bg-brand-crunchyroll text-brand-crunchyroll-foreground',
  abema: 'bg-brand-abema text-brand-abema-foreground',
  netflix: 'bg-brand-netflix text-brand-netflix-foreground'
}

export const statusLabel: Record<string, string> = {
  FINISHED: '完結',
  RELEASING: '放送中',
  NOT_YET_RELEASED: '未放送',
  CANCELLED: '中止',
  HIATUS: '休止'
}

export const statusColor: Record<string, string> = {
  FINISHED: 'bg-status-finished text-status-finished-foreground',
  RELEASING: 'bg-status-releasing text-status-releasing-foreground',
  NOT_YET_RELEASED: 'bg-status-not-yet text-status-not-yet-foreground',
  CANCELLED: 'bg-status-cancelled text-status-cancelled-foreground',
  HIATUS: 'bg-status-hiatus text-status-hiatus-foreground'
}
