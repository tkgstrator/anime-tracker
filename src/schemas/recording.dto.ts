import { z } from 'zod'

export const UpdateRecordingSchema = z.object({
  episodeId: z.string(),
  recorded: z.boolean()
})
export type UpdateRecordingSchema = z.infer<typeof UpdateRecordingSchema>

export const BulkUpdateRecordingSchema = z.object({
  episodeIds: z.array(z.string()).min(1),
  recorded: z.boolean()
})
export type BulkUpdateRecordingSchema = z.infer<typeof BulkUpdateRecordingSchema>
