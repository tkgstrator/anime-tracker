import { z } from 'zod'

export const ProviderTypeEnum = z.enum(['amazon', 'hulu'])
export const FetchCategoryEnum = z.enum(['new_episode', 'expiring'])

const FetchMessageBodySchema = z.object({
  provider: ProviderTypeEnum,
  category: FetchCategoryEnum
})

const UpdateMessageBodySchema = z.object({
  contentId: z.string().nonempty(),
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

export const MessageSchema = z.discriminatedUnion('type', [FetchMessageSchema, UpdateMessageSchema])
export type Message = z.infer<typeof MessageSchema>
