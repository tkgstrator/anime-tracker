import { z } from 'zod'

const ProviderTypeEnum = z.enum(['amazon', 'hulu'])

const FetchMessageBodySchema = z.object({
  provider: ProviderTypeEnum
})
export type FetchMessageBodySchema = z.infer<typeof FetchMessageBodySchema>

const UpdateMessageBodySchema = z.object({
  contentId: z.string().nonempty(),
  provider: ProviderTypeEnum
})
export type UpdateMessageBodySchema = z.infer<typeof UpdateMessageBodySchema>

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
