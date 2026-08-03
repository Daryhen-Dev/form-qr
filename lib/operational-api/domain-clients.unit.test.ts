import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createUser,
  deleteUser,
  getUser,
  listUsers,
  updateUser,
} from '@/lib/operational-api/users'
import {
  createBranch,
  deleteBranch,
  getBranch,
  listBranches,
  updateBranch,
} from '@/lib/operational-api/branches'
import {
  assignEmployee,
  getEmployeeBranch,
  listBranchEmployees,
} from '@/lib/operational-api/assignments'
import {
  PROTECTED_RESULT_KIND,
  type BranchDTO,
  type UserDTO,
} from '@/lib/operational-api/contracts'

const ACCESS_TOKEN = 'access-token-abc'

const userDTO: UserDTO = {
  id: 'user-1',
  nombres: 'Ana',
  apellidos: 'Pérez',
  cedula: '0102030405',
  role: 'Empleado',
  passwordChangeRequired: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
}

const branchDTO: BranchDTO = {
  id: 'branch-1',
  name: 'Central',
  code: 'C1',
  address: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function stubFetch(response: Response) {
  const fetchSpy = vi.fn<typeof fetch>()
  fetchSpy.mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchSpy)
  return fetchSpy
}

function lastRequest(fetchSpy: ReturnType<typeof stubFetch>) {
  const [path, init] = fetchSpy.mock.calls[0] ?? []
  return {
    path,
    method: init?.method,
    body: init?.body,
    authorization: new Headers(init?.headers).get('authorization'),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('users client', () => {
  it('lists users and returns a success ProtectedResult', async () => {
    const fetchSpy = stubFetch(jsonResponse({ users: [userDTO] }))

    const result = await listUsers(ACCESS_TOKEN)

    const request = lastRequest(fetchSpy)
    expect(request.path).toBe('/api/v1/users')
    expect(request.method).toBe('GET')
    expect(request.authorization).toBe(`Bearer ${ACCESS_TOKEN}`)
    expect(result.kind).toBe(PROTECTED_RESULT_KIND.SUCCESS)
    if (result.kind === PROTECTED_RESULT_KIND.SUCCESS) {
      expect(result.data).toEqual([userDTO])
    }
  })

  it('fetches a single user by id', async () => {
    const fetchSpy = stubFetch(jsonResponse({ user: userDTO }))

    const result = await getUser(ACCESS_TOKEN, 'user-1')

    expect(lastRequest(fetchSpy).path).toBe('/api/v1/users/user-1')
    expect(result.kind).toBe(PROTECTED_RESULT_KIND.SUCCESS)
  })

  it('creates a user with a serialized JSON body', async () => {
    const fetchSpy = stubFetch(jsonResponse({ user: userDTO }, 201))

    const result = await createUser(ACCESS_TOKEN, {
      nombres: 'Ana',
      apellidos: 'Pérez',
      cedula: '0102030405',
      role: 'Empleado',
    })

    const request = lastRequest(fetchSpy)
    expect(request.method).toBe('POST')
    expect(request.body).toBe(
      JSON.stringify({
        nombres: 'Ana',
        apellidos: 'Pérez',
        cedula: '0102030405',
        role: 'Empleado',
      })
    )
    expect(result.kind).toBe(PROTECTED_RESULT_KIND.SUCCESS)
  })

  it('updates a user', async () => {
    const fetchSpy = stubFetch(jsonResponse({ user: userDTO }))

    const result = await updateUser(ACCESS_TOKEN, 'user-1', { nombres: 'Ana' })

    const request = lastRequest(fetchSpy)
    expect(request.method).toBe('PATCH')
    expect(request.path).toBe('/api/v1/users/user-1')
    expect(result.kind).toBe(PROTECTED_RESULT_KIND.SUCCESS)
  })

  it('deletes a user and returns the success flag', async () => {
    const fetchSpy = stubFetch(jsonResponse({ success: true }))

    const result = await deleteUser(ACCESS_TOKEN, 'user-1')

    expect(lastRequest(fetchSpy).method).toBe('DELETE')
    expect(result.kind).toBe(PROTECTED_RESULT_KIND.SUCCESS)
    if (result.kind === PROTECTED_RESULT_KIND.SUCCESS) {
      expect(result.data).toEqual({ success: true })
    }
  })

  it('maps HTTP 422 into a validation ProtectedResult with visible field issues', async () => {
    stubFetch(
      jsonResponse(
        { error: 'validation_failed', issues: [{ path: ['nombres'] }] },
        422
      )
    )

    const result = await createUser(ACCESS_TOKEN, {
      nombres: '',
      apellidos: 'Pérez',
      cedula: '0102030405',
      role: 'Empleado',
    })

    expect(result.kind).toBe(PROTECTED_RESULT_KIND.VALIDATION)
    if (result.kind === PROTECTED_RESULT_KIND.VALIDATION) {
      expect(result.fieldIssues.map((issue) => issue.field)).toContain('nombres')
    }
  })
})

describe('branches client', () => {
  it('lists branches', async () => {
    const fetchSpy = stubFetch(jsonResponse({ branches: [branchDTO] }))

    const result = await listBranches(ACCESS_TOKEN)

    expect(lastRequest(fetchSpy).path).toBe('/api/v1/branches')
    expect(result.kind).toBe(PROTECTED_RESULT_KIND.SUCCESS)
  })

  it('fetches a single branch', async () => {
    const fetchSpy = stubFetch(jsonResponse({ branch: branchDTO }))

    const result = await getBranch(ACCESS_TOKEN, 'branch-1')

    expect(lastRequest(fetchSpy).path).toBe('/api/v1/branches/branch-1')
    expect(result.kind).toBe(PROTECTED_RESULT_KIND.SUCCESS)
  })

  it('creates a branch', async () => {
    const fetchSpy = stubFetch(jsonResponse({ branch: branchDTO }, 201))

    const result = await createBranch(ACCESS_TOKEN, { name: 'Central' })

    expect(lastRequest(fetchSpy).method).toBe('POST')
    expect(result.kind).toBe(PROTECTED_RESULT_KIND.SUCCESS)
  })

  it('updates a branch', async () => {
    const fetchSpy = stubFetch(jsonResponse({ branch: branchDTO }))

    const result = await updateBranch(ACCESS_TOKEN, 'branch-1', {
      name: 'Central',
    })

    expect(lastRequest(fetchSpy).method).toBe('PATCH')
    expect(result.kind).toBe(PROTECTED_RESULT_KIND.SUCCESS)
  })

  it('deletes a branch', async () => {
    const fetchSpy = stubFetch(jsonResponse({ success: true }))

    const result = await deleteBranch(ACCESS_TOKEN, 'branch-1')

    expect(lastRequest(fetchSpy).method).toBe('DELETE')
    expect(result.kind).toBe(PROTECTED_RESULT_KIND.SUCCESS)
  })
})

describe('assignments client', () => {
  const assignmentDTO = {
    id: 'assignment-1',
    branchId: 'branch-1',
    userId: 'user-1',
    assignedAt: '2024-01-01T00:00:00.000Z',
    unassignedAt: null,
  }

  it('lists branch employees', async () => {
    const fetchSpy = stubFetch(jsonResponse({ employees: [assignmentDTO] }))

    const result = await listBranchEmployees(ACCESS_TOKEN, 'branch-1')

    expect(lastRequest(fetchSpy).path).toBe('/api/v1/branches/branch-1/employees')
    expect(result.kind).toBe(PROTECTED_RESULT_KIND.SUCCESS)
  })

  it('fetches the employee branch view with null branch', async () => {
    const fetchSpy = stubFetch(jsonResponse({ branch: null, history: [] }))

    const result = await getEmployeeBranch(ACCESS_TOKEN, 'user-1')

    expect(lastRequest(fetchSpy).path).toBe('/api/v1/users/user-1/branch')
    expect(result.kind).toBe(PROTECTED_RESULT_KIND.SUCCESS)
    if (result.kind === PROTECTED_RESULT_KIND.SUCCESS) {
      expect(result.data).toEqual({ branch: null, history: [] })
    }
  })

  it('assigns an employee to a branch with a serialized body', async () => {
    const fetchSpy = stubFetch(jsonResponse({ assignment: assignmentDTO }, 201))

    const result = await assignEmployee(ACCESS_TOKEN, 'branch-1', {
      userId: 'user-1',
    })

    const request = lastRequest(fetchSpy)
    expect(request.method).toBe('POST')
    expect(request.body).toBe(JSON.stringify({ userId: 'user-1' }))
    expect(result.kind).toBe(PROTECTED_RESULT_KIND.SUCCESS)
  })

  it('returns a retryable result when the response body is unprocessable', async () => {
    stubFetch(jsonResponse({ unexpected: true }))

    const result = await listBranchEmployees(ACCESS_TOKEN, 'branch-1')

    expect(result.kind).toBe(PROTECTED_RESULT_KIND.RETRYABLE)
  })
})
