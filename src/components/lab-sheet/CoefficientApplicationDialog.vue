<template>
  <el-dialog
    :model-value="visible"
    title="选择应用起始样品"
    width="460px"
    :close-on-click-modal="false"
    :close-on-press-escape="!loading"
    :show-close="!loading"
    :before-close="handleBeforeClose"
    @close="requestCancel"
  >
    <el-form label-position="top">
      <el-form-item label="从哪个样品开始应用">
        <el-select v-model="selectedStartIndex" data-testid="coefficient-start-select" placeholder="请选择样品">
          <el-option v-for="index in sampleIndices" :key="index" :label="formatIndex(index)" :value="index" />
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
        :disabled="loading || !selectedStartIndex"
        @click="confirmApplication"
      >确认应用</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  sampleIndices: number[]
  loading: boolean
}>()

const emit = defineEmits<{
  cancel: []
  confirm: [startIndex: number]
}>()

const selectedStartIndex = ref<number | null>(null)

const impactMessage = computed(() => {
  if (!selectedStartIndex.value) return ''
  const start = selectedStartIndex.value
  const first = Math.min(...props.sampleIndices)
  const selected = formatIndex(start)
  const impact = `将从样品 ${selected}（含）开始应用新的空白和系数，并立即重新计算 ${selected} 及后续已有样品`
  if (start === first) return `${impact}。`
  return `${impact}；${formatIndex(first)}～${formatIndex(start - 1)} 保持不变。`
})

watch(
  () => props.visible,
  (visible, wasVisible) => {
    if (visible && !wasVisible) selectedStartIndex.value = null
  }
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
  if (props.loading || !selectedStartIndex.value) return
  emit('confirm', selectedStartIndex.value)
}
</script>

<style scoped lang="scss">
.application-impact {
  margin: 0;
  color: #526273;
  line-height: 1.6;
}
</style>
