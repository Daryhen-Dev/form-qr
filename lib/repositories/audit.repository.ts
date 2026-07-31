import 'server-only'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

/** Parameters for recording an audit log entry. */
export interface AuditRecordInput {
  action: string
  entityType: string
  entityId: string
  metadata?: Record<string, unknown>
}

/**
 * Records an audit log entry for any state-changing operation.
 * This is the first real implementation of the Slice-1 audit path.
 * Called from the service layer after every user mutation.
 */
export async function record(input: AuditRecordInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      // Prisma 7 requires Prisma.JsonNull for explicit null on nullable JSON columns
      metadata: input.metadata !== undefined
        ? (input.metadata as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  })
}
