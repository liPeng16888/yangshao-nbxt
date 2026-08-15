import type { SampleBlock, SamplePaymentStatus } from '@/types/labSheet'

export const samplePaymentStatusOptions: SamplePaymentStatus[] = ['已结款', '未结款', '月结款', '预存款']

export function isSampleAmountRequired(block: SampleBlock) {
  return Boolean(
    block.inputs.sampleNumber?.trim() ||
      block.inputs.customerText?.trim() ||
      block.inputs.customerIds?.length ||
      block.inputs.customers?.length
  )
}

export function isPrepaidSample(block: SampleBlock) {
  return block.inputs.paymentStatus === '预存款'
}

export function getSampleAmountLabel(block: SampleBlock) {
  return isPrepaidSample(block) ? '扣除次数' : '样品金额'
}

export function getSampleAmountPrecision(block: SampleBlock) {
  return isPrepaidSample(block) ? 0 : 2
}

export function hasSampleAmount(block: SampleBlock) {
  return typeof block.inputs.price === 'number' && Number.isFinite(block.inputs.price)
}

export function hasSamplePaymentStatus(block: SampleBlock) {
  return Boolean(block.inputs.paymentStatus)
}

export function hasSampleElementNote(block: SampleBlock) {
  return Boolean(block.inputs.elementNote?.trim())
}

export function isSamplePaymentStatusRequired(block: SampleBlock) {
  return isSampleAmountRequired(block)
}

export function isSampleElementNoteRequired(block: SampleBlock) {
  return isSampleAmountRequired(block)
}

export function isSampleCalculationBlocked(block: SampleBlock) {
  return isSampleAmountRequired(block) && (
    !hasSampleAmount(block) ||
    !hasSamplePaymentStatus(block) ||
    !hasSampleElementNote(block)
  )
}

export function getSampleCalculationBlockMessage(block: SampleBlock) {
  const missingActions: string[] = []
  if (!hasSampleAmount(block)) missingActions.push(isPrepaidSample(block) ? '输入扣除次数' : '输入样品金额')
  if (!hasSamplePaymentStatus(block)) missingActions.push('选择费用状态')
  if (!hasSampleElementNote(block)) missingActions.push('选择化验元素')

  if (missingActions.length === 1) return `请先${missingActions[0]}`
  if (missingActions.length === 2) return `请先${missingActions[0]}并${missingActions[1]}`
  if (missingActions.length > 2) return `请先${missingActions.slice(0, -1).join('、')}并${missingActions.at(-1)}`
  return '请先完善样品金额、费用状态和化验元素'
}

export function isCompletedSampleSensitiveHidden(block: SampleBlock, canViewCompletedSensitiveData: boolean) {
  return Boolean(block.inputs.completed && !canViewCompletedSensitiveData)
}
