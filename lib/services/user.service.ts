import 'server-only'
import {
  create as repoCreate,
  findById,
  findAll,
  update as repoUpdate,
  softDelete as repoSoftDelete,
} from '@/lib/repositories/user.repository'
import { record as auditRecord } from '@/lib/repositories/audit.repository'
import { hash } from '@/lib/services/password.service'
import { ServiceError } from '@/lib/services/auth.service'
import type { Principal, Role, UserDTO } from '@/lib/types'
import type { CreateUserInput, UpdateUserInput } from '@/lib/validations/user.schema'

/** Returns true if the error is a Prisma unique constraint violation. */
function isPrismaUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'P2002'
  )
}

/** Maps a raw DB user row to a safe UserDTO (no passwordHash). */
function toUserDTO(user: {
  id: string
  nombres: string
  apellidos: string
  cedula: string
  role: string
  passwordChangeRequired: boolean
  createdAt: Date
  updatedAt: Date
}): UserDTO {
  return {
    id: user.id,
    nombres: user.nombres,
    apellidos: user.apellidos,
    cedula: user.cedula,
    role: user.role as Role,
    passwordChangeRequired: user.passwordChangeRequired,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }
}

/**
 * Creates a new user with enforced initial credentials.
 * - passwordHash is always hash(cedula) — caller payload cannot override this
 * - passwordChangeRequired is always true
 * - Authorization: Admin can create any role; Secretario can only create Empleado
 */
export async function createUser(
  principal: Principal,
  dto: CreateUserInput
): Promise<UserDTO> {
  // Authorization: Empleado cannot create users
  if (principal.role === 'Empleado') {
    throw new ServiceError(403, 'insufficient_permissions')
  }

  // Authorization: Secretario can only create Empleado
  if (principal.role === 'Secretario' && dto.role !== 'Empleado') {
    throw new ServiceError(403, 'insufficient_permissions')
  }

  // Force initial credentials: passwordHash = hash(cedula), pcr = true
  const passwordHash = await hash(dto.cedula)

  let user: Awaited<ReturnType<typeof repoCreate>>
  try {
    user = await repoCreate({
      nombres: dto.nombres,
      apellidos: dto.apellidos,
      cedula: dto.cedula,
      passwordHash,
      role: dto.role as Role,
      passwordChangeRequired: true,
    })
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      throw new ServiceError(409, 'cedula_taken')
    }
    throw err
  }

  await auditRecord({
    action: 'CREATE_USER',
    entityType: 'User',
    entityId: user.id,
    metadata: { role: dto.role, createdBy: principal.userId },
  })

  return toUserDTO(user)
}

/**
 * Lists all active (non-deleted) users.
 * Authorization: Admin and Secretario only.
 */
export async function listUsers(principal: Principal): Promise<UserDTO[]> {
  if (principal.role === 'Empleado') {
    throw new ServiceError(403, 'insufficient_permissions')
  }

  const users = await findAll()
  return users.map(toUserDTO)
}

/**
 * Gets a single active user by ID.
 * Authorization: Admin and Secretario only.
 * Throws ServiceError(404) if not found.
 */
export async function getUser(principal: Principal, id: string): Promise<UserDTO> {
  if (principal.role === 'Empleado') {
    throw new ServiceError(403, 'insufficient_permissions')
  }

  const user = await findById(id)
  if (!user) {
    throw new ServiceError(404, 'user_not_found')
  }

  return toUserDTO(user)
}

/**
 * Updates allowed fields on an existing user.
 * Authorization rules:
 * - Empleado: denied (403) for all updates
 * - Secretario: can update own record OR any Empleado (not Administrador or other Secretario)
 * - Administrador: can update anyone
 * Role and cédula are immutable (not accepted via dto — enforced by updateUserSchema).
 */
export async function updateUser(
  principal: Principal,
  id: string,
  dto: UpdateUserInput
): Promise<UserDTO> {
  if (principal.role === 'Empleado') {
    throw new ServiceError(403, 'insufficient_permissions')
  }

  if (principal.role === 'Secretario') {
    // Must fetch the target user to check their role
    const target = await findById(id)
    if (!target) {
      throw new ServiceError(404, 'user_not_found')
    }

    const isOwnRecord = target.id === principal.userId
    const isEmployee = target.role === 'Empleado'

    if (!isOwnRecord && !isEmployee) {
      throw new ServiceError(403, 'insufficient_permissions')
    }

    const updated = await repoUpdate(id, dto)

    await auditRecord({
      action: 'UPDATE_USER',
      entityType: 'User',
      entityId: id,
      metadata: { updatedBy: principal.userId, fields: Object.keys(dto) },
    })

    return toUserDTO(updated)
  }

  // Administrador path: find user, update, audit
  const target = await findById(id)
  if (!target) {
    throw new ServiceError(404, 'user_not_found')
  }

  const updated = await repoUpdate(id, dto)

  await auditRecord({
    action: 'UPDATE_USER',
    entityType: 'User',
    entityId: id,
    metadata: { updatedBy: principal.userId, fields: Object.keys(dto) },
  })

  return toUserDTO(updated)
}

/**
 * Soft-deletes a user (sets deletedAt = now).
 * Authorization: Administrador only.
 * Throws ServiceError(403) for any other role.
 * Throws ServiceError(404) if the user is not found.
 */
export async function softDeleteUser(principal: Principal, id: string): Promise<void> {
  if (principal.role !== 'Administrador') {
    throw new ServiceError(403, 'insufficient_permissions')
  }

  const user = await findById(id)
  if (!user) {
    throw new ServiceError(404, 'user_not_found')
  }

  await repoSoftDelete(id)

  await auditRecord({
    action: 'DELETE_USER',
    entityType: 'User',
    entityId: id,
    metadata: { deletedBy: principal.userId },
  })
}
