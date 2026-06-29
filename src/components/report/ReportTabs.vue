<template>
  <el-segmented :model-value="kind" :options="options" @update:model-value="emit('update:kind', $event as ReportKind)" />
</template>

<script setup lang="ts">
import type { ReportKind } from '@/stores/report'

defineProps<{
  kind: ReportKind
}>()

const emit = defineEmits<{
  'update:kind': [kind: ReportKind]
}>()

const options = [
  { label: '收入数据统计', value: 'sample' },
  { label: '开支数据统计', value: 'finance' }
]
</script>
