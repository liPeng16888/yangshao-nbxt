<template>
  <el-dialog
    :model-value="visible"
    width="720px"
    title="创建样品复样"
    class="sample-retest-dialog sample-retest-dialog--mobile-ready"
    :close-on-click-modal="!saving"
    :close-on-press-escape="!saving"
    :show-close="!saving"
    @close="requestClose"
  >
    <el-alert
      title="选择一个或多个样品编号，为每个样品创建一组空白复样。已完成样品仍可复样。"
      type="info"
      show-icon
      :closable="false"
    />

    <el-checkbox-group v-model="selectedBlockIds" class="retest-options">
      <el-checkbox
        v-for="block in blocks"
        :key="block.id"
        :value="block.id"
        :disabled="saving || requiresCompletedDataAccess(block)"
        border
      >
        <span class="retest-option__number">{{ getBlockNumber(block) }}</span>
        <span class="retest-option__name">{{ getSampleName(block) }}</span>
        <el-tag :type="block.inputs.completed ? 'warning' : 'info'" effect="plain" size="small">
          {{ block.inputs.completed ? '已完成' : '未完成' }}
        </el-tag>
        <span class="retest-option__count">复样 {{ block.retests.length }} 组</span>
        <span v-if="requiresCompletedDataAccess(block)" class="retest-option__reason">验证后可复样</span>
      </el-checkbox>
    </el-checkbox-group>

    <template #footer>
      <div class="retest-footer">
        <span>已选择 {{ selectedBlockIds.length }} 个样品</span>
        <div class="retest-footer__actions">
          <el-button :disabled="saving" @click="requestClose">关闭</el-button>
          <el-button
            class="retest-submit"
            type="primary"
            :disabled="!selectedBlockIds.length || saving"
            :loading="saving"
            @click="submit"
          >
            创建复样
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
  create: [payload: { sampleBlockIds: string[] }]
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

function getSampleName(block: SampleBlock) {
  return block.inputs.sampleNumber?.trim() || '未填写样品名称'
}

function requiresCompletedDataAccess(block: SampleBlock) {
  return Boolean(block.inputs.completed && block.sensitiveFieldsHidden)
}

function requestClose() {
  if (props.saving) return
  emit('close')
}

function submit() {
  if (!selectedBlockIds.value.length || props.saving) return
  emit('create', { sampleBlockIds: [...selectedBlockIds.value] })
}
</script>

<style scoped lang="scss">
.retest-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  max-height: 440px;
  margin-top: 16px;
  overflow: auto;
}

.retest-options :deep(.el-checkbox) {
  width: 100%;
  min-height: 72px;
  height: auto;
  margin: 0;
  padding: 10px 12px;
}

.retest-options :deep(.el-checkbox__label) {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px 10px;
  width: 100%;
  min-width: 0;
}

.retest-option__number {
  color: #111827;
  font-weight: 700;
}

.retest-option__name {
  min-width: 0;
  overflow: hidden;
  color: #334155;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.retest-option__count,
.retest-option__reason {
  grid-column: 2 / -1;
  color: #64748b;
  font-size: 12px;
}

.retest-option__reason {
  color: #d97706;
}

.retest-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  color: #64748b;
}

.retest-footer__actions {
  display: flex;
  gap: 8px;
}

@media (max-width: 720px) {
  :global(.sample-retest-dialog--mobile-ready) {
    width: calc(100vw - 24px) !important;
    max-height: calc(100dvh - 24px);
    margin: 12px auto !important;
  }

  :global(.sample-retest-dialog--mobile-ready .el-dialog__body) {
    max-height: calc(100dvh - 180px);
    overflow: auto;
  }

  .retest-options {
    grid-template-columns: 1fr;
    max-height: none;
  }

  .retest-footer {
    align-items: stretch;
    flex-direction: column;
    padding-bottom: max(4px, env(safe-area-inset-bottom));
  }

  .retest-footer__actions {
    justify-content: flex-end;
  }

  .retest-footer__actions :deep(.el-button) {
    min-height: 44px;
  }
}
</style>
