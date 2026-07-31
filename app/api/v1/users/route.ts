import { requirePrincipal } from '@/lib/services/request-context'
import { createUserSchema } from '@/lib/validations/user.schema'
import { createUser, listUsers } from '@/lib/services/user.service'
import { ServiceError } from '@/lib/services/auth.service'

/**
 * POST /api/v1/users
 * Creates a new user.
 * Returns 201 { user: UserDTO } on success.
 * Returns 403 on insufficient role.
 * Returns 409 { error: 'cedula_taken' } if the cédula already exists.
 * Returns 422 { error: 'validation_failed', issues } on invalid payload.
 */
export async function POST(request: Request): Promise<Response> {
  let principal: Awaited<ReturnType<typeof requirePrincipal>>
  try {
    principal = await requirePrincipal(request)
  } catch (errResponse) {
    return errResponse as Response
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'validation_failed', issues: ['invalid JSON body'] }, { status: 422 })
  }

  const result = createUserSchema.safeParse(body)
  if (!result.success) {
    return Response.json(
      { error: 'validation_failed', issues: result.error.issues },
      { status: 422 }
    )
  }

  try {
    const user = await createUser(principal, result.data)
    return Response.json({ user }, { status: 201 })
  } catch (err) {
    if (err instanceof ServiceError) {
      // Map DB unique constraint violations (409) from the service/repository layer
      if (err.statusCode === 409) {
        return Response.json({ error: 'cedula_taken' }, { status: 409 })
      }
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    // Catch Prisma unique constraint error bubbling up
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      return Response.json({ error: 'cedula_taken' }, { status: 409 })
    }
    throw err
  }
}

/**
 * GET /api/v1/users
 * Lists all active users.
 * Returns 200 { users: UserDTO[] } on success.
 * Returns 403 on insufficient role (Empleado).
 */
export async function GET(request: Request): Promise<Response> {
  let principal: Awaited<ReturnType<typeof requirePrincipal>>
  try {
    principal = await requirePrincipal(request)
  } catch (errResponse) {
    return errResponse as Response
  }

  try {
    const users = await listUsers(principal)
    return Response.json({ users }, { status: 200 })
  } catch (err) {
    if (err instanceof ServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode })
    }
    throw err
  }
}
