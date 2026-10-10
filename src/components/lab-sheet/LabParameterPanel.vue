<template>
  <section class="parameter-panel panel">
    <button v-if="props.mobile" class="parameter-mobile-toggle" type="button" @click="mobileExpanded = !mobileExpanded">
      <span>
        <strong>9 项计算参数</strong>
        <small>沿用当前数据表参数</small>
      </span>
      <b>{{ mobileExpanded ? '收起' : '展开' }}</b>
    </button>
    <div v-if="!props.mobile || mobileExpanded" class="parameter-grid" :class="{ 'parameter-grid--mobile': props.mobile }">
      <label v-for="item in labParameterLabels" :key="item.key" class="parameter-item">
        <span>{{ item.label }}</span>
        <el-input-number
          v-model="draft[item.key]"
          :precision="3"
          :step="0.01"
          controls-position="right"
          class="parameter-input"
          :disabled="props.readonly"
          @change="submit"
        />
      </label>
    </div>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import type { LabParameter } from '@/types/labSheet'
import { defaultLabParameters, labParameterLabels } from '@/constants/labSheetTemplate'

const props = defineProps<{
  parameters: LabParameter | null
  saving?: boolean
  readonly?: boolean
  mobile?: boolean
}>()

const emit = defineEmits<{
  save: [parameters: LabParameter]
}>()

const draft = reactive<LabParameter>({ ...defaultLabParameters })
const mobileExpanded = ref(false)

watch(
  () => props.parameters,
  (parameters) => {
    Object.assign(draft, parameters || defaultLabParameters)
  },
  { immediate: true, deep: true }
)

function submit() {
  if (props.readonly) return
  emit('save', { ...draft })
}
</script>

<style scoped lang="scss">
.parameter-panel {
  position: sticky;
  top: 126px;
  z-index: 8;
}

.parameter-mobile-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 52px;
  padding: 9px 12px;
  color: var(--ui-text);
  background: #ffffff;
  border: 0;
  border-radius: 8px;
  text-align: left;

  span {
    display: grid;
    gap: 2px;
  }

  strong {
    font-size: 14px;
  }

  small {
    color: var(--ui-text-muted);
    font-size: 11px;
  }

  b {
    color: var(--ui-accent);
    font-size: 13px;
  }
}

.parameter-grid {
  display: grid;
  grid-template-columns: repeat(9, minmax(116px, 1fr));
  gap: 0;
  overflow-x: auto;
  padding: 12px;
}

.parameter-grid--mobile {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  overflow: visible;
  padding: 0 10px 10px;

  .parameter-item {
    min-width: 0;
    padding: 8px;
    border: 1px solid var(--ui-line);
    border-radius: 8px;

    span {
      font-size: 13px;
      text-align: left;
    }
  }

  :deep(.parameter-input .el-input__wrapper) {
    min-height: 44px;
  }
}

@media (max-width: 374px) {
  .parameter-grid--mobile {
    grid-template-columns: 1fr;
  }
}

.parameter-item {
  min-width: 116px;
  padding: 8px;
  color: var(--ui-text);
  background: #fff;
  border: 0;
  border-right: 1px solid var(--ui-line-soft);

  &:first-child {
    border-left: 0;
  }

  span {
    display: block;
    text-align: center;
  }

  span {
    margin-bottom: 6px;
    font-size: 13px;
    font-weight: 500;
  }
}

.parameter-input {
  width: 100%;
}

:deep(.parameter-input .el-input__inner) {
  color: var(--ui-text);
  font-size: 14px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  -webkit-text-fill-color: var(--ui-text);
}
</style>
