<template>
  <div class="coefficient-calculation-shell">
    <CoefficientCalculationDesktopView v-if="!isMobileLayout" :calculation="calculation" :disabled="!editorReady" :application-loading="labStore.applyingParameters || labStore.loading" @open-application="openApplicationDialog" />
    <MobileCoefficientCalculation v-else :calculation="calculation" :disabled="!editorReady" :application-loading="labStore.applyingParameters || labStore.loading" @open-application="openApplicationDialog" />
    <section class="panel coefficient-draft-panel">
      <CalculationDraftStatus :status="draft.status.value" :updated-at="draft.updatedAt.value" :conflict="draft.conflict.value" @retry="draft.retry" @use-server="draft.useServerVersion" @overwrite="confirmOverwrite" />
    </section>
    <CoefficientApplicationDialog :key="applicationDialogKey" :visible="applicationDialogVisible" :sample-indices="sortedSampleIndices" :loading="labStore.applyingParameters" :mobile="isMobileLayout" @cancel="closeApplicationDialog" @confirm="handleApplyParameters" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type WatchStopHandle } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import CalculationDraftStatus from '@/components/calculation/CalculationDraftStatus.vue'
import CoefficientApplicationDialog from '@/components/lab-sheet/CoefficientApplicationDialog.vue'
import CoefficientCalculationDesktopView from './CoefficientCalculationDesktopView.vue'
import MobileCoefficientCalculation from './MobileCoefficientCalculation.vue'
import { useCalculationDraft, type CalculationDraftAdapter } from '@/composables/useCalculationDraft'
import { migrateLegacyCoefficientDraft, normalizeCoefficientDraft, useCoefficientCalculation } from '@/composables/useCoefficientCalculation'
import { useMobileLayout } from '@/composables/useMobileLayout'
import { useLabSheetStore } from '@/stores/labSheet'
import type { CoefficientDraftPayload } from '@/types/calculationDraft'

const props = defineProps<{ accountId: string }>()
const labStore = useLabSheetStore()
const { isMobileLayout } = useMobileLayout()
const calculation = useCoefficientCalculation()
const applicationDialogVisible = ref(false)
const applicationDialogKey = ref(0)
const applying = ref(false)
const editorReady = ref(false)
const sortedSampleIndices = computed(() => labStore.sampleBlocks.map((block) => block.index).sort((a, b) => a - b))
let ignoredAppliedSnapshot: CoefficientDraftPayload | null = null
let stopDraftWatcher: WatchStopHandle | null = null
let unmounted = false

const adapter: CalculationDraftAdapter<CoefficientDraftPayload> = {
  kind: 'coefficient',
  legacyStorageKey: `ys_coefficient_calculation_inputs:${props.accountId}`,
  cacheStorageKey: `ys_calculation_draft_cache:coefficient:${props.accountId}`,
  defaults: calculation.snapshot,
  normalize: normalizeCoefficientDraft,
  migrateLegacy: migrateLegacyCoefficientDraft,
  snapshot: calculation.snapshot,
  apply(payload) {
    const normalized = normalizeCoefficientDraft(payload)
    calculation.apply(normalized)
    ignoredAppliedSnapshot = normalized
  }
}
const draft = useCalculationDraft<CoefficientDraftPayload>(adapter)
if (draft.status.value !== 'loading') {
  editorReady.value = true
  installDraftWatcher()
}

onMounted(async () => {
  try { await draft.load() } finally {
    if (unmounted) return
    ignoredAppliedSnapshot = null
    editorReady.value = true
    installDraftWatcher()
  }
})

onUnmounted(() => {
  unmounted = true
  stopDraftWatcher?.()
  labStore.disconnectRealtime()
})

async function confirmOverwrite() {
  try {
    await ElMessageBox.confirm('覆盖后将用当前输入替换服务器上的更新，是否继续？', '确认覆盖服务器版本', { type: 'warning', confirmButtonText: '确认覆盖', cancelButtonText: '保留当前冲突' })
    await draft.overwriteServerVersion()
  } catch { /* cancellation intentionally keeps the conflict */ }
}

async function openApplicationDialog() {
  if (applicationDialogVisible.value || labStore.loading) return
  const loaded = await labStore.loadCurrentSheet()
  if (!loaded) return
  if (!labStore.sampleBlocks.length) {
    ElMessage.warning('当天暂无可应用的样品')
    return
  }
  applicationDialogVisible.value = true
}

async function handleApplyParameters(startIndex: number) {
  if (applying.value || labStore.applyingParameters) return
  applying.value = true
  try {
    const applied = await labStore.applyParametersFromIndex({ ...calculation.parameters }, startIndex)
    if (!applied) {
      ElMessage.error('应用系数前的数据保存失败，请处理后重试')
      return
    }
    applicationDialogVisible.value = false
    ElMessage.success(`已从样品 ${String(startIndex).padStart(3, '0')} 开始应用新参数`)
  } catch (error) {
    if (isMissingStartBoundaryError(error)) {
      let loaded: boolean
      try {
        loaded = await labStore.loadCurrentSheet()
      } catch {
        applicationDialogKey.value += 1
        applicationDialogVisible.value = true
        ElMessage.error('起始样品已不存在，但当天数据刷新失败，请稍后重试')
        return
      }
      applicationDialogKey.value += 1
      if (loaded === false) {
        ElMessage.error('起始样品已不存在，但当天数据刷新失败，请稍后重试')
        return
      }
      if (!labStore.sampleBlocks.length) {
        applicationDialogVisible.value = false
        ElMessage.warning('当天暂无可应用的样品')
        return
      }
      applicationDialogVisible.value = true
      ElMessage.error('起始样品已不存在，已刷新当天数据，请重新选择')
      return
    }
    ElMessage.error('应用系数失败，请稍后重试')
  } finally { applying.value = false }
}

function closeApplicationDialog() {
  if (!labStore.applyingParameters && !applying.value) applicationDialogVisible.value = false
}
function installDraftWatcher() {
  if (stopDraftWatcher) return
  stopDraftWatcher = watch(
    [calculation.parameters, calculation.standardRows, calculation.calculationRows, calculation.standardAddCount, calculation.calculationAddCount],
    () => {
      let current: CoefficientDraftPayload
      try {
        current = calculation.snapshot()
      } catch {
        ignoredAppliedSnapshot = null
        draft.scheduleSave()
        return
      }
      if (ignoredAppliedSnapshot && equalDraft(current, ignoredAppliedSnapshot)) {
        ignoredAppliedSnapshot = null
        return
      }
      ignoredAppliedSnapshot = null
      draft.scheduleSave()
    },
    { deep: true }
  )
}
function equalDraft(left: CoefficientDraftPayload, right: CoefficientDraftPayload) { return JSON.stringify(left) === JSON.stringify(right) }
function isMissingStartBoundaryError(error: unknown) {
  const raw = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message
  const message = typeof raw === 'string' ? raw : raw && typeof raw === 'object' && typeof (raw as { message?: unknown }).message === 'string' ? (raw as { message: string }).message : ''
  return message.includes('起始样品不存在')
}
</script>

<style scoped lang="scss">
.coefficient-calculation-shell { display: grid; min-width: 0; gap: 10px; }
.coefficient-draft-panel { min-width: 0; padding-block: 10px; }
</style>
