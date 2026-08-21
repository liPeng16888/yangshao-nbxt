<template>
  <div class="standard-calculation-shell">
    <StandardSampleDesktopView
      v-if="!isMobileLayout"
      v-bind="viewBindings"
      @reset-aluminum="resetAluminum"
      @reset-silicon="resetSilicon"
      @reset-iron="resetIron"
    />
    <MobileStandardSampleCards
      v-else
      v-bind="viewBindings"
      @reset-aluminum="resetAluminum"
      @reset-silicon="resetSilicon"
      @reset-iron="resetIron"
    />
    <section class="panel standard-draft-panel">
      <CalculationDraftStatus
        :status="draft.status.value"
        :updated-at="draft.updatedAt.value"
        :conflict="draft.conflict.value"
        @retry="draft.retry"
        @use-server="draft.useServerVersion"
        @overwrite="confirmOverwrite"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type WatchStopHandle } from 'vue'
import { ElMessageBox } from 'element-plus'
import CalculationDraftStatus from '@/components/calculation/CalculationDraftStatus.vue'
import MobileStandardSampleCards from '@/components/standard-sample/MobileStandardSampleCards.vue'
import StandardSampleDesktopView from '@/components/standard-sample/StandardSampleDesktopView.vue'
import { useCalculationDraft, type CalculationDraftAdapter } from '@/composables/useCalculationDraft'
import { useMobileLayout } from '@/composables/useMobileLayout'
import { useStandardSampleCalculation } from '@/composables/useStandardSampleCalculation'
import type { StandardSampleDraft } from '@/types/calculationDraft'
import type { AluminumStandardInput, RatioStandardInput } from '@/utils/standardSampleCalculator'

const props = defineProps<{
  accountId: string
}>()

const LEGACY_STORAGE_PREFIX = 'ys_standard_sample_inputs'
const RECOVERY_STORAGE_PREFIX = 'ys_calculation_draft_cache:standard-sample'
const aluminumKeys = ['highStandard', 'highReading', 'lowStandard', 'lowReading', 'baseValue'] as const
const ratioKeys = ['lowStandard', 'lowReading', 'highStandard', 'highReading'] as const

const { isMobileLayout } = useMobileLayout()
const calculation = useStandardSampleCalculation()
const {
  aluminum,
  silicon,
  iron,
  aluminumResult,
  siliconResult,
  ironResult,
  resetAluminum,
  resetSilicon,
  resetIron
} = calculation

let ignoredAppliedSnapshot: StandardSampleDraft | null = null
let stopDraftWatcher: WatchStopHandle | null = null
let unmounted = false
const editorReady = ref(false)

const adapter: CalculationDraftAdapter<StandardSampleDraft> = {
  kind: 'standard-sample',
  legacyStorageKey: `${LEGACY_STORAGE_PREFIX}:${props.accountId}`,
  cacheStorageKey: `${RECOVERY_STORAGE_PREFIX}:${props.accountId}`,
  defaults: calculation.snapshot,
  normalize: normalizeStandardSampleDraft,
  snapshot: calculation.snapshot,
  apply(payload) {
    const normalized = normalizeStandardSampleDraft(payload)
    Object.assign(aluminum, normalized.aluminum)
    Object.assign(silicon, normalized.silicon)
    Object.assign(iron, normalized.iron)
    ignoredAppliedSnapshot = normalized
  }
}

const draft = useCalculationDraft<StandardSampleDraft>(adapter)

const viewBindings = computed(() => ({
  aluminum,
  silicon,
  iron,
  aluminumResult: aluminumResult.value,
  siliconResult: siliconResult.value,
  ironResult: ironResult.value,
  disabled: !editorReady.value
}))

onMounted(async () => {
  try {
    await draft.load()
  } finally {
    if (unmounted) return
    ignoredAppliedSnapshot = null
    editorReady.value = true
    stopDraftWatcher = watch([aluminum, silicon, iron], () => {
      const current = calculation.snapshot()
      if (ignoredAppliedSnapshot && equalDraft(current, ignoredAppliedSnapshot)) {
        ignoredAppliedSnapshot = null
        return
      }
      ignoredAppliedSnapshot = null
      draft.scheduleSave()
    }, { deep: true })
  }
})

onUnmounted(() => {
  unmounted = true
  stopDraftWatcher?.()
})

async function confirmOverwrite() {
  try {
    await ElMessageBox.confirm(
      '覆盖后将用当前输入替换服务器上的更新，是否继续？',
      '确认覆盖服务器版本',
      {
        type: 'warning',
        confirmButtonText: '确认覆盖',
        cancelButtonText: '保留当前冲突'
      }
    )
    await draft.overwriteServerVersion()
  } catch {
    // Cancel keeps the conflict and local values for an explicit later choice.
  }
}

function normalizeStandardSampleDraft(value: unknown): StandardSampleDraft {
  const source = requireExactObject(value, ['aluminum', 'silicon', 'iron'])
  return {
    aluminum: normalizeNumbers<AluminumStandardInput>(source.aluminum, aluminumKeys),
    silicon: normalizeNumbers<RatioStandardInput>(source.silicon, ratioKeys),
    iron: normalizeNumbers<RatioStandardInput>(source.iron, ratioKeys)
  }
}

function normalizeNumbers<T>(value: unknown, keys: readonly string[]): T {
  const source = requireExactObject(value, keys)
  return Object.fromEntries(keys.map((key) => {
    const field = source[key]
    if (field !== null && (typeof field !== 'number' || !Number.isFinite(field))) {
      throw new TypeError('标样计算草稿数值无效')
    }
    return [key, field]
  })) as T
}

function requireExactObject(value: unknown, expectedKeys: readonly string[]) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('标样计算草稿格式无效')
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('标样计算草稿格式无效')
  }
  const source = value as Record<string, unknown>
  const keys = Reflect.ownKeys(source)
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key)) ||
    expectedKeys.some((key) => !Object.prototype.hasOwnProperty.call(source, key))
  ) {
    throw new TypeError('标样计算草稿字段无效')
  }
  return source
}

function equalDraft(left: StandardSampleDraft, right: StandardSampleDraft) {
  return aluminumKeys.every((key) => Object.is(left.aluminum[key], right.aluminum[key])) &&
    ratioKeys.every((key) => Object.is(left.silicon[key], right.silicon[key])) &&
    ratioKeys.every((key) => Object.is(left.iron[key], right.iron[key]))
}
</script>

<style scoped lang="scss">
.standard-calculation-shell {
  display: grid;
  min-width: 0;
  gap: 10px;
}

.standard-draft-panel {
  min-width: 0;
  padding-block: 10px;
}
</style>
