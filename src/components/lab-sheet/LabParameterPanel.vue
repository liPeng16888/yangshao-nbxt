<template>
  <section class="parameter-panel panel">
    <div class="parameter-grid">
      <label v-for="item in labParameterLabels" :key="item.key" class="parameter-item">
        <span>{{ item.label }}</span>
        <el-input-number
          v-model="draft[item.key]"
          :precision="3"
          :step="0.01"
          controls-position="right"
          class="parameter-input"
          @change="submit"
        />
      </label>
    </div>
  </section>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { LabParameter } from '@/types/labSheet'
import { defaultLabParameters, labParameterLabels } from '@/constants/labSheetTemplate'

const props = defineProps<{
  parameters: LabParameter | null
  saving?: boolean
}>()

const emit = defineEmits<{
  save: [parameters: LabParameter]
}>()

const draft = reactive<LabParameter>({ ...defaultLabParameters })

watch(
  () => props.parameters,
  (parameters) => {
    Object.assign(draft, parameters || defaultLabParameters)
  },
  { immediate: true, deep: true }
)

function submit() {
  emit('save', { ...draft })
}
</script>

<style scoped lang="scss">
.parameter-panel {
  position: sticky;
  top: 126px;
  z-index: 8;
}

.parameter-grid {
  display: grid;
  grid-template-columns: repeat(9, minmax(116px, 1fr));
  gap: 0;
  overflow-x: auto;
  padding: 12px;
}

.parameter-item {
  min-width: 116px;
  padding: 8px;
  color: #c00000;
  background: #fff;
  border: 1px solid #111827;
  border-left: 0;

  &:first-child {
    border-left: 1px solid #111827;
  }

  span {
    display: block;
    text-align: center;
  }

  span {
    margin-bottom: 6px;
    font-size: 16px;
    font-weight: 700;
  }
}

.parameter-input {
  width: 100%;
}

:deep(.parameter-input .el-input__inner) {
  color: #c00000;
  font-size: 16px;
  font-weight: 700;
  -webkit-text-fill-color: #c00000;
}
</style>
