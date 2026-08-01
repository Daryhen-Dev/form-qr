import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/db'
import { getCompliance, getPending, getHistory } from '@/lib/services/report.service'
import type { Principal } from '@/lib/types'

/**
 * Integration tests for report.service (Slice 6).
 * Uses the form_qr_test database. The global setup truncates before each test,
 * so we seed within beforeEach.
 */

const adminPrincipal: Principal = {
  userId: 'admin-reports-test',
  role: 'Administrador',
  passwordChangeRequired: false,
}

const secPrincipal: Principal = {
  userId: 'sec-reports-test',
  role: 'Secretario',
  passwordChangeRequired: false,
}

const empPrincipal: Principal = {
  userId: 'emp-reports-test',
  role: 'Empleado',
  passwordChangeRequired: false,
}

// Shared seeded IDs
let branchId: string
let questionnaireId: string
let versionId: string
let employeeIds: string[]

/**
 * Seeds: admin user, branch, published questionnaire assigned to branch,
 * 5 Empleado users assigned to branch, 3 of whom have responded for 2026-08-01.
 */
async function seedReportFixture() {
  // Admin user
  await prisma.user.create({
    data: {
      id: adminPrincipal.userId,
      nombres: 'Admin',
      apellidos: 'Reports',
      cedula: '99990001',
      passwordHash: 'not-used',
      role: 'Administrador',
      passwordChangeRequired: false,
    },
  })

  // Branch
  const branch = await prisma.branch.create({ data: { name: 'Report Test Branch' } })
  branchId = branch.id

  // Questionnaire + published version + questions
  const questionnaire = await prisma.questionnaire.create({
    data: { title: 'Report Test Questionnaire' },
  })
  questionnaireId = questionnaire.id

  const version = await prisma.questionnaireVersion.create({
    data: {
      questionnaireId,
      versionNumber: 1,
      status: 'published',
      publishedAt: new Date(),
    },
  })
  versionId = version.id

  await prisma.questionnaire.update({
    where: { id: questionnaireId },
    data: { currentVersionId: versionId },
  })

  await prisma.question.createMany({
    data: [
      { versionId, order: 1, type: 'boolean', prompt: 'Was the area clean?', required: true, config: {} },
      { versionId, order: 2, type: 'short_text', prompt: 'Any comments?', required: false, config: {} },
    ],
  })

  // Assign questionnaire to branch
  await prisma.questionnaireBranch.create({
    data: { questionnaireId, branchId },
  })

  // 5 Empleado users assigned to the branch
  employeeIds = []
  for (let i = 0; i < 5; i++) {
    const user = await prisma.user.create({
      data: {
        nombres: `Employee${i}`,
        apellidos: `Test${i}`,
        cedula: `88880${i}01`,
        passwordHash: 'not-used',
        role: 'Empleado',
        passwordChangeRequired: false,
      },
    })
    employeeIds.push(user.id)
    await prisma.branchAssignment.create({ data: { userId: user.id, branchId } })
  }

  // 3 of 5 responded for business day 2026-08-01
  const businessDay = new Date('2026-08-01T00:00:00.000Z')
  const questions = await prisma.question.findMany({ where: { versionId } })
  for (let i = 0; i < 3; i++) {
    const resp = await prisma.response.create({
      data: { questionnaireId, versionId, userId: employeeIds[i], businessDay },
    })
    await prisma.answer.createMany({
      data: questions.map((q) => ({
        responseId: resp.id,
        questionId: q.id,
        value: q.type === 'boolean' ? true : 'test answer',
      })),
    })
  }
}

// ---------------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------------

