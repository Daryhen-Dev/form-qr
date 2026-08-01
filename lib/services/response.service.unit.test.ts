/**
 * Unit tests for response.service — create path (Sub-PR 5b).
 *
 * Mocks all repositories and focuses on service-level business rules:
 *  - Empleado-only (403)
 *  - Active branch must exist (403)
 *  - Questionnaire must be assigned to the active branch (403)
 *  - Questionnaire must have a published version (422)
 *  - Zod structural validation (422)
 *  - Service-level validateAnswersAgainstVersion (422)
 *  - businessDay derived from utcToBusinessDay (UTC-5)
 *  - Duplicate same-day response → 409 (P2002 from repo)
 *  - AuditLog written on success
 *  - ResponseDTO shape returned with correct status
 *
 * Run with: pnpm test --project unit
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

// --- Mocks must be declared BEFORE importing the module under test ---

vi.mock('@/lib/repositories/questionnaire.repository', () => ({
  findById: vi.fn(),
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
vi.mock('@/lib/repositories/response.repository', () => ({
  createWithAnswers: vi.fn(),
  findByUserQuestionnaireDay: vi.fn(),
}))
vi.mock('@/lib/repositories/audit.repository', () => ({
  record: vi.fn(),
}))

import { findById as findQuestionnaire } from '@/lib/repositories/questionnaire.repository'
import { findActiveByUser } from '@/lib/repositories/branch-assignment.repository'
import { findByQuestionnaire as findQuestionnaireBranches } from '@/lib/repositories/questionnaire-branch.repository'
import { findById as findVersionById } from '@/lib/repositories/version.repository'
import { findByVersion as findQuestionsByVersion } from '@/lib/repositories/question.repository'
import { createWithAnswers, findByUserQuestionnaireDay } from '@/lib/repositories/response.repository'
import { record as auditRecord } from '@/lib/repositories/audit.repository'

import { create } from './response.service'
import { ServiceError } from './auth.service'
import { RESPONSE_STATUS } from '@/lib/types'
import type { Principal } from '@/lib/types'

const mockFindQuestionnaire = vi.mocked(findQuestionnaire)
const mockFindActiveByUser = vi.mocked(findActiveByUser)
const mockFindQuestionnaireBranches = vi.mocked(findQuestionnaireBranches)
const mockFindVersionById = vi.mocked(findVersionById)
const mockFindQuestionsByVersion = vi.mocked(findQuestionsByVersion)
const mockCreateWithAnswers = vi.mocked(createWithAnswers)
const mockFindByUserQuestionnaireDay = vi.mocked(findByUserQuestionnaireDay)
const mockAuditRecord = vi.mocked(auditRecord)

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

const baseQuestionnaire = {
  id: 'q_01',
  title: 'Test',
  description: null,
  currentVersionId: 'v_01',
  qrToken: 'tok',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
}

const baseAssignment = {
  id: 'ba_01',
  branchId: 'b_01',
  userId: 'emp_01',
  assignedAt: new Date(),
  unassignedAt: null,
  createdAt: new Date(),
}

const baseBranchAssignment = {
  id: 'qa_01',
  questionnaireId: 'q_01',
  branchId: 'b_01',
  assignedAt: new Date(),
}

const baseVersion = {
  id: 'v_01',
  questionnaireId: 'q_01',
  versionNumber: 1,
  status: 'published' as const,
  publishedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
}

const baseQuestions = [
  {
    id: 'qn_01',
    versionId: 'v_01',
    order: 1,
    type: 'boolean' as const,
    prompt: 'Check?',
    required: true,
    config: {},
  },
  {
    id: 'qn_02',
    versionId: 'v_01',
    order: 2,
    type: 'scale' as const,
    prompt: 'Scale 1–5',
    required: false,
    config: { min: 1, max: 5 },
  },
]

// A fixed "today" for deterministic businessDay derivation
// 2025-03-15T10:00:00.000Z → UTC-5 → 2025-03-15 local
const MOCK_NOW_UTC = new Date('2025-03-15T10:00:00.000Z')

const baseResponseRow = {
  id: 'resp_01',
  questionnaireId: 'q_01',
  versionId: 'v_01',
  userId: 'emp_01',
  businessDay: new Date('2025-03-15'),
  createdAt: MOCK_NOW_UTC,
  submittedAt: null,
  updatedAt: MOCK_NOW_UTC,
  deletedAt: null,
  answers: [
    { id: 'ans_01', responseId: 'resp_01', questionId: 'qn_01', value: true },
  ],
}

// Valid create body
const validCreateBody = {
  questionnaireId: 'q_01',
  answers: [
    { questionId: 'qn_01', type: 'boolean' as const, value: true },
    { questionId: 'qn_02', type: 'scale' as const, value: 3 },
  ],
}

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

function setupHappyPath() {
  mockFindQuestionnaire.mockResolvedValue(baseQuestionnaire)
  mockFindActiveByUser.mockResolvedValue(baseAssignment)
  mockFindQuestionnaireBranches.mockResolvedValue([baseBranchAssignment])
  mockFindVersionById.mockResolvedValue(baseVersion)
  mockFindQuestionsByVersion.mockResolvedValue(baseQuestions)
  mockFindByUserQuestionnaireDay.mockResolvedValue(null) // no existing response today
  mockCreateWithAnswers.mockResolvedValue(baseResponseRow)
  mockAuditRecord.mockResolvedValue(undefined)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(MOCK_NOW_UTC)
})

// ---------------------------------------------------------------------------
// Authorization — Empleado-only
// ---------------------------------------------------------------------------

describe('response.service.create — authorization', () => {
  it('Administrador → throws 403 insufficient_permissions', async () => {
    await expect(create(adminPrincipal, validCreateBody)).rejects.toMatchObject({
      statusCode: 403,
      message: 'insufficient_permissions',
    })
    expect(mockFindQuestionnaire).not.toHaveBeenCalled()
  })

  it('Secretario → throws 403 insufficient_permissions', async () => {
    const secPrincipal: Principal = { userId: 'sec_01', role: 'Secretario', passwordChangeRequired: false }
    await expect(create(secPrincipal, validCreateBody)).rejects.toMatchObject({
      statusCode: 403,
      message: 'insufficient_permissions',
    })
  })
})

// ---------------------------------------------------------------------------
// Questionnaire lookup + assignment validation
// ---------------------------------------------------------------------------

describe('response.service.create — questionnaire gates', () => {
  it('questionnaire not found → throws 404', async () => {
    mockFindQuestionnaire.mockResolvedValue(null)
    await expect(create(empleadoPrincipal, validCreateBody)).rejects.toMatchObject({
      statusCode: 404,
      message: 'questionnaire_not_found',
    })
  })

  it('employee has no active branch → throws 403 no_active_branch', async () => {
    mockFindQuestionnaire.mockResolvedValue(baseQuestionnaire)
    mockFindActiveByUser.mockResolvedValue(null)
    await expect(create(empleadoPrincipal, validCreateBody)).rejects.toMatchObject({
      statusCode: 403,
      message: 'no_active_branch',
    })
  })

  it('questionnaire not assigned to employee branch → throws 403', async () => {
    mockFindQuestionnaire.mockResolvedValue(baseQuestionnaire)
    mockFindActiveByUser.mockResolvedValue(baseAssignment)
    mockFindQuestionnaireBranches.mockResolvedValue([
      { id: 'qa_other', questionnaireId: 'q_01', branchId: 'b_other', assignedAt: new Date() },
    ])
    await expect(create(empleadoPrincipal, validCreateBody)).rejects.toMatchObject({
      statusCode: 403,
      message: 'questionnaire_not_assigned',
    })
  })

  it('no published version (currentVersionId is null) → throws 422', async () => {
    mockFindQuestionnaire.mockResolvedValue({ ...baseQuestionnaire, currentVersionId: null })
    mockFindActiveByUser.mockResolvedValue(baseAssignment)
    mockFindQuestionnaireBranches.mockResolvedValue([baseBranchAssignment])
    await expect(create(empleadoPrincipal, validCreateBody)).rejects.toMatchObject({
      statusCode: 422,
      message: 'no_published_version',
    })
  })
})

// ---------------------------------------------------------------------------
// Answer validation (service-level config checks)
// ---------------------------------------------------------------------------

describe('response.service.create — answer config validation', () => {
  beforeEach(setupHappyPath)

  it('scale value out of range → throws 422', async () => {
    const body = {
      questionnaireId: 'q_01',
      answers: [
        { questionId: 'qn_01', type: 'boolean' as const, value: true },
        { questionId: 'qn_02', type: 'scale' as const, value: 10 }, // max is 5
      ],
    }
    await expect(create(empleadoPrincipal, body)).rejects.toMatchObject({
      statusCode: 422,
    })
  })

  it('scale value below min → throws 422', async () => {
    const body = {
      questionnaireId: 'q_01',
      answers: [
        { questionId: 'qn_01', type: 'boolean' as const, value: true },
        { questionId: 'qn_02', type: 'scale' as const, value: 0 }, // min is 1
      ],
    }
    await expect(create(empleadoPrincipal, body)).rejects.toMatchObject({
      statusCode: 422,
    })
  })

  it('required question missing from answers → throws 422', async () => {
    const body = {
      questionnaireId: 'q_01',
      answers: [
        // qn_01 is required=true but missing
        { questionId: 'qn_02', type: 'scale' as const, value: 3 },
      ],
    }
    await expect(create(empleadoPrincipal, body)).rejects.toMatchObject({
      statusCode: 422,
    })
  })

  it('single_choice option id not in config.options → throws 422', async () => {
    // Override version questions to have a single_choice
    mockFindQuestionsByVersion.mockResolvedValue([
      {
        id: 'qn_choice',
        versionId: 'v_01',
        order: 1,
        type: 'single_choice' as const,
        prompt: 'Pick one',
        required: false,
        config: { options: [{ id: 'opt_A', label: 'A' }, { id: 'opt_B', label: 'B' }] },
      },
    ])
    const body = {
      questionnaireId: 'q_01',
      answers: [
        { questionId: 'qn_choice', type: 'single_choice' as const, value: 'opt_X' }, // not in options
      ],
    }
    await expect(create(empleadoPrincipal, body)).rejects.toMatchObject({
      statusCode: 422,
    })
  })

  it('multiple_choice with unknown option id → throws 422', async () => {
    mockFindQuestionsByVersion.mockResolvedValue([
      {
        id: 'qn_mc',
        versionId: 'v_01',
        order: 1,
        type: 'multiple_choice' as const,
        prompt: 'Pick many',
        required: false,
        config: { options: [{ id: 'opt_A', label: 'A' }] },
      },
    ])
    const body = {
      questionnaireId: 'q_01',
      answers: [
        { questionId: 'qn_mc', type: 'multiple_choice' as const, value: ['opt_A', 'opt_Z'] }, // opt_Z invalid
      ],
    }
    await expect(create(empleadoPrincipal, body)).rejects.toMatchObject({
      statusCode: 422,
    })
  })

  it('photo answer with non-empty string → passes (key-prefix check deferred to 5d)', async () => {
    mockFindQuestionsByVersion.mockResolvedValue([
      {
        id: 'qn_photo',
        versionId: 'v_01',
        order: 1,
        type: 'photo' as const,
        prompt: 'Upload photo',
        required: false,
        config: {},
      },
    ])
    const body = {
      questionnaireId: 'q_01',
      answers: [
        { questionId: 'qn_photo', type: 'photo' as const, value: 'any/key.jpg' },
      ],
    }
    // Should not throw — key-prefix ownership check comes in 5d
    await expect(create(empleadoPrincipal, body)).resolves.toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Happy path — successful create
// ---------------------------------------------------------------------------

describe('response.service.create — happy path', () => {
  beforeEach(setupHappyPath)

  it('returns a ResponseDTO with correct shape', async () => {
    const dto = await create(empleadoPrincipal, validCreateBody)

    expect(dto.id).toBe('resp_01')
    expect(dto.questionnaireId).toBe('q_01')
    expect(dto.versionId).toBe('v_01')
    expect(dto.businessDay).toBe('2025-03-15')
    expect(typeof dto.createdAt).toBe('string')
  })

  it('status is editable when current time is before endUtc of businessDay', async () => {
    // MOCK_NOW_UTC = 2025-03-15T10:00:00Z → well within the window
    const dto = await create(empleadoPrincipal, validCreateBody)
    expect(dto.status).toBe(RESPONSE_STATUS.EDITABLE)
  })

  it('writes an AuditLog with action response_created', async () => {
    await create(empleadoPrincipal, validCreateBody)
    expect(mockAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'response_created' })
    )
  })

  it('calls createWithAnswers once', async () => {
    await create(empleadoPrincipal, validCreateBody)
    expect(mockCreateWithAnswers).toHaveBeenCalledOnce()
  })

  it('binds versionId from questionnaire.currentVersionId', async () => {
    await create(empleadoPrincipal, validCreateBody)
    const [, answersArg] = mockCreateWithAnswers.mock.calls[0]
    expect(answersArg).toBeDefined()
    const [dataArg] = mockCreateWithAnswers.mock.calls[0]
    expect(dataArg.versionId).toBe('v_01')
  })
})

// ---------------------------------------------------------------------------
// One-per-day constraint
// ---------------------------------------------------------------------------

describe('response.service.create — one-per-day (409)', () => {
  it('ServiceError(409) from repo propagates as 409', async () => {
    setupHappyPath()
    mockCreateWithAnswers.mockRejectedValue(new ServiceError(409, 'response_exists'))

    await expect(create(empleadoPrincipal, validCreateBody)).rejects.toMatchObject({
      statusCode: 409,
      message: 'response_exists',
    })
  })
})
