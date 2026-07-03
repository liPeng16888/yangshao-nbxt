<template>
  <div class="lab-element-selector">
    <el-popover
      v-model:visible="panelVisible"
      :disabled="disabled"
      trigger="click"
      placement="top-start"
      width="720"
      popper-class="lab-element-selector-popper"
    >
      <template #reference>
        <button class="lab-element-selector__trigger" type="button" :disabled="disabled" :title="displayText || '选择化验元素'">
          <span class="lab-element-selector__text" :class="{ 'lab-element-selector__text--empty': !displayText }">
            {{ displayText || '选择化验元素' }}
          </span>
          <span class="lab-element-selector__action">选择</span>
        </button>
      </template>

      <div class="element-picker">
        <div class="element-picker__header">
          <strong>选择化验元素</strong>
          <span>按短信/报告元素顺序显示</span>
        </div>

        <section class="element-picker__section">
          <div class="element-picker__section-title">
            <span>常用组合</span>
            <small>可创建多组，一键套用</small>
          </div>
          <div v-if="groups.length" class="element-groups">
            <div v-for="group in groups" :key="group.id" class="element-group">
              <el-button size="small" plain @click="applyGroup(group)">{{ group.name }}</el-button>
              <span>{{ formatElementKeys(group.elementKeys) }}</span>
              <el-button link type="danger" :icon="Delete" @click="deleteGroup(group.id)">删除</el-button>
            </div>
          </div>
          <div v-else class="element-picker__empty">暂无常用组合</div>
        </section>

        <el-checkbox-group v-model="selectedKeys" class="element-picker__checkboxes" @change="handleSelectionChange">
          <el-checkbox v-for="element in labReportElements" :key="element.key" :label="element.key">
            {{ element.label }} <small v-if="element.symbol">{{ element.symbol }}</small>
          </el-checkbox>
        </el-checkbox-group>

        <div class="element-picker__create">
          <el-input v-model.trim="groupName" size="small" placeholder="输入组合名称" clearable />
          <el-button size="small" type="primary" :icon="Plus" :disabled="!canSaveGroup" @click="saveCurrentGroup">
            保存当前选择为组合
          </el-button>
        </div>

        <div class="element-picker__footer">
          <el-button size="small" @click="clearSelection">清空</el-button>
          <el-button size="small" type="primary" @click="panelVisible = false">完成</el-button>
        </div>
      </div>
    </el-popover>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { LabReportElementKey } from '@/types/labReport'
import { getSmsElementLabel, labReportElements, parseLabElementKeys } from '@/utils/labReport'

interface ElementGroup {
  id: string
  name: string
  elementKeys: LabReportElementKey[]
}

