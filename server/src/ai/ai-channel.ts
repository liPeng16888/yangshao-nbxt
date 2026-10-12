import type { Prisma } from '@prisma/client'

// Server-only context; it can never be supplied in a chat request by the model/user.
export interface AiChannelContext {
  assertCurrent: (transaction?: Prisma.TransactionClient) => Promise<void>
  // Explicit server-side selection. Never accepted from an HTTP/model request body.
  selectedOwnerIds?: readonly string[]
  audit: Prisma.InputJsonObject
}
