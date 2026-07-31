import { describe, it, expect } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { hash as bcryptHash } from 'bcryptjs'
import { createUser, listUsers, getUser, updateUser, softDeleteUser } from '@/lib/services/user.service'
import type { Principal } from '@/lib/types'
import type { UserRow } from '@/lib/repositories/user.repository'

const testDatabaseUrl = process.env.TEST_DATABASE_URL!
const adapter = new PrismaPg({ connectionString: testDatabaseUrl })
const prisma = new PrismaClient({ adapter })

const adminPrincipal: Principal = {
  userId: 'admin-id',
  role: 'Administrador',
  passwordChangeRequired: false,
}

const secPrincipal: Principal = {
  userId: 'sec-id',
  role: 'Secretario',
  passwordChangeRequired: false,
}

const empPrincipal: Principal = {
  userId: 'emp-id',
  role: 'Empleado',
  passwordChangeRequired: false,
}

/** Creates a real user in the test DB for use as the Secretario principal target. */
async function seedUser(overrides: Partial<{
  nombres: string
  apellidos: string
  cedula: string
  role: string
  passwordChangeRequired: boolean
}> = {}): Promise<UserRow> {
  const cedula = overrides.cedula ?? '99887766'
  const passwordHash = await bcryptHash(cedula, 12)

  return prisma.user.create({
    data: {
      nombres: overrides.nombres ?? 'Test',
      apellidos: overrides.apellidos ?? 'User',
      cedula,
      passwordHash,
      role: (overrides.role ?? 'Empleado') as 'Administrador' | 'Secretario' | 'Empleado',
      passwordChangeRequired: overrides.passwordChangeRequired ?? false,
    },
  }) as Promise<UserRow>
}