const props = defineProps<{
  modelValue?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const STORAGE_KEY = 'ys_lab_element_groups'
const panelVisible = ref(false)
const selectedKeys = ref<LabReportElementKey[]>([])
const groups = ref<ElementGroup[]>([])
const groupName = ref('')

const knownKeys = new Set(labReportElements.map((element) => element.key))

const displayText = computed(() => {
  const text = formatElementKeys(selectedKeys.value)
  return text || props.modelValue?.trim() || ''
})

const canSaveGroup = computed(() => Boolean(groupName.value.trim() && selectedKeys.value.length))

watch(
  () => props.modelValue,
  (value) => {
    selectedKeys.value = parseElementKeys(value || '')
  },
  { immediate: true }
)

onMounted(() => {
  groups.value = loadGroups()
})

function handleSelectionChange(value: string[]) {
  selectedKeys.value = sortKeys(value.filter((item): item is LabReportElementKey => knownKeys.has(item as LabReportElementKey)))
  commitSelection()
}

function applyGroup(group: ElementGroup) {
  selectedKeys.value = sortKeys(group.elementKeys)
  commitSelection()
}

function clearSelection() {
  selectedKeys.value = []
  emit('update:modelValue', '')
}

function saveCurrentGroup() {
  if (!canSaveGroup.value) return
  const name = groupName.value.trim()
  const elementKeys = sortKeys(selectedKeys.value)
  const existingIndex = groups.value.findIndex((group) => group.name === name)
  const group: ElementGroup = {
    id: existingIndex >= 0 ? groups.value[existingIndex].id : `group-${Date.now()}`,
    name,
    elementKeys
  }
  if (existingIndex >= 0) {
    groups.value.splice(existingIndex, 1, group)
  } else {
    groups.value.push(group)
  }
  saveGroups(groups.value)
  groupName.value = ''
  ElMessage.success('常用组合已保存')
}

function deleteGroup(groupId: string) {
  groups.value = groups.value.filter((group) => group.id !== groupId)
  saveGroups(groups.value)
}

function commitSelection() {
  emit('update:modelValue', formatElementKeys(selectedKeys.value))
}

function formatElementKeys(keys: LabReportElementKey[]) {
  return sortKeys(keys)
    .map((key) => getSmsElementLabel(key))
    .filter(Boolean)
    .join('、')
}

function sortKeys(keys: LabReportElementKey[]) {
  const unique = new Set(keys)
  return labReportElements.map((element) => element.key).filter((key) => unique.has(key))
}

function parseElementKeys(value: string) {
  return parseLabElementKeys(value)
}

function loadGroups(): ElementGroup[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<ElementGroup>[]
    return parsed
      .filter((group): group is ElementGroup => Boolean(group.id && group.name && Array.isArray(group.elementKeys)))
      .map((group) => ({ ...group, elementKeys: sortKeys(group.elementKeys.filter((key) => knownKeys.has(key))) }))
      .filter((group) => group.elementKeys.length)
  } catch {
    return []
  }
}

function saveGroups(nextGroups: ElementGroup[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextGroups))
}
</script>

<style scoped lang="scss">
.lab-element-selector {
  width: 100%;
  min-width: 0;
}

.lab-element-selector__trigger {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  width: 100%;
  min-width: 0;
  min-height: 26px;
  padding: 0 6px;
  color: #1f2937;
  background: #ffffff;
  border: 0;
  cursor: pointer;
  font-size: 15px;
  text-align: left;

  &:disabled {
    cursor: not-allowed;
  }
}

.lab-element-selector__text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lab-element-selector__text--empty {
  color: rgba(31, 41, 55, 0.42);
}

.lab-element-selector__action {
  flex: 0 0 auto;
  color: #2563eb;
  font-size: 12px;
}

.element-picker {
  display: grid;
  gap: 12px;
}

.element-picker__header,
.element-picker__section-title,
.element-picker__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.element-picker__header strong {
  font-size: 15px;
}

.element-picker__header span,
.element-picker__section-title small,
.element-picker__empty {
  color: #64748b;
  font-size: 12px;
}

.element-picker__section {
  display: grid;
  gap: 8px;
  padding: 10px;
  background: #f8fbff;
  border: 1px solid #dce5ef;
  border-radius: 8px;
}

.element-groups {
  display: grid;
  gap: 6px;
}

.element-group {
  display: grid;
  align-items: center;
  gap: 8px;
  grid-template-columns: auto minmax(0, 1fr) auto;

  > span {
    min-width: 0;
    overflow: hidden;
    color: #475569;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.element-picker__checkboxes {
  display: grid;
  align-items: start;
  justify-items: start;
  gap: 8px 16px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.element-picker__checkboxes :deep(.el-checkbox) {
  justify-content: flex-start;
  width: 100%;
  height: auto;
  margin-right: 0;
}

.element-picker__checkboxes :deep(.el-checkbox__label) {
  color: #1f2937;
  font-size: 15px;
  line-height: 1.45;
  text-align: left;
  white-space: normal;
}

.element-picker__checkboxes small {
  color: #64748b;
  font-size: 13px;
}

.element-picker__create {
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr) auto;
}

@media (max-width: 900px) {
  .element-picker__checkboxes {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
