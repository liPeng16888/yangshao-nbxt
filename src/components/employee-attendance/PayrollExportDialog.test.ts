import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElMessage } from 'element-plus'
import { defineComponent, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Employee, PayrollItem, PayrollRun } from '@/types/employeeAttendance'
import PayrollExportDialog from './PayrollExportDialog.vue'
import {
  downloadEmployeePayrollPng,
  downloadPayrollSummaryPng
} from '@/utils/payrollPng'

vi.mock('@/utils/payrollPng', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/utils/payrollPng')>(),
  downloadEmployeePayrollPng: vi.fn(),
  downloadPayrollSummaryPng: vi.fn()
}))

const DialogStub = defineComponent({
  name: 'ElDialog',
  props: { modelValue: Boolean, title: String, width: String },
  emits: ['close'],
  template: '<section v-if="modelValue"><h2>{{ title }}</h2><slot /><slot name="footer" /></section>'
})

function makeEmployee(): Employee {
  return {
    id: 'emp-1', employeeNumber: '001', name: '张三', status: 'ACTIVE', phone: '', idCardMasked: '', bankCardMasked: '',
    addressMasked: '', emergencyContactMasked: '', hireDate: '2026-01-01', terminationDate: '', baseSalary: 6000,
    attendanceBonus: 300, overtimeHourlyRate: 25, restQuotaDays: 4, hasPhoto: false,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

function makeItem(): PayrollItem {
  const employee = makeEmployee()
  return {
    id: 'item-1', employeeId: employee.id, employee, payableAmount: 6488.2, issues: [],
    adjustments: [{ id: 'a1', payrollItemId: 'item-1', amount: -12.3, reason: '补扣' }],
    calculationSnapshot: {
      generatedAt: '2026-08-31T12:00:00.000Z',
      input: { baseSalary: 6000, attendanceBonus: 300, scheduledWorkDays: 22, restQuotaDays: 4, countedLeaveDays: 1, absenceDays: 0, overtimeMinutes: 120, overtimeHourlyRate: 25, commissionAmount: 100, bonusAmount: 50, adjustments: [{ amount: -12.3 }] },
      result: { dailyRate: 272.73, excessLeaveDays: 0, leaveDeduction: 0, absenceDeduction: 0, overtimeHours: 2, overtimePay: 50, commissionAmount: 100, bonusAmount: 50, adjustmentAmount: -12.3, attendanceBonus: 300, payableAmount: 6488.2, issues: [] }
    }
  }
}

function makeRun(): PayrollRun {
  const item = makeItem()
  return { id: 'run-1', month: '2026-08', status: 'DRAFT', totalAmount: item.payableAmount, issueCount: 0, issues: [], items: [item] }
}

function mountDialog(props: { visible?: boolean; run?: PayrollRun | null; item?: PayrollItem | null } = {}) {
  return mount(PayrollExportDialog, {
    props: { visible: true, run: makeRun(), item: null, ...props },
    global: { plugins: [ElementPlus], stubs: { ElDialog: DialogStub } }
  })
}

function mockMessages() {
  return {
    success: vi.spyOn(ElMessage, 'success').mockReturnValue({ close: vi.fn() } as never),
    error: vi.spyOn(ElMessage, 'error').mockReturnValue({ close: vi.fn() } as never)
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PayrollExportDialog', () => {
  it('previews the selected employee payslip using the locked snapshot values', () => {
    const item = makeItem()
    const wrapper = mountDialog({ item })

    expect(wrapper.text()).toContain('张三工资条')
    expect(wrapper.text()).toContain('2026年08月')
    expect(wrapper.text()).toContain('¥6000.00')
    expect(wrapper.text()).toContain('-¥12.30')
    expect(wrapper.text()).toContain('¥6488.20')
  })

  it('previews the full monthly payroll summary when no employee is selected', () => {
    const wrapper = mountDialog()

    expect(wrapper.text()).toContain('全员工资汇总')
    expect(wrapper.text()).toContain('张三')
    expect(wrapper.text()).toContain('草稿')
    expect(wrapper.text()).toContain('¥6488.20')
  })

  it('prevents duplicate exports and closes after a successful employee download', async () => {
    const messages = mockMessages()
    let finish: (result: boolean) => void = () => undefined
    vi.mocked(downloadEmployeePayrollPng).mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const wrapper = mountDialog({ item: makeItem() })
    const button = wrapper.get('[data-testid="payroll-export-confirm"]')

    await button.trigger('click')
    await button.trigger('click')
    expect(downloadEmployeePayrollPng).toHaveBeenCalledTimes(1)

    finish(true)
    await flushPromises()
    expect(messages.success).toHaveBeenCalledWith('工资条图片已保存')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('uses the summary exporter and remains open with an actionable failure message', async () => {
    const messages = mockMessages()
    vi.mocked(downloadPayrollSummaryPng).mockResolvedValue(false)
    const run = makeRun()
    const wrapper = mountDialog({ run })

    await wrapper.get('[data-testid="payroll-export-confirm"]').trigger('click')
    await flushPromises()

    expect(downloadPayrollSummaryPng).toHaveBeenCalledWith(run)
    expect(messages.error).toHaveBeenCalledWith('工资图片生成失败，请重试')
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('recovers from a rejected export and allows a retry', async () => {
    const messages = mockMessages()
    vi.mocked(downloadPayrollSummaryPng).mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce(false)
    const wrapper = mountDialog()
    const button = wrapper.get('[data-testid="payroll-export-confirm"]')

    await button.trigger('click')
    await flushPromises()
    await button.trigger('click')
    await flushPromises()

    expect(downloadPayrollSummaryPng).toHaveBeenCalledTimes(2)
    expect(messages.error).toHaveBeenCalledTimes(2)
  })

  it('blocks header close while exporting and ignores a stale result after close and reopen', async () => {
    const messages = mockMessages()
    const completions: Array<(result: boolean) => void> = []
    vi.mocked(downloadPayrollSummaryPng).mockImplementation(() => new Promise((resolve) => {
      completions.push(resolve)
    }))
    const wrapper = mountDialog()
    const dialog = wrapper.getComponent(DialogStub)

    await wrapper.get('[data-testid="payroll-export-confirm"]').trigger('click')
    dialog.vm.$emit('close')
    await nextTick()
    expect(wrapper.emitted('close')).toBeUndefined()

    await wrapper.setProps({ visible: false })
    await wrapper.setProps({ visible: true })
    await wrapper.get('[data-testid="payroll-export-confirm"]').trigger('click')
    expect(downloadPayrollSummaryPng).toHaveBeenCalledTimes(2)

    completions[0](true)
    await flushPromises()
    expect(messages.success).not.toHaveBeenCalled()
    expect(wrapper.emitted('close')).toBeUndefined()

    await wrapper.get('[data-testid="payroll-export-confirm"]').trigger('click')
    expect(downloadPayrollSummaryPng).toHaveBeenCalledTimes(2)

    completions[1](true)
    await flushPromises()
    expect(messages.success).toHaveBeenCalledWith('工资汇总图片已保存')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
