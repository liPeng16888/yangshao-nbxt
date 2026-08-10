import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Employee, PayrollItem, PayrollRun } from '@/types/employeeAttendance'
import {
  createEmployeePayrollCanvasLayout,
  createPayrollSummaryCanvasLayout,
  downloadEmployeePayrollPng,
  downloadPayrollSummaryPng
} from './payrollPng'

const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

function makeEmployee(index = 1): Employee {
  return {
    id: `employee-${index}`,
    employeeNumber: String(index).padStart(3, '0'),
    name: `员工${index}`,
    status: 'ACTIVE',
    phone: '',
    idCardMasked: '',
    bankCardMasked: '',
    addressMasked: '',
    emergencyContactMasked: '',
    hireDate: '2026-01-01',
    terminationDate: '',
    baseSalary: 6000,
    attendanceBonus: 300,
    overtimeHourlyRate: 25,
    restQuotaDays: 4,
    hasPhoto: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

function makeItem(index = 1): PayrollItem {
  const employee = makeEmployee(index)
  return {
    id: `item-${index}`,
    employeeId: employee.id,
    employee,
    payableAmount: 6525.5 + index,
    issues: index === 1 ? ['存在待核对考勤'] : [],
    adjustments: [
      { id: `adjustment-${index}`, payrollItemId: `item-${index}`, amount: -12.3, reason: '餐费补扣' }
    ],
    calculationSnapshot: {
      generatedAt: '2026-08-31T12:00:00.000Z',
      input: {
        baseSalary: 6000,
        attendanceBonus: 300,
        scheduledWorkDays: 22,
        restQuotaDays: 4,
        countedLeaveDays: 1.5,
        absenceDays: 0,
        overtimeMinutes: 120,
        overtimeHourlyRate: 25,
        commissionAmount: 150.5,
        bonusAmount: 100,
        adjustments: [{ amount: -12.3 }]
      },
      result: {
        dailyRate: 272.73,
        excessLeaveDays: 0,
        leaveDeduction: 0,
        absenceDeduction: 0,
        overtimeHours: 2,
        overtimePay: 50,
        commissionAmount: 150.5,
        bonusAmount: 100,
        adjustmentAmount: -12.3,
        attendanceBonus: 300,
        payableAmount: 6588.2,
        issues: []
      }
    }
  }
}

function makeRun(count = 2): PayrollRun {
  const items = Array.from({ length: count }, (_, index) => makeItem(index + 1))
  return {
    id: 'run-2026-08',
    month: '2026-08',
    status: 'CONFIRMED',
    totalAmount: items.reduce((sum, item) => sum + item.payableAmount, 0),
    issueCount: items.reduce((sum, item) => sum + item.issues.length, 0),
    issues: ['1 名员工存在待核对项目'],
    items,
    confirmedAt: '2026-08-31T13:00:00.000Z'
  }
}

function mockCanvasContext() {
  const context = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'center',
    textBaseline: 'middle',
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 12 }))
  } as unknown as CanvasRenderingContext2D
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
  return context
}

function mockSuccessfulDownload() {
  const create = vi.fn(() => 'blob:employee-payroll')
  const revoke = vi.fn()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
    callback(new Blob(['png'], { type: 'image/png' }))
  })
  return { create, revoke }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.body.replaceChildren()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreateObjectURL })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevokeObjectURL })
})