describe('user.service integration — CRUD authorization matrix', () => {
  it('H.4 — Admin creates Secretario → 201', async () => {
    const user = await createUser(adminPrincipal, {
      nombres: 'Ana',
      apellidos: 'García',
      cedula: '10000001',
      role: 'Secretario',
    })

    expect(user.role).toBe('Secretario')
    expect(user.passwordChangeRequired).toBe(true)
    expect(user).not.toHaveProperty('passwordHash')
  })

  it('H.4 — Admin creates Empleado → 201', async () => {
    const user = await createUser(adminPrincipal, {
      nombres: 'Luis',
      apellidos: 'Pérez',
      cedula: '10000002',
      role: 'Empleado',
    })

    expect(user.role).toBe('Empleado')
    expect(user.passwordChangeRequired).toBe(true)
  })

  it('H.4 — Secretario creates Empleado → 201', async () => {
    const user = await createUser(secPrincipal, {
      nombres: 'Carlos',
      apellidos: 'Ruiz',
      cedula: '10000003',
      role: 'Empleado',
    })

    expect(user.role).toBe('Empleado')
  })

  it('H.4 — Secretario creating Secretario → 403', async () => {
    await expect(
      createUser(secPrincipal, {
        nombres: 'María',
        apellidos: 'López',
        cedula: '10000004',
        role: 'Secretario',
      })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('H.4 — Empleado denied create → 403', async () => {
    await expect(
      createUser(empPrincipal, {
        nombres: 'Pedro',
        apellidos: 'Sánchez',
        cedula: '10000005',
        role: 'Empleado',
      })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('H.4 — duplicate cédula → 409', async () => {
    await createUser(adminPrincipal, {
      nombres: 'First',
      apellidos: 'User',
      cedula: '10000006',
      role: 'Empleado',
    })

    await expect(
      createUser(adminPrincipal, {
        nombres: 'Second',
        apellidos: 'User',
        cedula: '10000006',
        role: 'Empleado',
      })
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('H.4 — Admin can list users', async () => {
    await createUser(adminPrincipal, {
      nombres: 'A',
      apellidos: 'B',
      cedula: '10000010',
      role: 'Empleado',
    })

    const users = await listUsers(adminPrincipal)
    expect(users.length).toBeGreaterThanOrEqual(1)
    // No passwordHash in list response
    users.forEach((u) => expect(u).not.toHaveProperty('passwordHash'))
  })

  it('H.4 — Empleado denied list → 403', async () => {
    await expect(listUsers(empPrincipal)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('H.4 — soft-delete Admin → 200 (success)', async () => {
    const created = await createUser(adminPrincipal, {
      nombres: 'Delete',
      apellidos: 'Me',
      cedula: '10000020',
      role: 'Empleado',
    })

    // Should not throw
    await softDeleteUser(adminPrincipal, created.id)

    // User should not appear in list
    const users = await listUsers(adminPrincipal)
    const found = users.find((u) => u.id === created.id)
    expect(found).toBeUndefined()
  })

  it('H.4 — soft-delete Secretario → 403', async () => {
    const created = await createUser(adminPrincipal, {
      nombres: 'Keep',
      apellidos: 'Me',
      cedula: '10000021',
      role: 'Empleado',
    })

    await expect(softDeleteUser(secPrincipal, created.id)).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it('H.4 — soft-deleted user excluded from list', async () => {
    const created = await createUser(adminPrincipal, {
      nombres: 'Invisible',
      apellidos: 'User',
      cedula: '10000022',
      role: 'Empleado',
    })

    await softDeleteUser(adminPrincipal, created.id)

    const users = await listUsers(adminPrincipal)
    expect(users.find((u) => u.id === created.id)).toBeUndefined()
  })

  it('H.4 — Secretario can update own record (when userId matches)', async () => {
    // Seed a real user that will be the Secretario's own record
    const secUser = await seedUser({
      cedula: '10000030',
      role: 'Secretario',
    })
    const secPrincipalOwn: Principal = {
      userId: secUser.id,
      role: 'Secretario',
      passwordChangeRequired: false,
    }

    const updated = await updateUser(secPrincipalOwn, secUser.id, {
      nombres: 'Updated',
    })
    expect(updated.nombres).toBe('Updated')
  })

  it('H.4 — Secretario can update Empleado', async () => {
    const emp = await seedUser({ cedula: '10000031', role: 'Empleado' })

    const updated = await updateUser(secPrincipal, emp.id, { nombres: 'Renamed' })
    expect(updated.nombres).toBe('Renamed')
  })

  it('H.4 — Secretario cannot update Administrador → 403', async () => {
    const admin = await seedUser({ cedula: '10000032', role: 'Administrador' })

    await expect(
      updateUser(secPrincipal, admin.id, { nombres: 'Attempt' })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('H.4 — getUser returns 404 for soft-deleted user', async () => {
    const created = await createUser(adminPrincipal, {
      nombres: 'Gone',
      apellidos: 'User',
      cedula: '10000040',
      role: 'Empleado',
    })

    await softDeleteUser(adminPrincipal, created.id)

    await expect(getUser(adminPrincipal, created.id)).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('user.service integration — AuditLog writes (H.5)', () => {
  it('H.5 — createUser writes an AuditLog row', async () => {
    const user = await createUser(adminPrincipal, {
      nombres: 'Audit',
      apellidos: 'Test',
      cedula: '20000001',
      role: 'Empleado',
    })

    const auditRow = await prisma.auditLog.findFirst({
      where: { entityType: 'User', entityId: user.id, action: 'CREATE_USER' },
    })

    expect(auditRow).not.toBeNull()
    expect(auditRow?.entityType).toBe('User')
    expect(auditRow?.entityId).toBe(user.id)
  })

  it('H.5 — updateUser writes an AuditLog row', async () => {
    const user = await createUser(adminPrincipal, {
      nombres: 'Update',
      apellidos: 'Audit',
      cedula: '20000002',
      role: 'Empleado',
    })

    await updateUser(adminPrincipal, user.id, { nombres: 'Changed' })

    const auditRow = await prisma.auditLog.findFirst({
      where: { entityType: 'User', entityId: user.id, action: 'UPDATE_USER' },
    })

    expect(auditRow).not.toBeNull()
  })

  it('H.5 — softDeleteUser writes an AuditLog row', async () => {
    const user = await createUser(adminPrincipal, {
      nombres: 'Delete',
      apellidos: 'Audit',
      cedula: '20000003',
      role: 'Empleado',
    })

    await softDeleteUser(adminPrincipal, user.id)

    const auditRow = await prisma.auditLog.findFirst({
      where: { entityType: 'User', entityId: user.id, action: 'DELETE_USER' },
    })

    expect(auditRow).not.toBeNull()
  })
})

describe('user.service integration — no passwordHash in responses (H.6)', () => {
  it('H.6 — createUser response does not include passwordHash', async () => {
    const user = await createUser(adminPrincipal, {
      nombres: 'Safe',
      apellidos: 'DTO',
      cedula: '30000001',
      role: 'Empleado',
    })

    expect(JSON.stringify(user)).not.toContain('passwordHash')
  })

  it('H.6 — listUsers response does not include passwordHash', async () => {
    await createUser(adminPrincipal, {
      nombres: 'Listing',
      apellidos: 'Safe',
      cedula: '30000002',
      role: 'Empleado',
    })

    const users = await listUsers(adminPrincipal)
    expect(JSON.stringify(users)).not.toContain('passwordHash')
  })

  it('H.6 — getUser response does not include passwordHash', async () => {
    const created = await createUser(adminPrincipal, {
      nombres: 'Get',
      apellidos: 'Safe',
      cedula: '30000003',
      role: 'Empleado',
    })

    const user = await getUser(adminPrincipal, created.id)
    expect(JSON.stringify(user)).not.toContain('passwordHash')
  })

  it('H.6 — updateUser response does not include passwordHash', async () => {
    const created = await createUser(adminPrincipal, {
      nombres: 'Patch',
      apellidos: 'Safe',
      cedula: '30000004',
      role: 'Empleado',
    })

    const updated = await updateUser(adminPrincipal, created.id, { nombres: 'PatchedName' })
    expect(JSON.stringify(updated)).not.toContain('passwordHash')
  })
})
