<template>
  <el-dialog
    :model-value="visible"
    width="680px"
    title="标记样品完成"
    class="sample-completion-dialog"
    @close="emit('close')"
  >
    <el-alert
      title="选择对应编号后标记完成，已完成样品的编号区域会显示为橙色。"
      type="info"
      show-icon
      :closable="false"
    />

    <el-checkbox-group v-model="selectedBlockIds" class="completion-options">
      <el-checkbox v-for="block in blocks" :key="block.id" :value="block.id" border>
        <span class="completion-option__number">{{ getBlockNumber(block) }}</span>
        <el-tag :type="block.inputs.completed ? 'warning' : 'info'" effect="plain" size="small">
          {{ block.inputs.completed ? '已完成' : '未完成' }}
        </el-tag>
      </el-checkbox>
    </el-checkbox-group>

    <template #footer>
      <div class="completion-footer">
        <span>已选择 {{ selectedBlockIds.length }} 个样品</span>
        <div class="completion-footer__actions">
          <el-button @click="emit('close')">关闭</el-button>
          <el-button :disabled="!selectedBlockIds.length" :loading="saving" @click="submit(false)">取消完成标记</el-button>
          <el-button type="warning" :disabled="!selectedBlockIds.length" :loading="saving" @click="submit(true)">
            标记为已完成
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { SampleBlock } from '@/types/labSheet'

const props = defineProps<{
  visible: boolean
  blocks: SampleBlock[]
  saving?: boolean
}>()

const emit = defineEmits<{
  close: []
  apply: [payload: { blockIds: string[]; completed: boolean }]
}>()

const selectedBlockIds = ref<string[]>([])

watch(
  () => props.visible,
  (visible) => {
    if (visible) selectedBlockIds.value = []
  }
)

function getBlockNumber(block: SampleBlock) {
  return block.inputs.sequence?.trim() || String(block.index).padStart(3, '0')
}

function submit(completed: boolean) {
  if (!selectedBlockIds.value.length || props.saving) return
  emit('apply', { blockIds: [...selectedBlockIds.value], completed })
}
</script>

<style scoped lang="scss">
.completion-options {
  display: grid;
  gap: 10px;
  max-height: 420px;
  margin-top: 16px;
  overflow: auto;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.completion-options :deep(.el-checkbox) {
  width: 100%;
  height: 46px;
  margin: 0;
  padding: 0 12px;
}

.completion-options :deep(.el-checkbox__label) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
}

.completion-option__number {
  color: #111827;
  font-weight: 600;
}

.completion-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  color: #64748b;
}

.completion-footer__actions {
  display: flex;
  gap: 8px;
}

@media (max-width: 720px) {
  .completion-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .completion-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .completion-footer__actions {
    justify-content: flex-end;
  }
}
</style>
