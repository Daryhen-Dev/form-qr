import 'server-only'
import { prisma } from '@/lib/db'
import type { Role } from '@/lib/types'

/** Shape of data used to create a new user row. */
export interface CreateUserData {
  nombres: string
  apellidos: string
  cedula: string
  passwordHash: string
  role: Role
  passwordChangeRequired?: boolean
}

/** Shape of data used to update an existing user row (all fields optional). */
export interface UpdateUserData {
  nombres?: string
  apellidos?: string
  passwordHash?: string
  passwordChangeRequired?: boolean
}

/** Full user row as returned from the DB (includes passwordHash for internal use). */
export interface UserRow {
  id: string
  nombres: string
  apellidos: string
  cedula: string
  passwordHash: string
  passwordChangeRequired: boolean
  role: Role
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

/**
 * Creates a new user row.
 * passwordChangeRequired defaults to true (enforced in service layer as well).
 */
export async function create(data: CreateUserData): Promise<UserRow> {
  return prisma.user.create({
    data: {
      nombres: data.nombres,
      apellidos: data.apellidos,
      cedula: data.cedula,
      passwordHash: data.passwordHash,
      role: data.role,
      passwordChangeRequired: data.passwordChangeRequired ?? true,
    },
  }) as Promise<UserRow>
}

/**
 * Finds an active (non-deleted) user by ID.
 * Returns null if not found or soft-deleted.
 */
export async function findById(id: string): Promise<UserRow | null> {
  return prisma.user.findFirst({
    where: { id, deletedAt: null },
  }) as Promise<UserRow | null>
}

/**
 * Finds an active (non-deleted) user by cédula.
 * Returns null if not found or soft-deleted.
 */
export async function findByCedula(cedula: string): Promise<UserRow | null> {
  return prisma.user.findFirst({
    where: { cedula, deletedAt: null },
  }) as Promise<UserRow | null>
}

/**
 * Returns all active (non-deleted) users.
 * Soft-deleted users are excluded by the default filter.
 */
export async function findAll(): Promise<UserRow[]> {
  return prisma.user.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
  }) as Promise<UserRow[]>
}

/**
 * Updates allowed fields on an existing user row.
 * Caller MUST ensure the id refers to an active user.
 */
export async function update(id: string, data: UpdateUserData): Promise<UserRow> {
  return prisma.user.update({
    where: { id },
    data,
  }) as Promise<UserRow>
}

/**
 * Soft-deletes a user by setting deletedAt to the current UTC timestamp.
 * Hard-delete is intentionally NOT exported from this module (spec requirement).
 */
export async function softDelete(id: string): Promise<UserRow> {
  return prisma.user.update({
    where: { id },
    data: { deletedAt: new Date() },
  }) as Promise<UserRow>
}

// NOTE: Hard-delete is intentionally absent. Exporting a hard-delete function
// would violate the spec requirement that deletion is soft-only.
