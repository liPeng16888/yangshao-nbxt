import { h, onBeforeUnmount, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { useLabTotalMonitorStore } from '@/stores/labTotalMonitor'
import { tryUseTenantRealtimeStore } from '@/stores/tenantRealtime'
import type { SampleBlock } from '@/types/labSheet'
import { assessLabTotal, totalAssessmentMessage } from '../../server/src/common/lab-total-monitor'

export function useLabTotalMonitor() {
  const monitor = useLabTotalMonitorStore()
  const auth = useAuthStore()
  const realtime = tryUseTenantRealtimeStore()
  const { rules, error } = storeToRefs(monitor)
  let timer: ReturnType<typeof setInterval> | undefined
  let unregister: (() => void) | undefined
  const refresh = () => { if (document.visibilityState !== 'hidden') void monitor.load() }
  const actorKey = () => `${auth.user?.id || ''}:${monitor.ownerId}:${auth.user?.permissionVersion || 0}`
  watch(actorKey, () => { void monitor.load() }, { immediate: true })
  onMounted(() => {
    // Focus/polling also catches missed SSE events and connects both local mock origins.
    timer = setInterval(refresh, 15_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    unregister = realtime?.registerModule('lab-total-monitor', { isDirty: () => false, refresh: async () => { await monitor.load() } })
  })
  onBeforeUnmount(() => { clearInterval(timer); unregister?.(); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) })

  async function confirmGeneration(blocks: SampleBlock[], kind: 'report' | 'sms') {
    const actor = actorKey()
    if (!await monitor.load()) { ElMessage.error('合量监测规则加载失败，暂不能生成，请重试'); return false }
    if (actor !== actorKey()) return false
    const version = monitor.config?.version
    const anomalies = blocks.map((block) => ({ block, assessment: assessLabTotal(block, monitor.rules) })).filter((row) => row.assessment.abnormal)
    if (!anomalies.length) return true
    const label = kind === 'report' ? '报告' : '短信'
    const details = anomalies.map(({ block, assessment }) => `样品 ${block.inputs.sequence || block.index}${block.inputs.sampleNumber ? `（${block.inputs.sampleNumber}）` : ''}：${totalAssessmentMessage(assessment)}`)
    try {
      await ElMessageBox.confirm(h('div', { style: { whiteSpace: 'pre-line', maxHeight: '320px', overflowY: 'auto' } },
        [`已选样品中有 ${anomalies.length} 个合量异常：`, ...details, `是否仍然生成${label}？`].join('\n\n')),
      '合量异常', { type: 'warning', confirmButtonText: `仍然生成${label}`, cancelButtonText: '返回检查', closeOnClickModal: false })
      if (actor !== actorKey()) return false
      if (monitor.config?.version !== version) { ElMessage.warning('监测规则已更新，请重新生成并确认'); return false }
      return true
    } catch { return false }
  }
  return { rules, error, reload: monitor.load, confirmGeneration }
}
