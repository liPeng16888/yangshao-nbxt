<template>
  <el-dialog
    :model-value="visible"
    title="选择应用起始样品"
    width="460px"
    :fullscreen="mobile"
    :close-on-click-modal="false"
    :close-on-press-escape="!loading"
    :show-close="!loading"
    :before-close="handleBeforeClose"
    @close="requestCancel"
  >
    <el-form label-position="top">
      <el-form-item label="从哪个样品开始应用">
        <el-select v-model="selectedStartIndex" data-testid="coefficient-start-select" placeholder="请选择样品">
          <el-option v-for="index in sortedSampleIndices" :key="index" :label="formatIndex(index)" :value="index" />
        </el-select>
      </el-form-item>
    </el-form>

    <p v-if="selectedStartIndex" class="application-impact">{{ impactMessage }}</p>

    <template #footer>
      <el-button :disabled="loading" @click="requestCancel">取消</el-button>
      <el-button
        data-testid="confirm-coefficient-application"
        type="primary"
        :loading="loading"
        :disabled="loading || !isSelectedStartValid"
        @click="confirmApplication"
      >确认应用</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  visible: boolean
  sampleIndices: number[]
  loading: boolean
  mobile?: boolean
}>(), { mobile: false })

const emit = defineEmits<{
  cancel: []
  confirm: [startIndex: number]
}>()

const selectedStartIndex = ref<number | null>(null)
const sortedSampleIndices = computed(() => Array.from(new Set(
  (props.sampleIndices as unknown[]).filter((index): index is number => (
    typeof index === 'number' && Number.isSafeInteger(index) && index > 0
  ))
)).sort((left, right) => left - right))
const isSelectedStartValid = computed(() => (
  selectedStartIndex.value !== null && sortedSampleIndices.value.includes(selectedStartIndex.value)
))

const impactMessage = computed(() => {
  if (!selectedStartIndex.value) return ''
  const start = selectedStartIndex.value
  const first = sortedSampleIndices.value[0]
  const selected = formatIndex(start)
  const impact = `将从样品 ${selected}（含）开始应用新的空白和系数，并立即重新计算 ${selected} 及后续已有样品`
  if (start === first) return `${impact}。`
  return `${impact}；${formatIndex(first)}～${formatIndex(start - 1)} 保持不变。`
})

watch(
  [() => props.visible, sortedSampleIndices],
  ([visible, indices], [wasVisible]) => {
    if (visible && !wasVisible) selectedStartIndex.value = null
    else if (visible && selectedStartIndex.value !== null && !indices.includes(selectedStartIndex.value)) selectedStartIndex.value = null
  },
  { flush: 'sync' }
)

function formatIndex(index: number) {
  return String(index).padStart(3, '0')
}

function requestCancel() {
  if (!props.loading) emit('cancel')
}

function handleBeforeClose(done: () => void) {
  if (!props.loading) done()
}

function confirmApplication() {
  const startIndex = selectedStartIndex.value
  if (props.loading || startIndex === null || !sortedSampleIndices.value.includes(startIndex)) return
  emit('confirm', startIndex)
}

defineExpose({ confirmApplication })
</script>

<style scoped lang="scss">
.application-impact {
  margin: 0;
  color: #526273;
  line-height: 1.6;
}
</style>
