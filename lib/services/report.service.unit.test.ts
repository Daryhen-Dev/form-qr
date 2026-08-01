import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the repository
vi.mock('@/lib/repositories/report.repository', () => ({
  findActiveEmployeeAssignments: vi.fn(),
  findAssignedQuestionnaires: vi.fn(),
  findRespondedKeys: vi.fn(),
  findHistoryPage: vi.fn(),
  countHistory: vi.fn(),
}))

// Mock server-only
vi.mock('server-only', () => ({}))

import {
  getCompliance,
  getPending,
  getHistory,
} from './report.service'
import {
  findActiveEmployeeAssignments,
  findAssignedQuestionnaires,
  findRespondedKeys,
  findHistoryPage,
  countHistory,
} from '@/lib/repositories/report.repository'
import { ServiceError } from '@/lib/services/auth.service'
import type { Principal } from '@/lib/types'

const mockEmployees = findActiveEmployeeAssignments as ReturnType<typeof vi.fn>
const mockQuestionnaires = findAssignedQuestionnaires as ReturnType<typeof vi.fn>
const mockResponded = findRespondedKeys as ReturnType<typeof vi.fn>
const mockHistoryPage = findHistoryPage as ReturnType<typeof vi.fn>
const mockCountHistory = countHistory as ReturnType<typeof vi.fn>

const adminPrincipal: Principal = {
  userId: 'admin-1',
  role: 'Administrador',
  passwordChangeRequired: false,
}

const secPrincipal: Principal = {
  userId: 'sec-1',
  role: 'Secretario',
  passwordChangeRequired: false,
}

const empPrincipal: Principal = {
  userId: 'emp-1',
  role: 'Empleado',
  passwordChangeRequired: false,
}

