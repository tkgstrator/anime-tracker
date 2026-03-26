import { z } from 'zod'
import { ProviderTypeEnum } from './message.dto'

export const RecordStatusEnum = z.enum(['pending', 'downloading', 'completed', 'failed'])

export const WebhookErrorSchema = z.object({
  status: z.string(),
  message: z.string()
})

export const RecordStatusWebhookSchema = z
  .object({
    provider: ProviderTypeEnum,
    content_id: z.string().nonempty(),
    episode_id: z.string().nullable(),
    status: RecordStatusEnum,
    error: WebhookErrorSchema.optional()
  })
  .refine((d) => d.status !== 'failed' || d.error !== undefined, {
    message: 'error is required when status is failed',
    path: ['error']
  })

export type RecordStatusWebhook = z.infer<typeof RecordStatusWebhookSchema>
