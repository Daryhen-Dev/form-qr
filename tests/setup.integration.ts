/**
 * Integration test setup.
 * Uses the TEST_DATABASE_URL to connect to the dedicated test database (form_qr_test).
 * Truncates all tables before each test to ensure isolation.
 *
 * Prerequisites:
 *   1. Create the test database manually:
 *      docker exec form-qr-db psql -U formqr -d form_qr -c "CREATE DATABASE form_qr_test;"
 *   2. Apply migrations:
 *      pnpm db:deploy  (with DATABASE_URL pointing to form_qr_test, or run:
 *      $env:DATABASE_URL="postgresql://formqr:formqr@localhost:5433/form_qr_test"; pnpm db:deploy)
 */
import { afterAll, beforeEach, vi } from 'vitest'

// Mock server-only so backend modules work in Node.js test environment
vi.mock('server-only', () => ({}))
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is not set. Integration tests require a dedicated test database.'
  )
}

const adapter = new PrismaPg({ connectionString: testDatabaseUrl })
const prisma = new PrismaClient({ adapter })

beforeEach(async () => {
  // Truncate all tables and restart identity sequences between tests
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "AuditLog" RESTART IDENTITY CASCADE'
  )
})

afterAll(async () => {
  await prisma.$disconnect()
})