describe('report.service — authz', () => {
  it('throws 403 for Empleado on getCompliance', async () => {
    await expect(
      getCompliance(empPrincipal, { from: '2026-08-01', to: '2026-08-01', page: 1, pageSize: 20 })
    ).rejects.toThrow(ServiceError)
    await expect(
      getCompliance(empPrincipal, { from: '2026-08-01', to: '2026-08-01', page: 1, pageSize: 20 })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('throws 403 for Empleado on getPending', async () => {
    await expect(
      getPending(empPrincipal, { businessDay: '2026-08-01' })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('throws 403 for Empleado on getHistory', async () => {
    await expect(
      getHistory(empPrincipal, { from: '2026-08-01', to: '2026-08-01', page: 1, pageSize: 20 })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('allows Administrador on getCompliance', async () => {
    mockEmployees.mockResolvedValue([])
    mockQuestionnaires.mockResolvedValue([])
    mockResponded.mockResolvedValue([])
    const result = await getCompliance(adminPrincipal, { from: '2026-08-01', to: '2026-08-01', page: 1, pageSize: 20 })
    expect(result.summary.totalAssigned).toBe(0)
  })

  it('allows Secretario on getCompliance', async () => {
    mockEmployees.mockResolvedValue([])
    mockQuestionnaires.mockResolvedValue([])
    mockResponded.mockResolvedValue([])
    const result = await getCompliance(secPrincipal, { from: '2026-08-01', to: '2026-08-01', page: 1, pageSize: 20 })
    expect(result.summary.totalAssigned).toBe(0)
  })
})

describe('report.service — compliance rate math', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('computes 7/10 = 0.70', async () => {
    // 2 employees × 1 questionnaire × 5 days = 10 pairs? No, let's use 10 employees × 1 q × 1 day
    const employees = Array.from({ length: 10 }, (_, i) => ({
      userId: `emp-${i}`,
      nombres: `Name${i}`,
      apellidos: `Last${i}`,
      branchId: 'b1',
      branchName: 'Branch 1',
    }))
    const questionnaires = [{ questionnaireId: 'q1', title: 'Q1', branchId: 'b1' }]
    // 7 of them responded
    const responded = employees.slice(0, 7).map((e) => ({
      userId: e.userId,
      questionnaireId: 'q1',
      businessDay: new Date('2026-08-01T00:00:00.000Z'),
    }))

    mockEmployees.mockResolvedValue(employees)
    mockQuestionnaires.mockResolvedValue(questionnaires)
    mockResponded.mockResolvedValue(responded)

    const result = await getCompliance(adminPrincipal, {
      from: '2026-08-01',
      to: '2026-08-01',
      page: 1,
      pageSize: 20,
    })

    expect(result.summary.totalAssigned).toBe(10)
    expect(result.summary.responded).toBe(7)
    expect(result.summary.pending).toBe(3)
    expect(result.summary.complianceRate).toBe(0.7)
  })

  it('handles 0 assigned → rate 0 (no division by zero)', async () => {
    mockEmployees.mockResolvedValue([])
    mockQuestionnaires.mockResolvedValue([])
    mockResponded.mockResolvedValue([])

    const result = await getCompliance(adminPrincipal, {
      from: '2026-08-01',
      to: '2026-08-01',
      page: 1,
      pageSize: 20,
    })

    expect(result.summary.totalAssigned).toBe(0)
    expect(result.summary.complianceRate).toBe(0)
  })

  it('handles 10/10 = 1.0 (all responded)', async () => {
    const employees = Array.from({ length: 10 }, (_, i) => ({
      userId: `emp-${i}`,
      nombres: `Name${i}`,
      apellidos: `Last${i}`,
      branchId: 'b1',
      branchName: 'Branch 1',
    }))
    const questionnaires = [{ questionnaireId: 'q1', title: 'Q1', branchId: 'b1' }]
    const responded = employees.map((e) => ({
      userId: e.userId,
      questionnaireId: 'q1',
      businessDay: new Date('2026-08-01T00:00:00.000Z'),
    }))

    mockEmployees.mockResolvedValue(employees)
    mockQuestionnaires.mockResolvedValue(questionnaires)
    mockResponded.mockResolvedValue(responded)

    const result = await getCompliance(adminPrincipal, {
      from: '2026-08-01',
      to: '2026-08-01',
      page: 1,
      pageSize: 20,
    })

    expect(result.summary.complianceRate).toBe(1)
  })
})

describe('report.service — assigned-set computation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('computes cartesian of employees × questionnaires per branch', async () => {
    // Branch B1: 2 employees, 2 questionnaires → 4 pairs
    const employees = [
      { userId: 'e1', nombres: 'A', apellidos: 'B', branchId: 'b1', branchName: 'B1' },
      { userId: 'e2', nombres: 'C', apellidos: 'D', branchId: 'b1', branchName: 'B1' },
    ]
    const questionnaires = [
      { questionnaireId: 'q1', title: 'Q1', branchId: 'b1' },
      { questionnaireId: 'q2', title: 'Q2', branchId: 'b1' },
    ]

    mockEmployees.mockResolvedValue(employees)
    mockQuestionnaires.mockResolvedValue(questionnaires)
    mockResponded.mockResolvedValue([])

    const result = await getCompliance(adminPrincipal, {
      from: '2026-08-01',
      to: '2026-08-01',
      page: 1,
      pageSize: 20,
    })

    expect(result.summary.totalAssigned).toBe(4) // 2 emp × 2 questionnaires
  })

  it('only assigns employees to questionnaires assigned to THEIR branch', async () => {
    // e1 in b1, e2 in b2; q1 assigned to b1 only
    const employees = [
      { userId: 'e1', nombres: 'A', apellidos: 'B', branchId: 'b1', branchName: 'B1' },
      { userId: 'e2', nombres: 'C', apellidos: 'D', branchId: 'b2', branchName: 'B2' },
    ]
    const questionnaires = [
      { questionnaireId: 'q1', title: 'Q1', branchId: 'b1' },
    ]

    mockEmployees.mockResolvedValue(employees)
    mockQuestionnaires.mockResolvedValue(questionnaires)
    mockResponded.mockResolvedValue([])

    const result = await getCompliance(adminPrincipal, {
      from: '2026-08-01',
      to: '2026-08-01',
      page: 1,
      pageSize: 100,
    })

    // Only e1 is assigned to q1 (both in b1). e2 is in b2 which has no q assignment.
    expect(result.summary.totalAssigned).toBe(1)
    expect(result.details.items[0].employeeId).toBe('e1')
  })
})

describe('report.service — pending', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns only employees who have NOT responded', async () => {
    const employees = [
      { userId: 'e1', nombres: 'A', apellidos: 'B', branchId: 'b1', branchName: 'B1' },
      { userId: 'e2', nombres: 'C', apellidos: 'D', branchId: 'b1', branchName: 'B1' },
      { userId: 'e3', nombres: 'E', apellidos: 'F', branchId: 'b1', branchName: 'B1' },
    ]
    const questionnaires = [{ questionnaireId: 'q1', title: 'Q1', branchId: 'b1' }]
    // e1 responded
    const responded = [
      { userId: 'e1', questionnaireId: 'q1', businessDay: new Date('2026-08-01T00:00:00.000Z') },
    ]

    mockEmployees.mockResolvedValue(employees)
    mockQuestionnaires.mockResolvedValue(questionnaires)
    mockResponded.mockResolvedValue(responded)

    const result = await getPending(adminPrincipal, { businessDay: '2026-08-01' })

    expect(result.pending).toHaveLength(2)
    const pendingIds = result.pending.map((p) => p.employeeId)
    expect(pendingIds).toContain('e2')
    expect(pendingIds).toContain('e3')
    expect(pendingIds).not.toContain('e1')
  })
})

describe('report.service — history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns paginated enriched entries', async () => {
    const historyRows = [
      {
        id: 'r1',
        questionnaireId: 'q1',
        questionnaireTitle: 'Survey',
        versionId: 'v1',
        versionNumber: 1,
        userId: 'e1',
        nombres: 'John',
        apellidos: 'Doe',
        businessDay: new Date('2026-08-01T00:00:00.000Z'),
        createdAt: new Date('2026-08-01T12:00:00.000Z'),
        answers: [
          { questionId: 'q1-1', value: true, question: { prompt: 'Is it good?', type: 'boolean' } },
        ],
      },
    ]
    mockHistoryPage.mockResolvedValue(historyRows)
    mockCountHistory.mockResolvedValue(1)

    const result = await getHistory(adminPrincipal, {
      from: '2026-08-01',
      to: '2026-08-01',
      page: 1,
      pageSize: 20,
    })

    expect(result.results.total).toBe(1)
    expect(result.results.items[0].employeeName).toBe('John Doe')
    expect(result.results.items[0].answers[0].prompt).toBe('Is it good?')
    expect(result.results.items[0].answers[0].type).toBe('boolean')
  })
})
