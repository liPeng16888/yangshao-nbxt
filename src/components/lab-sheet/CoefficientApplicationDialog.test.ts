import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { afterEach, describe, expect, it } from 'vitest'
import CoefficientApplicationDialog from './CoefficientApplicationDialog.vue'

function mountDialog(props: Partial<InstanceType<typeof CoefficientApplicationDialog>['$props']> = {}) {
  return mount(CoefficientApplicationDialog, {
    props: {
      visible: true,
      sampleIndices: [1, 2, 3, 4],
      loading: false,
      ...props
    },
    global: { plugins: [ElementPlus] },
    attachTo: document.body
  })
}

function dialogElement(selector: string) {
  const element = document.body.querySelector<HTMLElement>(selector)
  if (!element) throw new Error(`Missing dialog element: ${selector}`)
  return element
}

async function selectStartSample(index: number) {
  dialogElement('[data-testid="coefficient-start-select"] .el-select__wrapper').click()
  await nextTick()
  const option = Array.from(document.body.querySelectorAll<HTMLElement>('.el-select-dropdown__item'))
    .find((item) => item.textContent?.trim() === String(index).padStart(3, '0'))
  if (!option) throw new Error(`Missing sample option: ${index}`)
  option.click()
  await nextTick()
}

describe('CoefficientApplicationDialog', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('requires a start sample and explains the affected range before confirming', async () => {
    const wrapper = mountDialog()
    await nextTick()

    expect(dialogElement('[data-testid="confirm-coefficient-application"]').hasAttribute('disabled')).toBe(true)
    await selectStartSample(3)
    expect(document.body.textContent).toContain('003（含）')
    expect(document.body.textContent).toContain('并立即重新计算 003 及后续已有样品')
    expect(document.body.textContent).toContain('001～002 保持不变')
    dialogElement('[data-testid="confirm-coefficient-application"]').click()
    expect(wrapper.emitted('confirm')).toEqual([[3]])
  })

  it('states that the first selected sample is included and existing samples are recalculated', async () => {
    mountDialog()
    await nextTick()

    await selectStartSample(1)

    expect(document.body.textContent).toContain('001（含）')
    expect(document.body.textContent).toContain('并立即重新计算 001 及后续已有样品')
  })

  it('prevents cancel, close, and Escape while the application request is loading', async () => {
    const wrapper = mountDialog({ loading: true })
    await nextTick()

    const cancel = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === '取消')!
    expect(cancel.disabled).toBe(true)
    cancel.click()
    document.body.querySelector<HTMLButtonElement>('.el-dialog__headerbtn')?.click()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()

    expect(document.body.querySelector('.el-dialog__headerbtn')).toBeNull()
    expect(wrapper.emitted('cancel')).toBeUndefined()
  })

  it('cancels without submitting', async () => {
    const wrapper = mountDialog()
    await nextTick()

    Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent === '取消')!.click()

    expect(wrapper.emitted('cancel')).toEqual([[]])
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('clears the previous start sample when opened again', async () => {
    const wrapper = mountDialog()
    await nextTick()
    await selectStartSample(2)

    await wrapper.setProps({ visible: false })
    await wrapper.setProps({ visible: true })
    await nextTick()

    expect(document.body.textContent).not.toContain('002（含）')
    expect(dialogElement('[data-testid="confirm-coefficient-application"]').hasAttribute('disabled')).toBe(true)
  })

  it('disables confirmation when there are no samples', async () => {
    const wrapper = mountDialog({ sampleIndices: [] })
    await nextTick()

    expect(dialogElement('[data-testid="confirm-coefficient-application"]').hasAttribute('disabled')).toBe(true)
    wrapper.unmount()
  })
})
