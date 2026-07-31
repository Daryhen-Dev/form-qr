/**
 * Unit tests for user.service — RED phase.
 * Tests role authorization predicates and forced-change logic.
 * All repositories and password.service are mocked.
 * Run with: pnpm test --project unit
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/repositories/user.repository', () => ({
  create: vi.fn(),
  findById: vi.fn(),
  findByCedula: vi.fn(),
  findAll: vi.fn(),
  update: vi.fn(),
  softDelete: vi.fn(),
}))
vi.mock('@/lib/repositories/audit.repository', () => ({
  record: vi.fn(),
}))
vi.mock('@/lib/services/password.service', () => ({
  hash: vi.fn(),
  verify: vi.fn(),
}))

import {
  create as repoCreate,
  findById,
  findAll,
  update as repoUpdate,
  softDelete as repoSoftDelete,
} from '@/lib/repositories/user.repository'
import { record as auditRecord } from '@/lib/repositories/audit.repository'
import { hash } from '@/lib/services/password.service'
import {
  createUser,
  listUsers,
  updateUser,
  softDeleteUser,
} from './user.service'
import type { Principal, Role } from '@/lib/types'

const mockCreate = vi.mocked(repoCreate)
const mockFindById = vi.mocked(findById)
const mockFindAll = vi.mocked(findAll)
const mockUpdate = vi.mocked(repoUpdate)
const mockSoftDelete = vi.mocked(repoSoftDelete)
const mockAuditRecord = vi.mocked(auditRecord)
const mockHash = vi.mocked(hash)

// Helper principals
const adminPrincipal: Principal = {
  userId: 'admin_01',
  role: 'Administrador',
  passwordChangeRequired: false,
}
const secretarioPrincipal: Principal = {
  userId: 'sec_01',
  role: 'Secretario',
  passwordChangeRequired: false,
}
const empleadoPrincipal: Principal = {
  userId: 'emp_01',
  role: 'Empleado',
  passwordChangeRequired: false,
}

const baseUser = {
  id: 'user_99',
  nombres: 'Test',
  apellidos: 'User',
  cedula: '99887766',
  passwordHash: '$2a$12$hash',
  passwordChangeRequired: true,
  role: 'Empleado' as Role,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuditRecord.mockResolvedValue(undefined as never)
  mockHash.mockResolvedValue('$2a$12$hashedcedula')
})

describe('user.service.createUser — role authorization', () => {
  const createDto = {
    nombres: 'New',
    apellidos: 'User',
    cedula: '11223344',
  }

  it('Admin can create a Secretario', async () => {
    mockCreate.mockResolvedValueOnce({ ...baseUser, role: 'Secretario' })
    const result = await createUser(adminPrincipal, { ...createDto, role: 'Secretario' })
    expect(result.role).toBe('Secretario')
    expect(mockCreate).toHaveBeenCalledOnce()
  })

  it('Admin can create an Empleado', async () => {
    mockCreate.mockResolvedValueOnce({ ...baseUser, role: 'Empleado' })
    const result = await createUser(adminPrincipal, { ...createDto, role: 'Empleado' })
    expect(result.role).toBe('Empleado')
  })

  it('Secretario can create an Empleado', async () => {
    mockCreate.mockResolvedValueOnce({ ...baseUser, role: 'Empleado' })
    const result = await createUser(secretarioPrincipal, { ...createDto, role: 'Empleado' })
    expect(result.role).toBe('Empleado')
  })

  it('Secretario CANNOT create a Secretario → throws 403', async () => {
    await expect(
      createUser(secretarioPrincipal, { ...createDto, role: 'Secretario' })
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('Empleado CANNOT create any user → throws 403', async () => {
    await expect(
      createUser(empleadoPrincipal, { ...createDto, role: 'Empleado' })
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('forces passwordHash = hash(cedula) regardless of caller payload', async () => {
    mockCreate.mockResolvedValueOnce({ ...baseUser, role: 'Empleado' })
    await createUser(adminPrincipal, { ...createDto, role: 'Empleado' })
    expect(mockHash).toHaveBeenCalledWith(createDto.cedula)
    const createCall = mockCreate.mock.calls[0][0]
    expect(createCall.passwordHash).toBe('$2a$12$hashedcedula')
  })

  it('forces passwordChangeRequired = true regardless of payload', async () => {
    mockCreate.mockResolvedValueOnce({ ...baseUser, role: 'Empleado' })
    await createUser(adminPrincipal, { ...createDto, role: 'Empleado' })
    const createCall = mockCreate.mock.calls[0][0]
    expect(createCall.passwordChangeRequired).toBe(true)
  })

  it('does NOT expose passwordHash in the returned UserDTO', async () => {
    mockCreate.mockResolvedValueOnce({ ...baseUser, role: 'Empleado' })
    const result = await createUser(adminPrincipal, { ...createDto, role: 'Empleado' })
    expect((result as unknown as Record<string, unknown>).passwordHash).toBeUndefined()
  })
})

describe('user.service.listUsers — authorization', () => {
  it('Empleado CANNOT list users → throws 403', async () => {
    await expect(listUsers(empleadoPrincipal)).rejects.toMatchObject({ statusCode: 403 })
    expect(mockFindAll).not.toHaveBeenCalled()
  })

  it('Admin CAN list users', async () => {
    mockFindAll.mockResolvedValueOnce([])
    await expect(listUsers(adminPrincipal)).resolves.not.toThrow()
  })

  it('Secretario CAN list users', async () => {
    mockFindAll.mockResolvedValueOnce([])
    await expect(listUsers(secretarioPrincipal)).resolves.not.toThrow()
  })
})

describe('user.service.updateUser — authorization', () => {
  const targetEmployee = { ...baseUser, id: 'emp_target', role: 'Empleado' as const }
  const targetSecretario = { ...baseUser, id: 'sec_target', role: 'Secretario' as const }
  const targetAdmin = { ...baseUser, id: 'admin_target', role: 'Administrador' as const }

  it('Secretario CAN update their own record', async () => {
    const ownRecord = { ...baseUser, id: secretarioPrincipal.userId, role: 'Secretario' as const }
    mockFindById.mockResolvedValueOnce(ownRecord)
    mockUpdate.mockResolvedValueOnce({ ...ownRecord, nombres: 'Updated' })
    await expect(
      updateUser(secretarioPrincipal, secretarioPrincipal.userId, { nombres: 'Updated' })
    ).resolves.not.toThrow()
  })

  it('Secretario CAN update an Empleado', async () => {
    mockFindById.mockResolvedValueOnce(targetEmployee)
    mockUpdate.mockResolvedValueOnce({ ...targetEmployee, nombres: 'Updated' })
    await expect(
      updateUser(secretarioPrincipal, targetEmployee.id, { nombres: 'Updated' })
    ).resolves.not.toThrow()
  })

  it('Secretario CANNOT update an Administrador → throws 403', async () => {
    mockFindById.mockResolvedValueOnce(targetAdmin)
    await expect(
      updateUser(secretarioPrincipal, targetAdmin.id, { nombres: 'Updated' })
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('Secretario CANNOT update another Secretario → throws 403', async () => {
    mockFindById.mockResolvedValueOnce(targetSecretario)
    await expect(
      updateUser(secretarioPrincipal, targetSecretario.id, { nombres: 'Updated' })
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('Empleado CANNOT update any user → throws 403', async () => {
    await expect(
      updateUser(empleadoPrincipal, 'any_id', { nombres: 'Updated' })
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(mockFindById).not.toHaveBeenCalled()
  })

  it('Admin CAN update any user', async () => {
    mockFindById.mockResolvedValueOnce(targetAdmin)
    mockUpdate.mockResolvedValueOnce({ ...targetAdmin, nombres: 'Updated' })
    await expect(
      updateUser(adminPrincipal, targetAdmin.id, { nombres: 'Updated' })
    ).resolves.not.toThrow()
  })
})

describe('user.service.softDeleteUser — admin-only', () => {
  it('Admin CAN soft-delete a user', async () => {
    mockFindById.mockResolvedValueOnce(baseUser)
    mockSoftDelete.mockResolvedValueOnce({ ...baseUser, deletedAt: new Date() })
    await expect(softDeleteUser(adminPrincipal, baseUser.id)).resolves.not.toThrow()
    expect(mockSoftDelete).toHaveBeenCalledWith(baseUser.id)
  })

  it('Secretario CANNOT soft-delete → throws 403', async () => {
    await expect(softDeleteUser(secretarioPrincipal, 'any_id')).rejects.toMatchObject({
      statusCode: 403,
    })
    expect(mockSoftDelete).not.toHaveBeenCalled()
  })

  it('Empleado CANNOT soft-delete → throws 403', async () => {
    await expect(softDeleteUser(empleadoPrincipal, 'any_id')).rejects.toMatchObject({
      statusCode: 403,
    })
    expect(mockSoftDelete).not.toHaveBeenCalled()
  })
})
