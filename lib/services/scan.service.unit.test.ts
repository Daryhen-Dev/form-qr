/**
 * Unit tests for scan.service — ordered validation gates and ScanResolutionDTO shape.
 * All repositories are mocked.
 * Run with: pnpm test --project unit
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/repositories/questionnaire.repository', () => ({
  findByQrToken: vi.fn(),
}))
vi.mock('@/lib/repositories/branch-assignment.repository', () => ({
  findActiveByUser: vi.fn(),
}))
vi.mock('@/lib/repositories/questionnaire-branch.repository', () => ({
  findByQuestionnaire: vi.fn(),
}))
vi.mock('@/lib/repositories/version.repository', () => ({
  findById: vi.fn(),
}))
vi.mock('@/lib/repositories/question.repository', () => ({
  findByVersion: vi.fn(),
}))

import { findByQrToken } from '@/lib/repositories/questionnaire.repository'
import { findActiveByUser } from '@/lib/repositories/branch-assignment.repository'
import { findByQuestionnaire as findQuestionnaireBranches } from '@/lib/repositories/questionnaire-branch.repository'
import { findById as findVersionById } from '@/lib/repositories/version.repository'
import { findByVersion as findQuestionsByVersion } from '@/lib/repositories/question.repository'
import { resolveScan } from './scan.service'
import { RESPONSE_STATUS } from '@/lib/types'
import type { Principal } from '@/lib/types'

const mockFindByQrToken = vi.mocked(findByQrToken)
const mockFindActiveByUser = vi.mocked(findActiveByUser)
const mockFindQuestionnaireBranches = vi.mocked(findQuestionnaireBranches)
const mockFindVersionById = vi.mocked(findVersionById)
const mockFindQuestionsByVersion = vi.mocked(findQuestionsByVersion)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const empleadoPrincipal: Principal = {
  userId: 'emp_01',
  role: 'Empleado',
  passwordChangeRequired: false,
}
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

const baseQuestionnaire = {
  id: 'q_01',
  title: 'Test Questionnaire',
  description: null,
  currentVersionId: 'v_01',
  qrToken: 'token-abc',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  deletedAt: null,
}

const baseActiveAssignment = {
  id: 'ba_01',
  branchId: 'b_01',
  userId: 'emp_01',
  assignedAt: new Date('2025-01-01'),
  unassignedAt: null,
  createdAt: new Date('2025-01-01'),
}

const baseBranchAssignment = {
  id: 'qa_01',
  questionnaireId: 'q_01',
  branchId: 'b_01',
  assignedAt: new Date('2025-01-01'),
}

const baseVersion = {
  id: 'v_01',
  questionnaireId: 'q_01',
  versionNumber: 1,
  status: 'published' as const,
  publishedAt: new Date('2025-01-01'),
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
}

const baseQuestion = {
  id: 'qn_01',
  versionId: 'v_01',
  order: 1,
  type: 'boolean' as const,
  prompt: 'Did you complete the task?',
  required: true,
  config: {} as Record<string, unknown>,
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Gate 1: Empleado-only
// ---------------------------------------------------------------------------

describe('scan.service.resolveScan — gate 1: role', () => {
  it('Administrador → throws 403 (scan is employee-only flow)', async () => {
    await expect(
      resolveScan(adminPrincipal, 'token-abc')
    ).rejects.toMatchObject({ statusCode: 403, message: 'insufficient_permissions' })
    expect(mockFindByQrToken).not.toHaveBeenCalled()
  })

  it('Secretario → throws 403 (scan is employee-only flow)', async () => {
    await expect(
      resolveScan(secretarioPrincipal, 'token-abc')
    ).rejects.toMatchObject({ statusCode: 403, message: 'insufficient_permissions' })
    expect(mockFindByQrToken).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Gate 2: questionnaire by qrToken
// ---------------------------------------------------------------------------

describe('scan.service.resolveScan — gate 2: questionnaire not found', () => {
  it('unknown qrToken → throws 404', async () => {
    mockFindByQrToken.mockResolvedValueOnce(null)

    await expect(
      resolveScan(empleadoPrincipal, 'unknown-token')
    ).rejects.toMatchObject({ statusCode: 404, message: 'questionnaire_not_found' })
    expect(mockFindActiveByUser).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Gate 3a: employee must have an active branch
// ---------------------------------------------------------------------------

describe('scan.service.resolveScan — gate 3a: no active branch', () => {
  it('employee with no active branch → throws 403 no_active_branch', async () => {
    mockFindByQrToken.mockResolvedValueOnce(baseQuestionnaire)
    mockFindActiveByUser.mockResolvedValueOnce(null)

    await expect(
      resolveScan(empleadoPrincipal, 'token-abc')
    ).rejects.toMatchObject({ statusCode: 403, message: 'no_active_branch' })
    expect(mockFindQuestionnaireBranches).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Gate 3b: questionnaire must be assigned to the employee's branch
// ---------------------------------------------------------------------------

describe('scan.service.resolveScan — gate 3b: questionnaire not assigned to branch', () => {
  it('questionnaire not assigned to employee branch → throws 403 questionnaire_not_assigned', async () => {
    mockFindByQrToken.mockResolvedValueOnce(baseQuestionnaire)
    mockFindActiveByUser.mockResolvedValueOnce(baseActiveAssignment)
    // Branch b_01 does NOT have questionnaire q_01 assigned
    mockFindQuestionnaireBranches.mockResolvedValueOnce([
      { id: 'qa_other', questionnaireId: 'q_01', branchId: 'b_other', assignedAt: new Date() },
    ])

    await expect(
      resolveScan(empleadoPrincipal, 'token-abc')
    ).rejects.toMatchObject({ statusCode: 403, message: 'questionnaire_not_assigned' })
    expect(mockFindVersionById).not.toHaveBeenCalled()
  })

  it('questionnaire assigned to a different branch → throws 403', async () => {
    mockFindByQrToken.mockResolvedValueOnce(baseQuestionnaire)
    mockFindActiveByUser.mockResolvedValueOnce({ ...baseActiveAssignment, branchId: 'b_02' })
    mockFindQuestionnaireBranches.mockResolvedValueOnce([baseBranchAssignment]) // only b_01

    await expect(
      resolveScan(empleadoPrincipal, 'token-abc')
    ).rejects.toMatchObject({ statusCode: 403, message: 'questionnaire_not_assigned' })
  })
})

// ---------------------------------------------------------------------------
// Gate 4: questionnaire must have a published version
// ---------------------------------------------------------------------------

describe('scan.service.resolveScan — gate 4: no published version', () => {
  it('questionnaire.currentVersionId is null → throws 422 no_published_version', async () => {
    mockFindByQrToken.mockResolvedValueOnce({
      ...baseQuestionnaire,
      currentVersionId: null,
    })
    mockFindActiveByUser.mockResolvedValueOnce(baseActiveAssignment)
    mockFindQuestionnaireBranches.mockResolvedValueOnce([baseBranchAssignment])

    await expect(
      resolveScan(empleadoPrincipal, 'token-abc')
    ).rejects.toMatchObject({ statusCode: 422, message: 'no_published_version' })
    expect(mockFindVersionById).not.toHaveBeenCalled()
  })

  it('version row missing despite currentVersionId being set → throws 422', async () => {
    mockFindByQrToken.mockResolvedValueOnce(baseQuestionnaire)
    mockFindActiveByUser.mockResolvedValueOnce(baseActiveAssignment)
    mockFindQuestionnaireBranches.mockResolvedValueOnce([baseBranchAssignment])
    mockFindVersionById.mockResolvedValueOnce(null)

    await expect(
      resolveScan(empleadoPrincipal, 'token-abc')
    ).rejects.toMatchObject({ statusCode: 422, message: 'no_published_version' })
    expect(mockFindQuestionsByVersion).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Happy path — valid scan (absent response)
// ---------------------------------------------------------------------------

describe('scan.service.resolveScan — happy path', () => {
  beforeEach(() => {
    mockFindByQrToken.mockResolvedValue(baseQuestionnaire)
    mockFindActiveByUser.mockResolvedValue(baseActiveAssignment)
    mockFindQuestionnaireBranches.mockResolvedValue([baseBranchAssignment])
    mockFindVersionById.mockResolvedValue(baseVersion)
    mockFindQuestionsByVersion.mockResolvedValue([baseQuestion])
  })

  it('valid Empleado scan with no prior response → 200 with status:absent', async () => {
    const result = await resolveScan(empleadoPrincipal, 'token-abc')

    expect(result.questionnaireId).toBe('q_01')
    expect(result.status).toBe(RESPONSE_STATUS.ABSENT)
    expect(result.response).toBeNull()
  })

  it('returns the published version DTO', async () => {
    const result = await resolveScan(empleadoPrincipal, 'token-abc')

    expect(result.version).toMatchObject({
      id: 'v_01',
      questionnaireId: 'q_01',
      versionNumber: 1,
      status: 'published',
    })
  })

  it('returns ordered questions', async () => {
    const result = await resolveScan(empleadoPrincipal, 'token-abc')

    expect(result.questions).toHaveLength(1)
    expect(result.questions[0]).toMatchObject({
      id: 'qn_01',
      order: 1,
      type: 'boolean',
      required: true,
    })
  })

  it('response is null in 5a (Response model deferred to 5b)', async () => {
    const result = await resolveScan(empleadoPrincipal, 'token-abc')
    expect(result.response).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Gate ordering: later gates not reached when earlier gate fails
// ---------------------------------------------------------------------------

describe('scan.service.resolveScan — gate short-circuit order', () => {
  it('wrong role fails before any repo call', async () => {
    await resolveScan(adminPrincipal, 'token-abc').catch(() => {})
    expect(mockFindByQrToken).not.toHaveBeenCalled()
    expect(mockFindActiveByUser).not.toHaveBeenCalled()
    expect(mockFindQuestionnaireBranches).not.toHaveBeenCalled()
    expect(mockFindVersionById).not.toHaveBeenCalled()
    expect(mockFindQuestionsByVersion).not.toHaveBeenCalled()
  })

  it('unknown token fails before branch check', async () => {
    mockFindByQrToken.mockResolvedValueOnce(null)
    await resolveScan(empleadoPrincipal, 'bad-token').catch(() => {})
    expect(mockFindActiveByUser).not.toHaveBeenCalled()
  })

  it('no active branch fails before branch-assignment check', async () => {
    mockFindByQrToken.mockResolvedValueOnce(baseQuestionnaire)
    mockFindActiveByUser.mockResolvedValueOnce(null)
    await resolveScan(empleadoPrincipal, 'token-abc').catch(() => {})
    expect(mockFindQuestionnaireBranches).not.toHaveBeenCalled()
  })
})
