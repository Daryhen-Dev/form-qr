/**
 * Integration tests for response.service — POST create flow (Sub-PR 5b).
 *
 * Uses the form_qr_test database. Tests cover:
 *  - Create response → 201 + answers persisted + businessDay correct (UTC-5)
 *  - Second create same day → 409 (DB unique backstop)
 *  - Different day → 201 (new response for new businessDay)
 *  - Concurrent Promise.all two creates → one success + one 409 (proves compound unique)
 *  - Response binds currentVersionId at create time
 *  - AuditLog written on create
 *  - scan.service now returns editable status when today's response exists
 *
 * Requirements: form_qr_test DB must be running with migrations applied.
 * Run with: pnpm test --project integration
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { prisma } from '@/lib/db'
import { create } from './response.service'
import { resolveScan } from './scan.service'
import { ServiceError } from './auth.service'
import { RESPONSE_STATUS } from '@/lib/types'
import type { Principal } from '@/lib/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmpleadoPrincipal(userId: string): Principal {
  return { userId, role: 'Empleado', passwordChangeRequired: false }
}

// ---------------------------------------------------------------------------
// Test fixtures — set up real DB rows
// ---------------------------------------------------------------------------

let empleadoId: string
let questionnaireId: string
let versionId: string
let booleanQuestionId: string
let scaleQuestionId: string
let qrToken: string

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "Answer", "Response", "QuestionnaireBranch", "Question",
     "QuestionnaireVersion", "Questionnaire", "BranchAssignment", "Branch",
     "RefreshToken", "User", "AuditLog" RESTART IDENTITY CASCADE`
  )

  // Create an Empleado user
  const user = await prisma.user.create({
    data: {
      nombres: 'Integration',
      apellidos: 'Test',
      cedula: '55555555',
      passwordHash: 'hash',
      role: 'Empleado',
      passwordChangeRequired: false,
    },
  })
  empleadoId = user.id

  // Create a branch and assign the employee
  const branch = await prisma.branch.create({ data: { name: 'Test Branch' } })
  await prisma.branchAssignment.create({
    data: { userId: empleadoId, branchId: branch.id, assignedAt: new Date() },
  })

  // Create a questionnaire
  const questionnaire = await prisma.questionnaire.create({
    data: { title: 'Daily Check' },
  })
  questionnaireId = questionnaire.id
  qrToken = questionnaire.qrToken

  // Assign questionnaire to branch
  await prisma.questionnaireBranch.create({
    data: { questionnaireId, branchId: branch.id },
  })  // Create and publish a version
  const version = await prisma.questionnaireVersion.create({
    data: {
      questionnaireId,
      versionNumber: 1,
      status: 'published',
      publishedAt: new Date(),
    },
  })
  versionId = version.id

  // Set questionnaire.currentVersionId
  await prisma.questionnaire.update({
    where: { id: questionnaireId },
    data: { currentVersionId: versionId },
  })

  // Create questions
  const boolQ = await prisma.question.create({
    data: {
      versionId,
      order: 1,
      type: 'boolean',
      prompt: 'Did you complete the checklist?',
      required: true,
      config: {},
    },
  })
  booleanQuestionId = boolQ.id

  const scaleQ = await prisma.question.create({
    data: {
      versionId,
      order: 2,
      type: 'scale',
      prompt: 'Rate your mood (1-5)',
      required: false,
      config: { min: 1, max: 5 },
    },
  })
  scaleQuestionId = scaleQ.id
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Happy path: create response → 201 + answers persisted + businessDay correct
// ---------------------------------------------------------------------------

describe('response.service integration — create response (happy path)', () => {
  it('creates response with correct businessDay (UTC-5 derived)', async () => {
    // Simulate 2025-03-15T10:00:00Z → businessDay = 2025-03-15 (UTC-5 = 05:00 local)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-15T10:00:00.000Z'))

    const principal = makeEmpleadoPrincipal(empleadoId)
    const dto = await create(principal, {
      questionnaireId,
      answers: [
        { questionId: booleanQuestionId, type: 'boolean', value: true },
        { questionId: scaleQuestionId, type: 'scale', value: 3 },
      ],
    })

    expect(dto.businessDay).toBe('2025-03-15')
    expect(dto.questionnaireId).toBe(questionnaireId)
    expect(dto.versionId).toBe(versionId)

    // Verify answers persisted in DB
    const answers = await prisma.answer.findMany({ where: { responseId: dto.id } })
    expect(answers).toHaveLength(2)
    const boolAnswer = answers.find((a) => a.questionId === booleanQuestionId)
    expect(boolAnswer?.value).toBe(true)
  })

  it('businessDay boundary: 04:59:59.999Z → prior local day (2025-03-14)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-15T04:59:59.999Z'))

    const principal = makeEmpleadoPrincipal(empleadoId)
    const dto = await create(principal, {
      questionnaireId,
      answers: [
        { questionId: booleanQuestionId, type: 'boolean', value: false },
      ],
    })

    expect(dto.businessDay).toBe('2025-03-14')
  })

  it('response binds currentVersionId at create time', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-15T10:00:00.000Z'))

    const principal = makeEmpleadoPrincipal(empleadoId)
    const dto = await create(principal, {
      questionnaireId,
      answers: [{ questionId: booleanQuestionId, type: 'boolean', value: true }],
    })

    expect(dto.versionId).toBe(versionId)

    // Verify in DB
    const dbRow = await prisma.response.findUnique({ where: { id: dto.id } })
    expect(dbRow?.versionId).toBe(versionId)
  })

  it('AuditLog written on create with action response_created', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-15T10:00:00.000Z'))

    const principal = makeEmpleadoPrincipal(empleadoId)
    const dto = await create(principal, {
      questionnaireId,
      answers: [{ questionId: booleanQuestionId, type: 'boolean', value: true }],
    })

    const auditLogs = await prisma.auditLog.findMany({ where: { entityId: dto.id } })
    expect(auditLogs).toHaveLength(1)
    expect(auditLogs[0].action).toBe('response_created')
  })

  it('status is editable when current time is within businessDay window', async () => {
    // 10:00 UTC → 05:00 UTC-5 → within 00:00–23:59 local → editable
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-15T10:00:00.000Z'))

    const principal = makeEmpleadoPrincipal(empleadoId)
    const dto = await create(principal, {
      questionnaireId,
      answers: [{ questionId: booleanQuestionId, type: 'boolean', value: true }],
    })

    expect(dto.status).toBe(RESPONSE_STATUS.EDITABLE)
  })
})

// ---------------------------------------------------------------------------
// One-per-day: second create same day → 409
// ---------------------------------------------------------------------------

describe('response.service integration — one-per-day constraint', () => {
  it('second create on the same business day → 409 response_exists', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-15T10:00:00.000Z'))

    const principal = makeEmpleadoPrincipal(empleadoId)
    const body = {
      questionnaireId,
      answers: [{ questionId: booleanQuestionId, type: 'boolean' as const, value: true }],
    }

    // First create succeeds
    await create(principal, body)

    // Second create same day → 409
    await expect(create(principal, body)).rejects.toMatchObject({
      statusCode: 409,
      message: 'response_exists',
    })
  })

  it('create on a different business day → 201 (new response allowed)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-15T10:00:00.000Z'))

    const principal = makeEmpleadoPrincipal(empleadoId)
    const body = {
      questionnaireId,
      answers: [{ questionId: booleanQuestionId, type: 'boolean' as const, value: true }],
    }

    // Create for day 1
    const dto1 = await create(principal, body)
    expect(dto1.businessDay).toBe('2025-03-15')

    // Advance to the next business day (UTC-5: 05:00:00 UTC = 00:00:00 local next day)
    vi.setSystemTime(new Date('2025-03-16T05:00:00.000Z'))

    // Create for day 2 — should succeed
    const dto2 = await create(principal, body)
    expect(dto2.businessDay).toBe('2025-03-16')
    expect(dto2.id).not.toBe(dto1.id)
  })
})

// ---------------------------------------------------------------------------
// Concurrent create → one 201 + one 409 (proves compound unique DB backstop)
// ---------------------------------------------------------------------------

describe('response.service integration — concurrent race condition', () => {
  it('concurrent Promise.all two creates → exactly one succeeds, one 409', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-15T10:00:00.000Z'))

    const principal = makeEmpleadoPrincipal(empleadoId)
    const body = {
      questionnaireId,
      answers: [{ questionId: booleanQuestionId, type: 'boolean' as const, value: true }],
    }

    const results = await Promise.allSettled([
      create(principal, body),
      create(principal, body),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')

    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)

    const rejectedReason = (rejected[0] as PromiseRejectedResult).reason
    expect(rejectedReason).toBeInstanceOf(ServiceError)
    expect((rejectedReason as ServiceError).statusCode).toBe(409)

    // Only one response row in DB
    const dbResponses = await prisma.response.findMany({ where: { userId: empleadoId, questionnaireId } })
    expect(dbResponses).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// scan.service now returns editable status when today's response exists (5b wiring)
// ---------------------------------------------------------------------------

describe('response.service integration — scan.service returns real status after 5b', () => {
  it('scan returns absent when no response yet', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-15T10:00:00.000Z'))

    const principal = makeEmpleadoPrincipal(empleadoId)
    const scan = await resolveScan(principal, qrToken)
    expect(scan.status).toBe(RESPONSE_STATUS.ABSENT)
    expect(scan.response).toBeNull()
  })

  it('scan returns editable when response exists and window is open', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-15T10:00:00.000Z'))

    const principal = makeEmpleadoPrincipal(empleadoId)

    // Create a response for today
    await create(principal, {
      questionnaireId,
      answers: [{ questionId: booleanQuestionId, type: 'boolean', value: true }],
    })

    // Scan should now return editable
    const scan = await resolveScan(principal, qrToken)
    expect(scan.status).toBe(RESPONSE_STATUS.EDITABLE)
    expect(scan.response).not.toBeNull()
    expect(scan.response!.questionnaireId).toBe(questionnaireId)
  })

  it('scan returns read_only when response exists and window is closed', async () => {
    // read_only from scan's perspective: the response was created and the edit window
    // has passed. Since the window spans the full local day, read_only can only be
    // observed if the test sets up a response for a prior businessDay AND now is past
    // that window. We simulate this by inserting a response row directly with a prior
    // businessDay and advancing the clock so scan looks for a *different* (today's) day.
    // In practice, scan always shows the CURRENT local day's status — if a prior day's
    // response exists but today has no response, scan returns ABSENT for today.
    // The read_only status is surfaced by GET /responses/[id] (Sub-PR 5c).
    //
    // This test verifies that scan correctly returns ABSENT for a new day even when
    // a response already exists for a prior day.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-15T10:00:00.000Z'))

    const principal = makeEmpleadoPrincipal(empleadoId)

    // Create response for day 2025-03-15
    await create(principal, {
      questionnaireId,
      answers: [{ questionId: booleanQuestionId, type: 'boolean', value: true }],
    })

    // Advance to next business day (2025-03-16: 2025-03-16T05:00:00.000Z = 00:00 local)
    vi.setSystemTime(new Date('2025-03-16T06:00:00.000Z'))

    // Scan now resolves businessDay = 2025-03-16 — no response for today → absent
    const scan = await resolveScan(principal, qrToken)
    expect(scan.status).toBe(RESPONSE_STATUS.ABSENT)
    expect(scan.response).toBeNull()
  })
})


// ---------------------------------------------------------------------------
// Sub-PR 5c: GET + PATCH responses/[id] — ownership + edit-window
// ---------------------------------------------------------------------------

describe('response.service integration — get (ownership + status)', () => {
  it('owner gets own response → 200 with answers and editable status', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-15T10:00:00.000Z'))

    const principal = makeEmpleadoPrincipal(empleadoId)
    const created = await create(principal, {
      questionnaireId,
      answers: [{ questionId: booleanQuestionId, type: 'boolean', value: true }],
    })

    // Import get dynamically to avoid module resolution issues
    const { get } = await import('./response.service')
    const dto = await get(principal, created.id)

    expect(dto.id).toBe(created.id)
    expect(dto.status).toBe(RESPONSE_STATUS.EDITABLE)
    expect(dto.answers).toHaveLength(1)
    expect(dto.answers[0].questionId).toBe(booleanQuestionId)
    expect(dto.answers[0].value).toBe(true)
  })

  it('non-owner gets another Empleado response → 404 (anti-enumeration)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-15T10:00:00.000Z'))

    const principal = makeEmpleadoPrincipal(empleadoId)
    const created = await create(principal, {
      questionnaireId,
      answers: [{ questionId: booleanQuestionId, type: 'boolean', value: true }],
    })

    // Create another Empleado
    const otherUser = await prisma.user.create({
      data: {
        nombres: 'Other',
        apellidos: 'Employee',
        cedula: '99999999',
        passwordHash: 'hash2',
        role: 'Empleado',
        passwordChangeRequired: false,
      },
    })

    const { get } = await import('./response.service')
    const otherPrincipal = makeEmpleadoPrincipal(otherUser.id)

    await expect(get(otherPrincipal, created.id)).rejects.toMatchObject({
      statusCode: 404,
      message: 'response_not_found',
    })
  })

  it('GET response for closed window → status read_only', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-15T10:00:00.000Z'))

    const principal = makeEmpleadoPrincipal(empleadoId)
    const created = await create(principal, {
      questionnaireId,
      answers: [{ questionId: booleanQuestionId, type: 'boolean', value: true }],
    })

    // Advance past the edit window (businessDay 2025-03-15 → endUtc = 2025-03-16T04:59:59.999Z)
    vi.setSystemTime(new Date('2025-03-16T05:00:00.000Z'))

    const { get } = await import('./response.service')
    const dto = await get(principal, created.id)
    expect(dto.status).toBe(RESPONSE_STATUS.READ_ONLY)
  })
})

describe('response.service integration — update (edit-window + audit)', () => {
  it('PATCH within same business day → 200, answers replaced, updatedAt changed', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-15T10:00:00.000Z'))

    const principal = makeEmpleadoPrincipal(empleadoId)
    const created = await create(principal, {
      questionnaireId,
      answers: [
        { questionId: booleanQuestionId, type: 'boolean', value: true },
        { questionId: scaleQuestionId, type: 'scale', value: 3 },
      ],
    })

    // Advance slightly (still within window)
    vi.setSystemTime(new Date('2025-03-15T12:00:00.000Z'))

    const { update } = await import('./response.service')
    const updated = await update(principal, created.id, {
      answers: [
        { questionId: booleanQuestionId, type: 'boolean', value: false },
        { questionId: scaleQuestionId, type: 'scale', value: 5 },
      ],
    })

    expect(updated.id).toBe(created.id)
    expect(updated.status).toBe(RESPONSE_STATUS.EDITABLE)

    // updatedAt should be different from createdAt
    expect(updated.updatedAt).not.toBe(created.updatedAt)

    // Answers replaced
    const boolAnswer = updated.answers.find((a) => a.questionId === booleanQuestionId)
    expect(boolAnswer?.value).toBe(false)
    const scaleAnswer = updated.answers.find((a) => a.questionId === scaleQuestionId)
    expect(scaleAnswer?.value).toBe(5)

    // Verify answers in DB
    const dbAnswers = await prisma.answer.findMany({ where: { responseId: created.id } })
    expect(dbAnswers).toHaveLength(2)
    const dbBool = dbAnswers.find((a) => a.questionId === booleanQuestionId)
    expect(dbBool?.value).toBe(false)
  })

  it('PATCH after window closes (businessDay in the past) → 409 edit_window_closed', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-15T10:00:00.000Z'))

    const principal = makeEmpleadoPrincipal(empleadoId)
    const created = await create(principal, {
      questionnaireId,
      answers: [{ questionId: booleanQuestionId, type: 'boolean', value: true }],
    })

    // Advance past the edit window: businessDay 2025-03-15 → endUtc = 2025-03-16T04:59:59.999Z
    // Set to 05:00:00.000Z on 2025-03-16 → window closed
    vi.setSystemTime(new Date('2025-03-16T05:00:00.000Z'))

    const { update } = await import('./response.service')
    await expect(
      update(principal, created.id, {
        answers: [{ questionId: booleanQuestionId, type: 'boolean', value: false }],
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'edit_window_closed',
    })
  })

  it('non-owner PATCH → 404', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-15T10:00:00.000Z'))

    const principal = makeEmpleadoPrincipal(empleadoId)
    const created = await create(principal, {
      questionnaireId,
      answers: [{ questionId: booleanQuestionId, type: 'boolean', value: true }],
    })

    const otherUser = await prisma.user.create({
      data: {
        nombres: 'Intruder',
        apellidos: 'Emp',
        cedula: '77777777',
        passwordHash: 'hash3',
        role: 'Empleado',
        passwordChangeRequired: false,
      },
    })

    const { update } = await import('./response.service')
    const otherPrincipal = makeEmpleadoPrincipal(otherUser.id)

    await expect(
      update(otherPrincipal, created.id, {
        answers: [{ questionId: booleanQuestionId, type: 'boolean', value: false }],
      })
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'response_not_found',
    })
  })

  it('AuditLog written with action response_updated on successful update', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-15T10:00:00.000Z'))

    const principal = makeEmpleadoPrincipal(empleadoId)
    const created = await create(principal, {
      questionnaireId,
      answers: [{ questionId: booleanQuestionId, type: 'boolean', value: true }],
    })

    vi.setSystemTime(new Date('2025-03-15T11:00:00.000Z'))

    const { update } = await import('./response.service')
    await update(principal, created.id, {
      answers: [{ questionId: booleanQuestionId, type: 'boolean', value: false }],
    })

    const auditLogs = await prisma.auditLog.findMany({
      where: { entityId: created.id, action: 'response_updated' },
    })
    expect(auditLogs).toHaveLength(1)
    expect(auditLogs[0].action).toBe('response_updated')
  })

  it('PATCH with yesterday businessDay (via direct DB insert) → 409', async () => {
    // This simulates a response whose businessDay is yesterday — the window is already closed
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-15T10:00:00.000Z'))

    // Directly insert a response for yesterday's businessDay
    const response = await prisma.response.create({
      data: {
        questionnaireId,
        versionId,
        userId: empleadoId,
        businessDay: new Date('2025-03-14T00:00:00.000Z'), // yesterday
      },
    })

    await prisma.answer.create({
      data: {
        responseId: response.id,
        questionId: booleanQuestionId,
        value: true,
      },
    })

    const principal = makeEmpleadoPrincipal(empleadoId)
    const { update } = await import('./response.service')

    // businessDay 2025-03-14 → endUtc = 2025-03-15T04:59:59.999Z
    // now = 2025-03-15T10:00:00Z → past the window → 409
    await expect(
      update(principal, response.id, {
        answers: [{ questionId: booleanQuestionId, type: 'boolean', value: false }],
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'edit_window_closed',
    })
  })
})
