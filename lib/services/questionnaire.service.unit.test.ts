/**
 * Unit tests for questionnaire.service — authorization predicates and lifecycle invariants.
 * All repositories are mocked.
 * Run with: pnpm test --project unit
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/repositories/questionnaire.repository', () => ({
  create: vi.fn(),
  findById: vi.fn(),
  findAll: vi.fn(),
  update: vi.fn(),
  softDelete: vi.fn(),
  setCurrentVersion: vi.fn(),
}))
vi.mock('@/lib/repositories/version.repository', () => ({
  createDraft: vi.fn(),
  findById: vi.fn(),
  listByQuestionnaire: vi.fn(),
  nextVersionNumber: vi.fn(),
  publish: vi.fn(),
  cloneFrom: vi.fn(),
}))
vi.mock('@/lib/repositories/question.repository', () => ({
  findByVersion: vi.fn(),
  replaceForVersion: vi.fn(),
}))
vi.mock('@/lib/repositories/audit.repository', () => ({
  record: vi.fn(),
}))

import {
  create as repoCreate,
  findById as repoFindById,
  findAll as repoFindAll,
  softDelete as repoSoftDelete,
  setCurrentVersion,
} from '@/lib/repositories/questionnaire.repository'
import {
  findById as versionFindById,
  publish as repoPublish,
} from '@/lib/repositories/version.repository'
import { findByVersion } from '@/lib/repositories/question.repository'
import { record as auditRecord } from '@/lib/repositories/audit.repository'

import {
  createTemplate,
  listTemplates,
  getTemplate,
  softDeleteTemplate,
  publishVersion,
  getVersion,
} from './questionnaire.service'
import type { Principal } from '@/lib/types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRepoCreate = vi.mocked(repoCreate)
const mockFindById = vi.mocked(repoFindById)
const mockFindAll = vi.mocked(repoFindAll)
const mockSoftDelete = vi.mocked(repoSoftDelete)
const mockSetCurrentVersion = vi.mocked(setCurrentVersion)
const mockVersionFindById = vi.mocked(versionFindById)
const mockRepoPublish = vi.mocked(repoPublish)
const mockFindByVersion = vi.mocked(findByVersion)
const mockAuditRecord = vi.mocked(auditRecord)

// ---------------------------------------------------------------------------
// Principals
// ---------------------------------------------------------------------------

const adminPrincipal: Principal = { userId: 'admin_01', role: 'Administrador', passwordChangeRequired: false }
const secretarioPrincipal: Principal = { userId: 'sec_01', role: 'Secretario', passwordChangeRequired: false }
const empleadoPrincipal: Principal = { userId: 'emp_01', role: 'Empleado', passwordChangeRequired: false }

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseQuestionnaire = {
  id: 'q_01',
  title: 'Test Template',
  description: null,
  currentVersionId: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
}

const baseVersion = {
  id: 'v_01',
  questionnaireId: 'q_01',
  versionNumber: 1,
  status: 'draft' as const,
  publishedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
}

const publishedVersion = {
  ...baseVersion,
  status: 'published' as const,
  publishedAt: new Date('2026-01-02T00:00:00Z'),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuditRecord.mockResolvedValue(undefined as never)
  mockSetCurrentVersion.mockResolvedValue(baseQuestionnaire as never)
})

// ---------------------------------------------------------------------------
// createTemplate — authorization
// ---------------------------------------------------------------------------

describe('questionnaire.service.createTemplate — authorization', () => {
  it('Admin CAN create a template', async () => {
    mockRepoCreate.mockResolvedValueOnce(baseQuestionnaire)
    const result = await createTemplate(adminPrincipal, { title: 'Test' })
    expect(result.title).toBe('Test Template')
    expect(mockRepoCreate).toHaveBeenCalledOnce()
    expect(mockAuditRecord).toHaveBeenCalledOnce()
  })

  it('Secretario CAN create a template', async () => {
    mockRepoCreate.mockResolvedValueOnce(baseQuestionnaire)
    await expect(createTemplate(secretarioPrincipal, { title: 'Test' })).resolves.not.toThrow()
    expect(mockRepoCreate).toHaveBeenCalledOnce()
  })

  it('Empleado CANNOT create a template → throws 403', async () => {
    await expect(createTemplate(empleadoPrincipal, { title: 'Test' })).rejects.toMatchObject({
      statusCode: 403,
    })
    expect(mockRepoCreate).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// listTemplates — authorization
// ---------------------------------------------------------------------------

describe('questionnaire.service.listTemplates — authorization', () => {
  it('Admin CAN list templates', async () => {
    mockFindAll.mockResolvedValueOnce([])
    await expect(listTemplates(adminPrincipal)).resolves.not.toThrow()
  })

  it('Secretario CAN list templates', async () => {
    mockFindAll.mockResolvedValueOnce([])
    await expect(listTemplates(secretarioPrincipal)).resolves.not.toThrow()
  })

  it('Empleado CANNOT list templates → throws 403', async () => {
    await expect(listTemplates(empleadoPrincipal)).rejects.toMatchObject({ statusCode: 403 })
    expect(mockFindAll).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// getTemplate — 404 handling
// ---------------------------------------------------------------------------

describe('questionnaire.service.getTemplate — 404 handling', () => {
  it('throws 404 when template is not found', async () => {
    mockFindById.mockResolvedValueOnce(null)
    await expect(getTemplate(adminPrincipal, 'nonexistent')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('returns QuestionnaireDTO when template is found', async () => {
    mockFindById.mockResolvedValueOnce(baseQuestionnaire)
    const result = await getTemplate(adminPrincipal, 'q_01')
    expect(result.id).toBe('q_01')
    expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

// ---------------------------------------------------------------------------
// softDeleteTemplate — clears currentVersionId
// ---------------------------------------------------------------------------

describe('questionnaire.service.softDeleteTemplate — invariants', () => {
  it('clears currentVersionId when deleting a template that has a current version', async () => {
    const withCurrentVersion = { ...baseQuestionnaire, currentVersionId: 'v_01' }
    mockFindById.mockResolvedValueOnce(withCurrentVersion)
    mockSoftDelete.mockResolvedValueOnce({ ...withCurrentVersion, deletedAt: new Date() })

    await softDeleteTemplate(adminPrincipal, 'q_01')

    expect(mockSetCurrentVersion).toHaveBeenCalledWith('q_01', null)
    expect(mockSoftDelete).toHaveBeenCalledWith('q_01')
    expect(mockAuditRecord).toHaveBeenCalledOnce()
  })

  it('does not call setCurrentVersion when currentVersionId is null', async () => {
    mockFindById.mockResolvedValueOnce(baseQuestionnaire)
    mockSoftDelete.mockResolvedValueOnce({ ...baseQuestionnaire, deletedAt: new Date() })

    await softDeleteTemplate(adminPrincipal, 'q_01')

    expect(mockSetCurrentVersion).not.toHaveBeenCalled()
  })

  it('throws 404 when template does not exist', async () => {
    mockFindById.mockResolvedValueOnce(null)
    await expect(softDeleteTemplate(adminPrincipal, 'nonexistent')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('Empleado CANNOT soft-delete → throws 403', async () => {
    await expect(softDeleteTemplate(empleadoPrincipal, 'q_01')).rejects.toMatchObject({
      statusCode: 403,
    })
    expect(mockFindById).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// publishVersion — idempotency guard
// ---------------------------------------------------------------------------

describe('questionnaire.service.publishVersion — idempotency guard', () => {
  it('publishing a draft version succeeds and sets currentVersionId', async () => {
    mockFindById.mockResolvedValueOnce(baseQuestionnaire)
    mockVersionFindById.mockResolvedValueOnce(baseVersion)
    mockRepoPublish.mockResolvedValueOnce(publishedVersion)

    const result = await publishVersion(adminPrincipal, 'q_01', 'v_01')

    expect(result.status).toBe('published')
    expect(mockSetCurrentVersion).toHaveBeenCalledWith('q_01', 'v_01')
    expect(mockAuditRecord).toHaveBeenCalledOnce()
  })

  it('publishing an already-published version → throws 409 version_already_published', async () => {
    mockFindById.mockResolvedValueOnce(baseQuestionnaire)
    mockVersionFindById.mockResolvedValueOnce(publishedVersion)

    await expect(publishVersion(adminPrincipal, 'q_01', 'v_01')).rejects.toMatchObject({
      statusCode: 409,
      message: 'version_already_published',
    })

    expect(mockRepoPublish).not.toHaveBeenCalled()
    expect(mockSetCurrentVersion).not.toHaveBeenCalled()
  })

  it('throws 404 when version belongs to a different questionnaire', async () => {
    mockFindById.mockResolvedValueOnce(baseQuestionnaire)
    const wrongQVersion = { ...baseVersion, questionnaireId: 'other_q' }
    mockVersionFindById.mockResolvedValueOnce(wrongQVersion)

    await expect(publishVersion(adminPrincipal, 'q_01', 'v_01')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('Empleado CANNOT publish → throws 403', async () => {
    await expect(publishVersion(empleadoPrincipal, 'q_01', 'v_01')).rejects.toMatchObject({
      statusCode: 403,
    })
    expect(mockFindById).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// getVersion — returns version with questions
// ---------------------------------------------------------------------------

describe('questionnaire.service.getVersion — with questions', () => {
  it('returns version DTO with ordered questions', async () => {
    mockFindById.mockResolvedValueOnce(baseQuestionnaire)
    mockVersionFindById.mockResolvedValueOnce(baseVersion)
    mockFindByVersion.mockResolvedValueOnce([
      { id: 'q1', versionId: 'v_01', order: 1, type: 'boolean', prompt: 'Q1', required: true, config: {} },
      { id: 'q2', versionId: 'v_01', order: 2, type: 'short_text', prompt: 'Q2', required: false, config: {} },
    ])

    const result = await getVersion(adminPrincipal, 'q_01', 'v_01')

    expect(result.id).toBe('v_01')
    expect(result.questions).toHaveLength(2)
    expect(result.questions[0].order).toBe(1)
    expect(result.questions[1].order).toBe(2)
  })

  it('throws 404 when version not found', async () => {
    mockFindById.mockResolvedValueOnce(baseQuestionnaire)
    mockVersionFindById.mockResolvedValueOnce(null)

    await expect(getVersion(adminPrincipal, 'q_01', 'v_01')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})