describe('report.service integration — compliance', () => {
  beforeEach(async () => {
    await seedReportFixture()
  })

  it('returns correct totalAssigned, responded, pending, rate for a single day', async () => {
    const result = await getCompliance(adminPrincipal, {
      from: '2026-08-01',
      to: '2026-08-01',
      page: 1,
      pageSize: 20,
    })

    expect(result.summary.totalAssigned).toBe(5)
    expect(result.summary.responded).toBe(3)
    expect(result.summary.pending).toBe(2)
    expect(result.summary.complianceRate).toBe(0.6)
    expect(result.details.items).toHaveLength(5)
  })

  it('Secretario can also access compliance', async () => {
    const result = await getCompliance(secPrincipal, {
      from: '2026-08-01',
      to: '2026-08-01',
      page: 1,
      pageSize: 20,
    })
    expect(result.summary.totalAssigned).toBe(5)
  })

  it('Empleado → 403', async () => {
    await expect(
      getCompliance(empPrincipal, { from: '2026-08-01', to: '2026-08-01', page: 1, pageSize: 20 })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('unknown branchId → 200 with empty results', async () => {
    const result = await getCompliance(adminPrincipal, {
      from: '2026-08-01',
      to: '2026-08-01',
      branchId: 'nonexistent-branch-id',
      page: 1,
      pageSize: 20,
    })
    expect(result.summary.totalAssigned).toBe(0)
    expect(result.details.items).toHaveLength(0)
  })

  it('filters by branchId correctly', async () => {
    const result = await getCompliance(adminPrincipal, {
      from: '2026-08-01',
      to: '2026-08-01',
      branchId,
      page: 1,
      pageSize: 20,
    })
    expect(result.summary.totalAssigned).toBe(5)
  })

  it('pagination works on details', async () => {
    const result = await getCompliance(adminPrincipal, {
      from: '2026-08-01',
      to: '2026-08-01',
      page: 1,
      pageSize: 3,
    })
    expect(result.details.items).toHaveLength(3)
    expect(result.details.total).toBe(5)
    expect(result.details.page).toBe(1)
    expect(result.details.pageSize).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// Pending
// ---------------------------------------------------------------------------

describe('report.service integration — pending', () => {
  beforeEach(async () => {
    await seedReportFixture()
  })

  it('returns only employees who have NOT responded', async () => {
    const result = await getPending(adminPrincipal, { businessDay: '2026-08-01' })

    expect(result.pending).toHaveLength(2)
    const pendingIds = result.pending.map((p) => p.employeeId)
    expect(pendingIds).toContain(employeeIds[3])
    expect(pendingIds).toContain(employeeIds[4])
  })

  it('day with no responses → all pending (200, not 404)', async () => {
    const result = await getPending(adminPrincipal, { businessDay: '2026-08-02' })
    expect(result.pending).toHaveLength(5)
  })

  it('Empleado → 403', async () => {
    await expect(
      getPending(empPrincipal, { businessDay: '2026-08-01' })
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

describe('report.service integration — history', () => {
  beforeEach(async () => {
    await seedReportFixture()
  })

  it('returns paginated enriched response records', async () => {
    const result = await getHistory(adminPrincipal, {
      from: '2026-08-01',
      to: '2026-08-01',
      page: 1,
      pageSize: 20,
    })

    expect(result.results.total).toBe(3)
    expect(result.results.items).toHaveLength(3)
    for (const entry of result.results.items) {
      expect(entry.answers.length).toBeGreaterThan(0)
      expect(entry.answers[0].prompt).toBeDefined()
      expect(entry.answers[0].type).toBeDefined()
      expect(entry.employeeName).toBeDefined()
      expect(entry.questionnaireTitle).toBe('Report Test Questionnaire')
      expect(entry.versionNumber).toBe(1)
      expect(entry.businessDay).toBe('2026-08-01')
    }
  })

  it('pagination with pageSize=2 yields correct total and partial page', async () => {
    const result = await getHistory(adminPrincipal, {
      from: '2026-08-01',
      to: '2026-08-01',
      page: 1,
      pageSize: 2,
    })
    expect(result.results.items).toHaveLength(2)
    expect(result.results.total).toBe(3)
  })

  it('filters by employeeId', async () => {
    const result = await getHistory(adminPrincipal, {
      from: '2026-08-01',
      to: '2026-08-01',
      employeeId: employeeIds[0],
      page: 1,
      pageSize: 20,
    })
    expect(result.results.total).toBe(1)
    expect(result.results.items[0].employeeId).toBe(employeeIds[0])
  })

  it('Empleado → 403', async () => {
    await expect(
      getHistory(empPrincipal, { from: '2026-08-01', to: '2026-08-01', page: 1, pageSize: 20 })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('business-day boundary: responses for 2026-08-01 not counted under 2026-08-02', async () => {
    const result = await getHistory(adminPrincipal, {
      from: '2026-08-02',
      to: '2026-08-02',
      page: 1,
      pageSize: 20,
    })
    expect(result.results.total).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Read-only guarantee
// ---------------------------------------------------------------------------

describe('report.service integration — read-only guarantee', () => {
  beforeEach(async () => {
    await seedReportFixture()
  })

  it('report calls do not INSERT/UPDATE/DELETE on domain tables', async () => {
    const beforeResponses = await prisma.response.count()
    const beforeAnswers = await prisma.answer.count()
    const beforeUsers = await prisma.user.count()

    await getCompliance(adminPrincipal, { from: '2026-08-01', to: '2026-08-01', page: 1, pageSize: 20 })
    await getPending(adminPrincipal, { businessDay: '2026-08-01' })
    await getHistory(adminPrincipal, { from: '2026-08-01', to: '2026-08-01', page: 1, pageSize: 20 })

    expect(await prisma.response.count()).toBe(beforeResponses)
    expect(await prisma.answer.count()).toBe(beforeAnswers)
    expect(await prisma.user.count()).toBe(beforeUsers)
  })
})
