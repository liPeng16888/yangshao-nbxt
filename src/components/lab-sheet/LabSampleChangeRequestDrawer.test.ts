import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ElMessageBox } from 'element-plus'
import LabSampleChangeRequestDrawer from './LabSampleChangeRequestDrawer.vue'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import type { LabSampleChangeRequestDetail, LabSampleChangeRequestSummary } from '@/types/labSampleChangeRequest'

const DrawerStub = defineComponent({
  props: { modelValue: Boolean },
  emits: ['update:modelValue'],
  template: '<aside v-if="modelValue"><slot /></aside>'
})

const ButtonStub = defineComponent({
  props: { disabled: Boolean, loading: Boolean },
  emits: ['click'],
  template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
})

function makeSummary(overrides: Partial<LabSampleChangeRequestSummary> = {}): LabSampleChangeRequestSummary {
  return {
    id: 'pending',
    date: '2026-06-24',
    blockId: 'block-1',
    blockIndex: 1,
    sampleName: '历史样品',
    changedFieldLabels: ['样品编号', '铁'],
    reason: '复核原始记录',
    status: 'PENDING',
    review: null,
    withdrawnAt: null,
    createdAt: '2026-06-25T01:00:00.000Z',
    updatedAt: '2026-06-25T01:00:00.000Z',
    ...overrides
  }
}

function makeDetail(overrides: Partial<LabSampleChangeRequestDetail> = {}): LabSampleChangeRequestDetail {
  return {
    ...makeSummary(),
    sourceSnapshot: {
      inputs: { sampleNumber: '旧样品', ironRaw: 1 },
      results: {} as LabSampleChangeRequestDetail['sourceSnapshot']['results'],
      parameterSnapshot: { ...defaultLabParameters },
      updatedAt: '2026-06-24T01:00:00.000Z'
    },
    requestedChanges: { sampleNumber: '新样品', ironRaw: 2 },
    previewResults: {} as LabSampleChangeRequestDetail['previewResults'],
    settlementEffects: [{ month: '2026-06', customerName: '王总', previousStatus: '已结款' }],
    ...overrides
  }
}

function mountDrawer(
  rows: LabSampleChangeRequestSummary[],
  props: Partial<InstanceType<typeof LabSampleChangeRequestDrawer>['$props']> = {}
) {
  return mount(LabSampleChangeRequestDrawer, {
    props: {
      modelValue: true,
      rows,
      detail: null,
      loading: false,
      withdrawingId: '',
      ...props
    },
    global: {
      stubs: {
        ElDrawer: DrawerStub,
        ElButton: ButtonStub,
        ElTag: { template: '<span><slot /></span>' },
        ElEmpty: { template: '<div>暂无修改申请</div>' },
        ElSkeleton: { template: '<div><slot /></div>' }
      }
    }
  })
}

describe('LabSampleChangeRequestDrawer', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders terminal history and offers withdrawal only for pending rows', () => {
    const wrapper = mountDrawer([
      makeSummary(),
      makeSummary({
        id: 'approved',
        status: 'APPROVED',
        review: { remark: '已核对', reviewedAt: '2026-06-26T02:00:00.000Z' }
      })
    ])

    expect(wrapper.text()).toContain('2026-06-24')
    expect(wrapper.text()).toContain('历史样品')
    expect(wrapper.text()).toContain('样品编号、铁')
    expect(wrapper.text()).toContain('复核原始记录')
    expect(wrapper.text()).toContain('已通过')
    expect(wrapper.text()).toContain('已核对')
    expect(wrapper.find('[data-testid="withdraw-request-pending"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="withdraw-request-approved"]').exists()).toBe(false)
  })

  it('emits selection when a history row is opened', async () => {
    const wrapper = mountDrawer([makeSummary()])

    await wrapper.get('[data-testid="select-request-pending"]').trigger('click')

    expect(wrapper.emitted('select')).toEqual([['pending']])
  })

  it('confirms pending withdrawal and emits only after confirmation', async () => {
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const wrapper = mountDrawer([makeSummary()])

    await wrapper.get('[data-testid="withdraw-request-pending"]').trigger('click')

    expect(confirm).toHaveBeenCalledWith(
      '撤回后该申请会保留在历史记录中，且可重新提交修改申请。',
      '确认撤回修改申请',
      expect.objectContaining({ type: 'warning' })
    )
    expect(wrapper.emitted('withdraw')).toEqual([['pending']])
  })

  it('does not emit withdrawal when confirmation is cancelled', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue(new Error('cancel'))
    const wrapper = mountDrawer([makeSummary()])

    await wrapper.get('[data-testid="withdraw-request-pending"]').trigger('click')

    expect(wrapper.emitted('withdraw')).toBeUndefined()
  })

  it('renders selected detail fields, timestamps, and settlement effects when present', () => {
    const wrapper = mountDrawer([makeSummary()], { detail: makeDetail() })

    expect(wrapper.text()).toContain('旧样品')
    expect(wrapper.text()).toContain('新样品')
    expect(wrapper.text()).toContain('结算影响')
    expect(wrapper.text()).toContain('王总')
    expect(wrapper.text()).toContain('已结款')
    expect(wrapper.text()).toContain('2026-06-25')
  })

  it('disables all pending withdrawals while another withdrawal is running', () => {
    const wrapper = mountDrawer([
      makeSummary(),
      makeSummary({ id: 'pending-2', blockId: 'block-2', blockIndex: 2 })
    ], { withdrawingId: 'pending' })

    expect(wrapper.get('[data-testid="withdraw-request-pending"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="withdraw-request-pending-2"]').attributes('disabled')).toBeDefined()
  })
})
