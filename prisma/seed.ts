import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const CEDULA_PATTERN = /^\d{6,15}$/
const BCRYPT_COST = 12

function validateCedula(variableName: string, value: string): void {
  if (!CEDULA_PATTERN.test(value)) {
    throw new Error(
      `[seed] ${variableName} must be a numeric string between 6 and 15 digits; received "${value}".`
    )
  }
}

function demoUsersEnabled(): boolean {
  const value = process.env.SEED_DEMO_USERS
  return value?.toLowerCase() === 'true' || value === '1'
}

/**
 * Idempotent local bootstrap seed.
 *
 * Admin and optional demo users use cedula as their initial password. New rows
 * require a password change; update: {} makes reruns preserve existing hashes.
 * This CLI intentionally uses bcryptjs directly and has no server-only imports.
 */
async function main(): Promise<void> {
  const adminCedula = process.env.SEED_ADMIN_CEDULA

  if (!adminCedula) {
    console.warn(
      '[seed] SEED_ADMIN_CEDULA is not set — skipping bootstrap without creating a Prisma client.'
    )
    return
  }

  const seedDemos = demoUsersEnabled()
  let secretaryCedula: string | undefined
  let employeeCedula: string | undefined

  if (seedDemos) {
    console.log('[seed] Demo users are enabled by opt-in configuration.')
    validateCedula('SEED_ADMIN_CEDULA', adminCedula)
    secretaryCedula = process.env.SEED_SECRETARY_CEDULA
    employeeCedula = process.env.SEED_EMPLOYEE_CEDULA

    if (!secretaryCedula) {
      throw new Error(
        '[seed] SEED_SECRETARY_CEDULA is required when SEED_DEMO_USERS is true or 1.'
      )
    }
    if (!employeeCedula) {
      throw new Error(
        '[seed] SEED_EMPLOYEE_CEDULA is required when SEED_DEMO_USERS is true or 1.'
      )
    }

    validateCedula('SEED_SECRETARY_CEDULA', secretaryCedula)
    validateCedula('SEED_EMPLOYEE_CEDULA', employeeCedula)

    const configuredUsers = [
      ['SEED_ADMIN_CEDULA', adminCedula],
      ['SEED_SECRETARY_CEDULA', secretaryCedula],
      ['SEED_EMPLOYEE_CEDULA', employeeCedula],
    ] as const
    const seen = new Map<string, string>()
    for (const [variableName, cedula] of configuredUsers) {
      const previousVariable = seen.get(cedula)
      if (previousVariable) {
        throw new Error(
          `[seed] Duplicate cedula value "${cedula}": ${variableName} matches ${previousVariable}.`
        )
      }
      seen.set(cedula, variableName)
    }
  } else {
    console.log('[seed] Demo users are disabled; set SEED_DEMO_USERS=true or 1 to opt in.')
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('[seed] DATABASE_URL is not set.')
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl })
  const prisma = new PrismaClient({ adapter })

  try {
    const adminPasswordHash = await bcrypt.hash(adminCedula, BCRYPT_COST)
    const admin = await prisma.user.upsert({
      where: { cedula: adminCedula },
      update: {},
      create: {
        nombres: 'Administrador',
        apellidos: 'Sistema',
        cedula: adminCedula,
        passwordHash: adminPasswordHash,
        role: 'Administrador',
        passwordChangeRequired: true,
      },
    })
    console.log(`[seed] Administrador ensured: id=${admin.id}, cedula=${adminCedula}`)

    if (seedDemos && secretaryCedula && employeeCedula) {
      const secretaryPasswordHash = await bcrypt.hash(secretaryCedula, BCRYPT_COST)
      const secretary = await prisma.user.upsert({
        where: { cedula: secretaryCedula },
        update: {},
        create: {
          nombres: 'Secretario',
          apellidos: 'Demo',
          cedula: secretaryCedula,
          passwordHash: secretaryPasswordHash,
          role: 'Secretario',
          passwordChangeRequired: true,
        },
      })
      console.log(`[seed] Secretario Demo ensured: id=${secretary.id}, cedula=${secretaryCedula}`)

      const employeePasswordHash = await bcrypt.hash(employeeCedula, BCRYPT_COST)
      const employee = await prisma.user.upsert({
        where: { cedula: employeeCedula },
        update: {},
        create: {
          nombres: 'Empleado',
          apellidos: 'Demo',
          cedula: employeeCedula,
          passwordHash: employeePasswordHash,
          role: 'Empleado',
          passwordChangeRequired: true,
        },
      })
      console.log(`[seed] Empleado Demo ensured: id=${employee.id}, cedula=${employeeCedula}`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err: unknown) => {
  console.error('[seed] Fatal error:', err)
  process.exit(1)
})
