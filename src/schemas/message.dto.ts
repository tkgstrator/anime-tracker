import { z } from 'zod'

export const ProviderTypeEnum = z.enum(['amazon', 'hulu', 'crunchyroll', 'abema'])
export const FetchCategoryEnum = z.enum(['new_episode', 'coming_soon', 'expiring', 'catalog'])

const FetchMessageBodySchema = z.object({
  provider: ProviderTypeEnum,
  category: FetchCategoryEnum
})

const UpdateMessageBodySchema = z.object({
  contentId: z.string().nonempty(),
  provider: ProviderTypeEnum
})

const BulkUpdateMessageBodySchema = z.object({
  contentIds: z.array(z.string().nonempty()).nonempty(),
  provider: ProviderTypeEnum
})

export const FetchMessageSchema = z.object({
  type: z.literal('fetch'),
  message: FetchMessageBodySchema
})
export type FetchMessage = z.infer<typeof FetchMessageSchema>

export const UpdateMessageSchema = z.object({
  type: z.literal('update'),
  message: UpdateMessageBodySchema
})
export type UpdateMessage = z.infer<typeof UpdateMessageSchema>

export const BulkUpdateMessageSchema = z.object({
  type: z.literal('bulk_update'),
  message: BulkUpdateMessageBodySchema
})
export type BulkUpdateMessage = z.infer<typeof BulkUpdateMessageSchema>

export const MessageSchema = z.discriminatedUnion('type', [
  FetchMessageSchema,
  UpdateMessageSchema,
  BulkUpdateMessageSchema
])
export type Message = z.infer<typeof MessageSchema>
