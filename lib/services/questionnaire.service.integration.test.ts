/**
 * Integration tests for questionnaire.service — question types + immutability (4b.8, 4b.9).
 *
 * Tests:
 *  4b.8 — Immutability integration: create draft → set questions → publish →
 *          attempt PATCH on published → 409, questions byte-identical.
 *  4b.9 — All 11 question types in one draft: set → publish → getVersion → assert.
 *  Extra — duplicate order in setVersionQuestions → 422 (schema-level, via direct schema call).
 *
 * Requirements: form_qr_test DB must be running with migrations applied.
 * Run with: pnpm test --project integration
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { prisma } from '@/lib/db'
import {
  createTemplate,
  createVersion,
  publishVersion,
  setVersionQuestions,
  getVersion,
} from './questionnaire.service'
import { setQuestionsSchema, type QuestionInput } from '@/lib/validations/question.schema'
import type { Principal } from '@/lib/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const adminPrincipal: Principal = {
  userId: 'admin_01',
  role: 'Administrador',
  passwordChangeRequired: false,
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "QuestionnaireBranch", "Question", "QuestionnaireVersion", "Questionnaire", "AuditLog", "RefreshToken", "User" RESTART IDENTITY CASCADE'
  )

  await prisma.user.create({
    data: {
      id: 'admin_01',
      nombres: 'Admin',
      apellidos: 'Test',
      cedula: '99999',
      passwordHash: 'hash',
      role: 'Administrador',
      passwordChangeRequired: false,
    },
  })
})

// ---------------------------------------------------------------------------
// 4b.8 — Immutability integration test
// ---------------------------------------------------------------------------

describe('questionnaire.service — immutability integration (4b.8)', () => {
  it('attempt PATCH set-questions on published version → 409, questions unchanged', async () => {
    // 1. Create template and draft version
    const template = await createTemplate(adminPrincipal, { title: 'Immutability Test' })
    const draft = await createVersion(adminPrincipal, template.id)

    // 2. Set initial questions on draft
    const initialQuestions: QuestionInput[] = [
      { order: 1, prompt: 'Question 1', required: true, type: 'boolean' as const, config: {} },
      {
        order: 2,
        prompt: 'Question 2',
        required: false,
        type: 'short_text' as const,
        config: { maxLength: 255 },
      },
    ]

    await setVersionQuestions(adminPrincipal, template.id, draft.id, {
      questions: initialQuestions,
    })

    // 3. Verify questions are set
    const beforePublish = await getVersion(adminPrincipal, template.id, draft.id)
    expect(beforePublish.questions).toHaveLength(2)

    // 4. Publish the version → it becomes immutable
    await publishVersion(adminPrincipal, template.id, draft.id)

    // 5. Attempt to set questions on the now-published version → must throw 409
    const newQuestions: QuestionInput[] = [
      {
        order: 1,
        prompt: 'Mutated question',
        required: false,
        type: 'date' as const,
        config: {},
      },
    ]

    await expect(
      setVersionQuestions(adminPrincipal, template.id, draft.id, { questions: newQuestions })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'version_immutable',
    })

    // 6. Verify questions are byte-identical — unchanged after rejected mutation
    const afterRejection = await getVersion(adminPrincipal, template.id, draft.id)
    expect(afterRejection.questions).toHaveLength(2)
    expect(afterRejection.questions[0].order).toBe(1)
    expect(afterRejection.questions[0].prompt).toBe('Question 1')
    expect(afterRejection.questions[0].type).toBe('boolean')
    expect(afterRejection.questions[1].order).toBe(2)
    expect(afterRejection.questions[1].prompt).toBe('Question 2')
    expect(afterRejection.questions[1].type).toBe('short_text')
    expect((afterRejection.questions[1].config as Record<string, unknown>).maxLength).toBe(255)
  })

  it('setVersionQuestions on draft → AuditLog row written', async () => {
    const template = await createTemplate(adminPrincipal, { title: 'Audit Test' })
    const draft = await createVersion(adminPrincipal, template.id)

    const auditQuestions: QuestionInput[] = [
      { order: 1, prompt: 'Q?', required: false, type: 'boolean' as const, config: {} },
    ]
    await setVersionQuestions(adminPrincipal, template.id, draft.id, {
      questions: auditQuestions,
    })

    const logs = await prisma.auditLog.findMany({
      where: { entityId: draft.id, action: 'SET_QUESTIONS' },
    })
    expect(logs).toHaveLength(1)
    expect(logs[0].entityType).toBe('QuestionnaireVersion')
  })
})

// ---------------------------------------------------------------------------
// 4b.9 — All 11 question types integration test
// ---------------------------------------------------------------------------

describe('questionnaire.service — all 11 question types (4b.9)', () => {
  it('creates draft with all 11 types, publishes, getVersion returns ordered questions', async () => {
    const template = await createTemplate(adminPrincipal, { title: 'All Types Template' })
    const draft = await createVersion(adminPrincipal, template.id)

    const allTypes: QuestionInput[] = [
      { order: 1, prompt: 'Boolean Q', required: false, type: 'boolean' as const, config: {} },
      {
        order: 2,
        prompt: 'Single choice Q',
        required: true,
        type: 'single_choice' as const,
        config: { options: [{ id: 'o1', label: 'Yes' }, { id: 'o2', label: 'No' }] },
      },
      {
        order: 3,
        prompt: 'Multiple choice Q',
        required: false,
        type: 'multiple_choice' as const,
        config: {
          options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }],
          minSelected: 1,
          maxSelected: 2,
        },
      },
      {
        order: 4,
        prompt: 'Scale Q',
        required: true,
        type: 'scale' as const,
        config: { min: 1, max: 10, step: 1, labels: { '1': 'Low', '10': 'High' } },
      },
      {
        order: 5,
        prompt: 'Short text Q',
        required: false,
        type: 'short_text' as const,
        config: { maxLength: 100 },
      },
      {
        order: 6,
        prompt: 'Long text Q',
        required: false,
        type: 'long_text' as const,
        config: { maxLength: 2000 },
      },
      {
        order: 7,
        prompt: 'Number Q',
        required: false,
        type: 'number' as const,
        config: { min: 0, max: 100 },
      },
      { order: 8, prompt: 'Date Q', required: false, type: 'date' as const, config: {} },
      { order: 9, prompt: 'Time Q', required: false, type: 'time' as const, config: {} },
      {
        order: 10,
        prompt: 'Photo Q',
        required: false,
        type: 'photo' as const,
        config: {
          objectKeyPattern: 'questionnaires/{templateId}/versions/{versionId}/photos/{id}',
          maxSizeBytes: 5_000_000,
          allowedMimeTypes: ['image/jpeg', 'image/png'],
        },
      },
      {
        order: 11,
        prompt: 'File Q',
        required: false,
        type: 'file' as const,
        config: {
          objectKeyPattern: 'questionnaires/{templateId}/versions/{versionId}/files/{id}',
          maxSizeBytes: 10_000_000,
        },
      },
    ]

    // Set all 11 questions on the draft
    await setVersionQuestions(adminPrincipal, template.id, draft.id, {
      questions: allTypes,
    })

    // Publish the version
    await publishVersion(adminPrincipal, template.id, draft.id)

    // Get the version with ordered questions
    const version = await getVersion(adminPrincipal, template.id, draft.id)

    expect(version.status).toBe('published')
    expect(version.questions).toHaveLength(11)

    // Assert ordered ascending
    for (let i = 0; i < 11; i++) {
      expect(version.questions[i].order).toBe(i + 1)
    }

    // Assert types
    const types = version.questions.map((q) => q.type)
    expect(types).toEqual([
      'boolean',
      'single_choice',
      'multiple_choice',
      'scale',
      'short_text',
      'long_text',
      'number',
      'date',
      'time',
      'photo',
      'file',
    ])

    // Assert config fields are persisted correctly
    const scaleQ = version.questions[3]
    expect((scaleQ.config as Record<string, unknown>).min).toBe(1)
    expect((scaleQ.config as Record<string, unknown>).max).toBe(10)

    const photoQ = version.questions[9]
    expect((photoQ.config as Record<string, unknown>).objectKeyPattern).toBeTruthy()

    const fileQ = version.questions[10]
    expect((fileQ.config as Record<string, unknown>).objectKeyPattern).toBeTruthy()
    expect((fileQ.config as Record<string, unknown>).maxSizeBytes).toBe(10_000_000)
  })

  it('replacing questions on draft replaces all existing (idempotent replace)', async () => {
    const template = await createTemplate(adminPrincipal, { title: 'Replace Test' })
    const draft = await createVersion(adminPrincipal, template.id)

    // First set: 3 questions
    const firstSet: QuestionInput[] = [
      { order: 1, prompt: 'Q1', required: false, type: 'boolean' as const, config: {} },
      { order: 2, prompt: 'Q2', required: false, type: 'date' as const, config: {} },
      { order: 3, prompt: 'Q3', required: false, type: 'time' as const, config: {} },
    ]
    await setVersionQuestions(adminPrincipal, template.id, draft.id, {
      questions: firstSet,
    })

    let v = await getVersion(adminPrincipal, template.id, draft.id)
    expect(v.questions).toHaveLength(3)

    // Second set: 1 question — should replace all 3
    const secondSet: QuestionInput[] = [
      { order: 1, prompt: 'Only Q', required: true, type: 'short_text' as const, config: {} },
    ]
    await setVersionQuestions(adminPrincipal, template.id, draft.id, {
      questions: secondSet,
    })

    v = await getVersion(adminPrincipal, template.id, draft.id)
    expect(v.questions).toHaveLength(1)
    expect(v.questions[0].prompt).toBe('Only Q')
    expect(v.questions[0].type).toBe('short_text')
  })
})

// ---------------------------------------------------------------------------
// Extra — duplicate order in setQuestionsSchema → 422
// (Tests the schema constraint that the route handler enforces at parse time)
// ---------------------------------------------------------------------------

describe('setQuestionsSchema — duplicate order returns schema error (extra coverage)', () => {
  it('duplicate order in same batch → schema parse fails with duplicate order', () => {
    const result = setQuestionsSchema.safeParse({
      questions: [
        { order: 1, prompt: 'Q1', required: false, type: 'boolean', config: {} },
        { order: 1, prompt: 'Q2 (dup order)', required: false, type: 'date', config: {} },
      ],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const hasOrderIssue = result.error.issues.some((i) => i.message === 'duplicate order')
      expect(hasOrderIssue).toBe(true)
    }
  })
})