describe('employee payroll PNG export', () => {
  it('uses a 2x canvas and grows the payslip for adjustment and issue rows', async () => {
    const shortItem = makeItem()
    shortItem.adjustments = []
    shortItem.issues = []
    const longItem = makeItem()
    longItem.adjustments.push(
      { id: 'a2', payrollItemId: longItem.id, amount: 20, reason: '补贴' },
      { id: 'a3', payrollItemId: longItem.id, amount: -10, reason: '补扣' }
    )
    longItem.issues.push('第二条异常')
    expect(createEmployeePayrollCanvasLayout(longItem).height)
      .toBeGreaterThan(createEmployeePayrollCanvasLayout(shortItem).height)

    const context = mockCanvasContext()
    let canvas: HTMLCanvasElement | undefined
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      canvas = this
      return context
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(null))

    await downloadEmployeePayrollPng(shortItem)

    const layout = createEmployeePayrollCanvasLayout(shortItem)
    expect(canvas?.width).toBe(layout.width * 2)
    expect(canvas?.height).toBe(layout.height * 2)
    expect(context.scale).toHaveBeenCalledWith(2, 2)
  })

  it('formats every displayed currency amount to two decimals', async () => {
    const context = mockCanvasContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(null))

    await downloadEmployeePayrollPng(makeItem())

    const text = vi.mocked(context.fillText).mock.calls.map(([value]) => String(value))
    expect(text).toEqual(expect.arrayContaining(['¥6000.00', '¥150.50', '-¥12.30', '¥6588.20']))
    expect(text).not.toContain('¥6000')
  })

  it('uses a sanitized deterministic Chinese PNG filename and leaves no download resources behind', async () => {
    mockCanvasContext()
    const objectUrl = mockSuccessfulDownload()
    let downloadedFilename = ''
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      downloadedFilename = (node as HTMLAnchorElement).download
      return Node.prototype.appendChild.call(document.body, node)
    })

    await expect(downloadEmployeePayrollPng(makeItem(), '2026/08 张三:*? 工资条')).resolves.toBe(true)

    expect(downloadedFilename).toBe('2026_08 张三___ 工资条.png')
    expect(objectUrl.revoke).toHaveBeenCalledWith('blob:employee-payroll')
    expect(document.body.querySelector('a')).toBeNull()
  })

  it('collapses repeated case-insensitive PNG suffixes to one canonical extension', async () => {
    mockCanvasContext()
    mockSuccessfulDownload()
    let downloadedFilename = ''
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      downloadedFilename = (node as HTMLAnchorElement).download
      return Node.prototype.appendChild.call(document.body, node)
    })

    await expect(downloadEmployeePayrollPng(makeItem(), '张三工资条.PnG.png.PNG')).resolves.toBe(true)

    expect(downloadedFilename).toBe('张三工资条.png')
  })

  it('grows the all-employee summary canvas for a long table', () => {
    const oneEmployee = createPayrollSummaryCanvasLayout(makeRun(1))
    const sixtyEmployees = createPayrollSummaryCanvasLayout(makeRun(60))

    expect(sixtyEmployees.width).toBe(oneEmployee.width)
    expect(sixtyEmployees.height).toBeGreaterThan(oneEmployee.height + 50 * 40)
    expect(sixtyEmployees.rowCount).toBe(60)
  })

  it('draws the summary month, status, every employee and two-decimal total', async () => {
    const context = mockCanvasContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(null))
    const run = makeRun(3)

    await downloadPayrollSummaryPng(run)

    const text = vi.mocked(context.fillText).mock.calls.map(([value]) => String(value))
    expect(text).toEqual(expect.arrayContaining([
      '2026年08月全员工资汇总表', '状态：已确认', '员工1', '员工2', '员工3',
      `¥${run.totalAmount.toFixed(2)}`
    ]))
  })

  it('returns false when the canvas context or blob is unavailable', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    await expect(downloadPayrollSummaryPng(makeRun())).resolves.toBe(false)

    vi.restoreAllMocks()
    mockCanvasContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(null))
    await expect(downloadPayrollSummaryPng(makeRun())).resolves.toBe(false)
  })

  it('returns false when canvas toBlob throws', async () => {
    mockCanvasContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(() => {
      throw new Error('toBlob failed')
    })

    await expect(downloadEmployeePayrollPng(makeItem())).resolves.toBe(false)
  })

  it('returns false when object URL creation is missing, empty or throws', async () => {
    for (const behavior of ['missing', 'empty', 'throw'] as const) {
      vi.restoreAllMocks()
      mockCanvasContext()
      vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
        callback(new Blob(['png'], { type: 'image/png' }))
      })
      if (behavior === 'missing') {
        Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: undefined })
      } else if (behavior === 'empty') {
        Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => '') })
      } else {
        Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => { throw new Error('URL failed') }) })
      }

      await expect(downloadPayrollSummaryPng(makeRun())).resolves.toBe(false)
      expect(document.body.querySelector('a')).toBeNull()
    }
  })

  it('falls back when link removal throws and reports a revoke cleanup failure without leaking the link', async () => {
    mockCanvasContext()
    const objectUrl = mockSuccessfulDownload()
    vi.spyOn(HTMLAnchorElement.prototype, 'remove').mockImplementation(() => {
      throw new Error('remove failed')
    })
    objectUrl.revoke.mockImplementation(() => {
      throw new Error('revoke failed')
    })

    await expect(downloadEmployeePayrollPng(makeItem())).resolves.toBe(false)

    expect(objectUrl.revoke).toHaveBeenCalledWith('blob:employee-payroll')
    expect(document.body.querySelector('a')).toBeNull()
  })

  it('returns false on timeout and ignores a late blob without leaking a URL or link', async () => {
    vi.useFakeTimers()
    mockCanvasContext()
    const objectUrl = mockSuccessfulDownload()
    let callback: BlobCallback | undefined
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((next) => { callback = next })
    const append = vi.spyOn(document.body, 'appendChild')

    const result = downloadPayrollSummaryPng(makeRun())
    await vi.advanceTimersByTimeAsync(5000)
    await expect(result).resolves.toBe(false)
    callback?.(new Blob(['late'], { type: 'image/png' }))

    expect(objectUrl.create).not.toHaveBeenCalled()
    expect(append).not.toHaveBeenCalled()
  })

  it('returns false and cleans partial resources for object URL, append and click failures', async () => {
    for (const failingStep of ['url', 'append', 'click'] as const) {
      vi.restoreAllMocks()
      document.body.replaceChildren()
      mockCanvasContext()
      const objectUrl = mockSuccessfulDownload()
      if (failingStep === 'url') objectUrl.create.mockImplementation(() => { throw new Error('URL failed') })
      if (failingStep === 'append') vi.spyOn(document.body, 'appendChild').mockImplementation(() => { throw new Error('append failed') })
      if (failingStep === 'click') vi.mocked(HTMLAnchorElement.prototype.click).mockImplementation(() => { throw new Error('click failed') })

      await expect(downloadPayrollSummaryPng(makeRun())).resolves.toBe(false)

      expect(document.body.querySelector('a')).toBeNull()
      if (failingStep !== 'url') expect(objectUrl.revoke).toHaveBeenCalledWith('blob:employee-payroll')
    }
  })
})
