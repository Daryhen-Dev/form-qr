import 'server-only'
import { prisma } from '@/lib/db'

/**
 * Executes a round-trip SELECT NOW() against Postgres to prove DB liveness.
 * Returns the UTC timestamp as a Date object from the first row.
 */
export async function ping(): Promise<{ now: Date }> {
  const rows = await prisma.$queryRaw<{ now: Date }[]>`SELECT NOW() as now`
  return rows[0]
}
