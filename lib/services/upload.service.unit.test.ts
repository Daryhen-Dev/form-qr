/**
 * Unit tests for upload.service — issuePresign (Sub-PR 5d).
 *
 * Mocks all repositories and storage to focus on service-level business rules:
 *  - Empleado-only (403)
 *  - Active branch must exist (403)
 *  - Questionnaire must be assigned to the active branch (403)
 *  - Questionnaire must have a published version (422)
 *  - Question must exist in the version (404)
 *  - Question type must be photo or file (422 not_a_file_question)
 *  - mimeType not in allowedMimeTypes → 422
 *  - sizeBytes exceeds maxSizeBytes → 422
 *  - Happy path → returns { uploadUrl, objectKey }
 *  - Audit 'presign_issued' written on success
 *
 * Run with: pnpm test --project unit lib/services/upload.service.unit
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
vi.mock('@/lib/repositories/audit.repository', () => ({
  record: vi.fn(),
}))
vi.mock('@/lib/services/storage.service', () => ({
  generateUploadKey: vi.fn().mockReturnValue('questionnaires/q_01/versions/v_01/questions/qn_photo/emp_01/mock-uuid'),
  createStorageService: vi.fn().mockReturnValue({
    presignPutUrl: vi.fn().mockResolvedValue('https://presigned.example.com/key?sig=abc'),
  }),
}))
vi.mock('server-only', () => ({}))

import { findById as findQuestionnaire } from '@/lib/repositories/questionnaire.repository'
import { findActiveByUser } from '@/lib/repositories/branch-assignment.repository'
import { findByQuestionnaire as findQuestionnaireBranches } from '@/lib/repositories/questionnaire-branch.repository'
import { findById as findVersionById } from '@/lib/repositories/version.repository'
import { findByVersion as findQuestionsByVersion } from '@/lib/repositories/question.repository'
import { record as auditRecord } from '@/lib/repositories/audit.repository'
import { generateUploadKey, createStorageService } from '@/lib/services/storage.service'

import { issuePresign } from './upload.service'
import type { Principal } from '@/lib/types'

const mockFindQuestionnaire = vi.mocked(findQuestionnaire)
const mockFindActiveByUser = vi.mocked(findActiveByUser)
const mockFindQuestionnaireBranches = vi.mocked(findQuestionnaireBranches)
const mockFindVersionById = vi.mocked(findVersionById)
const mockFindQuestionsByVersion = vi.mocked(findQuestionsByVersion)
const mockAuditRecord = vi.mocked(auditRecord)
const mockGenerateUploadKey = vi.mocked(generateUploadKey)
const mockCreateStorageService = vi.mocked(createStorageService)

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

const photoQuestion = {
  id: 'qn_photo',
  versionId: 'v_01',
  order: 1,
  type: 'photo' as const,
  prompt: 'Upload photo',
  required: false,
  config: {},
}

const fileQuestion = {
  id: 'qn_file',
  versionId: 'v_01',
  order: 2,
  type: 'file' as const,
  prompt: 'Upload file',
  required: false,
  config: { allowedMimeTypes: ['application/pdf', 'image/png'], maxSizeBytes: 5_000_000 },
}

const booleanQuestion = {
  id: 'qn_bool',
  versionId: 'v_01',
  order: 3,
  type: 'boolean' as const,
  prompt: 'Yes or no?',
  required: false,
  config: {},
}

const validPresignBody = {
  questionnaireId: 'q_01',
  questionId: 'qn_photo',
  mimeType: 'image/jpeg',
  sizeBytes: 1_000_000,
}

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

function setupHappyPath() {
  mockFindQuestionnaire.mockResolvedValue(baseQuestionnaire)
  mockFindActiveByUser.mockResolvedValue(baseAssignment)
  mockFindQuestionnaireBranches.mockResolvedValue([baseBranchAssignment])
  mockFindVersionById.mockResolvedValue(baseVersion)
  mockFindQuestionsByVersion.mockResolvedValue([photoQuestion, fileQuestion, booleanQuestion])
  mockAuditRecord.mockResolvedValue(undefined)
  mockGenerateUploadKey.mockReturnValue(
    'questionnaires/q_01/versions/v_01/questions/qn_photo/emp_01/mock-uuid'
  )
  mockCreateStorageService.mockReturnValue({
    presignPutUrl: vi.fn().mockResolvedValue('https://presigned.example.com/key?sig=abc'),
    generateUploadKey: vi.fn(),
    getObjectUrl: vi.fn(),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Authorization — Empleado-only
// ---------------------------------------------------------------------------

describe('upload.service.issuePresign — authorization', () => {
  it('Administrador → throws 403 insufficient_permissions', async () => {
    await expect(issuePresign(adminPrincipal, validPresignBody)).rejects.toMatchObject({
      statusCode: 403,
      message: 'insufficient_permissions',
    })
    expect(mockFindQuestionnaire).not.toHaveBeenCalled()
  })

  it('Secretario → throws 403 insufficient_permissions', async () => {
    const secPrincipal: Principal = { userId: 'sec_01', role: 'Secretario', passwordChangeRequired: false }
    await expect(issuePresign(secPrincipal, validPresignBody)).rejects.toMatchObject({
      statusCode: 403,
      message: 'insufficient_permissions',
    })
  })
})

// ---------------------------------------------------------------------------
// Questionnaire + assignment gates
// ---------------------------------------------------------------------------

describe('upload.service.issuePresign — questionnaire gates', () => {
  it('questionnaire not found → throws 404', async () => {
    mockFindQuestionnaire.mockResolvedValue(null)
    await expect(issuePresign(empleadoPrincipal, validPresignBody)).rejects.toMatchObject({
      statusCode: 404,
      message: 'questionnaire_not_found',
    })
  })

  it('employee has no active branch → throws 403', async () => {
    mockFindQuestionnaire.mockResolvedValue(baseQuestionnaire)
    mockFindActiveByUser.mockResolvedValue(null)
    await expect(issuePresign(empleadoPrincipal, validPresignBody)).rejects.toMatchObject({
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
    await expect(issuePresign(empleadoPrincipal, validPresignBody)).rejects.toMatchObject({
      statusCode: 403,
      message: 'questionnaire_not_assigned',
    })
  })

  it('no published version → throws 422', async () => {
    mockFindQuestionnaire.mockResolvedValue({ ...baseQuestionnaire, currentVersionId: null })
    mockFindActiveByUser.mockResolvedValue(baseAssignment)
    mockFindQuestionnaireBranches.mockResolvedValue([baseBranchAssignment])
    await expect(issuePresign(empleadoPrincipal, validPresignBody)).rejects.toMatchObject({
      statusCode: 422,
      message: 'no_published_version',
    })
  })
})

// ---------------------------------------------------------------------------
// Question type gate
// ---------------------------------------------------------------------------

describe('upload.service.issuePresign — question type validation', () => {
  beforeEach(setupHappyPath)

  it('question not found in version → throws 404', async () => {
    const body = { ...validPresignBody, questionId: 'qn_nonexistent' }
    await expect(issuePresign(empleadoPrincipal, body)).rejects.toMatchObject({
      statusCode: 404,
      message: 'question_not_found',
    })
  })

  it('question is boolean (not photo/file) → throws 422 not_a_file_question', async () => {
    const body = { ...validPresignBody, questionId: 'qn_bool' }
    await expect(issuePresign(empleadoPrincipal, body)).rejects.toMatchObject({
      statusCode: 422,
      message: 'not_a_file_question',
    })
  })

  it('question is photo → passes type check', async () => {
    const dto = await issuePresign(empleadoPrincipal, validPresignBody)
    expect(dto).toBeDefined()
  })

  it('question is file → passes type check', async () => {
    const body = { ...validPresignBody, questionId: 'qn_file', mimeType: 'application/pdf' }
    const dto = await issuePresign(empleadoPrincipal, body)
    expect(dto).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Config validation — mimeType + sizeBytes
// ---------------------------------------------------------------------------

describe('upload.service.issuePresign — config validation', () => {
  beforeEach(setupHappyPath)

  it('mimeType not in allowedMimeTypes → throws 422 mime_type_not_allowed', async () => {
    const body = {
      questionnaireId: 'q_01',
      questionId: 'qn_file', // file question has allowedMimeTypes: ['application/pdf', 'image/png']
      mimeType: 'text/plain',
      sizeBytes: 1000,
    }
    await expect(issuePresign(empleadoPrincipal, body)).rejects.toMatchObject({
      statusCode: 422,
      message: 'mime_type_not_allowed',
    })
  })

  it('sizeBytes exceeds maxSizeBytes → throws 422 file_too_large', async () => {
    const body = {
      questionnaireId: 'q_01',
      questionId: 'qn_file', // maxSizeBytes: 5_000_000
      mimeType: 'application/pdf',
      sizeBytes: 10_000_000,
    }
    await expect(issuePresign(empleadoPrincipal, body)).rejects.toMatchObject({
      statusCode: 422,
      message: 'file_too_large',
    })
  })

  it('mimeType allowed + size within limit → passes', async () => {
    const body = {
      questionnaireId: 'q_01',
      questionId: 'qn_file',
      mimeType: 'application/pdf',
      sizeBytes: 2_000_000,
    }
    const dto = await issuePresign(empleadoPrincipal, body)
    expect(dto.uploadUrl).toBeDefined()
    expect(dto.objectKey).toBeDefined()
  })

  it('no allowedMimeTypes configured → any mime passes', async () => {
    // photoQuestion has config: {} (no mime restriction)
    const body = {
      questionnaireId: 'q_01',
      questionId: 'qn_photo',
      mimeType: 'application/octet-stream',
      sizeBytes: 1000,
    }
    const dto = await issuePresign(empleadoPrincipal, body)
    expect(dto).toBeDefined()
  })

  it('no maxSizeBytes configured → any size passes', async () => {
    // photoQuestion has config: {} (no size restriction)
    const body = {
      questionnaireId: 'q_01',
      questionId: 'qn_photo',
      mimeType: 'image/jpeg',
      sizeBytes: 999_999_999,
    }
    const dto = await issuePresign(empleadoPrincipal, body)
    expect(dto).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('upload.service.issuePresign — happy path', () => {
  beforeEach(setupHappyPath)

  it('returns PresignDTO with uploadUrl and objectKey', async () => {
    const dto = await issuePresign(empleadoPrincipal, validPresignBody)
    expect(dto.uploadUrl).toBe('https://presigned.example.com/key?sig=abc')
    expect(dto.objectKey).toBe(
      'questionnaires/q_01/versions/v_01/questions/qn_photo/emp_01/mock-uuid'
    )
  })

  it('calls generateUploadKey with owner (principal.userId)', async () => {
    await issuePresign(empleadoPrincipal, validPresignBody)
    expect(mockGenerateUploadKey).toHaveBeenCalledWith(
      'q_01',    // questionnaireId
      'v_01',    // versionId
      'qn_photo', // questionId
      'emp_01'   // ownerId = principal.userId
    )
  })

  it('calls storage.presignPutUrl with the generated key', async () => {
    const mockPresign = vi.fn().mockResolvedValue('https://presigned.example.com/key?sig=abc')
    mockCreateStorageService.mockReturnValue({
      presignPutUrl: mockPresign,
      generateUploadKey: vi.fn(),
      getObjectUrl: vi.fn(),
    })
    await issuePresign(empleadoPrincipal, validPresignBody)
    expect(mockPresign).toHaveBeenCalledWith(
      'questionnaires/q_01/versions/v_01/questions/qn_photo/emp_01/mock-uuid'
    )
  })

  it('writes audit log with action presign_issued', async () => {
    await issuePresign(empleadoPrincipal, validPresignBody)
    expect(mockAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'presign_issued',
        entityType: 'Question',
        entityId: 'qn_photo',
      })
    )
  })
})
