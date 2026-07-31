import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

/**
 * Idempotent admin bootstrap seed.
 *
 * Creates (or upserts) the first Administrador user using the cédula from
 * the SEED_ADMIN_CEDULA environment variable. On first run, the user is
 * created with:
 *   - passwordHash = bcrypt(cedula)   — forces a password change on first login
 *   - role = Administrador
 *   - passwordChangeRequired = true
 *
 * Re-running this script is safe (upsert by cedula).
 * No hard-coded credentials — all values come from environment variables.
 */
async function main(): Promise<void> {
  const cedula = process.env.SEED_ADMIN_CEDULA

  if (!cedula) {
    console.warn(
      '[seed] SEED_ADMIN_CEDULA is not set — skipping admin bootstrap.'
    )
    return
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('[seed] DATABASE_URL is not set')
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl })
  const prisma = new PrismaClient({ adapter })

  try {
    // Use bcryptjs directly (same algorithm as password.service).
    // seed.ts is a CLI script; it cannot import 'server-only' modules.
    const passwordHash = await bcrypt.hash(cedula, 12)

    const user = await prisma.user.upsert({
      where: { cedula },
      update: {},
      create: {
        nombres: 'Administrador',
        apellidos: 'Sistema',
        cedula,
        passwordHash,
        role: 'Administrador',
        passwordChangeRequired: true,
      },
    })

    console.log(`[seed] Administrador ensured: id=${user.id}, cedula=${cedula}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error('[seed] Fatal error:', err)
  process.exit(1)
})
