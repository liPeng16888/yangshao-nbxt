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
              <el-button link type="danger" :icon="Delete" :disabled="catalogueSaving" @click="deleteGroup(group.id)">删除</el-button>
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
          <el-button
            size="small"
            type="primary"
            :icon="Plus"
            :loading="catalogueSaving"
            :disabled="!canSaveGroup || catalogueSaving"
            @click="saveCurrentGroup"
          >
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
import { computed, ref, watch } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useFrontendPreferencesStore } from '@/stores/frontendPreferences'
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

const preferences = useFrontendPreferencesStore()
const panelVisible = ref(false)
const selectedKeys = ref<LabReportElementKey[]>([])
const groupName = ref('')
const catalogueSaving = ref(false)
let fallbackGroupIdSequence = 0

const knownKeys = new Set(labReportElements.map((element) => element.key))
const groups = computed(() => {
  void preferences.statuses.LAB_ELEMENT_GROUPS
  return normalizeElementGroups(preferences.value<unknown>('LAB_ELEMENT_GROUPS', []))
})

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

async function saveCurrentGroup() {
  if (!canSaveGroup.value || catalogueSaving.value) return
  const name = groupName.value.trim()
  const elementKeys = sortKeys(selectedKeys.value)
  const existingIndex = groups.value.findIndex((group) => group.name === name)
  const group: ElementGroup = {
    id: existingIndex >= 0 ? groups.value[existingIndex].id : createGroupId(),
    name,
    elementKeys
  }
  const next = existingIndex >= 0
    ? groups.value.map((item, index) => index === existingIndex ? group : item)
    : [...groups.value, group]
  catalogueSaving.value = true
  try {
    const result = await preferences.save('LAB_ELEMENT_GROUPS', normalizeElementGroups(next))
    handleCatalogueSaveResult(result, '常用组合已保存')
    if (result === 'saved' || result === 'queued') groupName.value = ''
  } finally {
    catalogueSaving.value = false
  }
}

async function deleteGroup(groupId: string) {
  if (catalogueSaving.value) return
  const next = normalizeElementGroups(groups.value.filter((group) => group.id !== groupId))
  catalogueSaving.value = true
  try {
    const result = await preferences.save('LAB_ELEMENT_GROUPS', next)
    handleCatalogueSaveResult(result, '常用组合已删除')
  } finally {
    catalogueSaving.value = false
  }
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

function normalizeElementGroups(value: unknown): ElementGroup[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  const names = new Set<string>()
  const normalized: ElementGroup[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const candidate = item as Partial<ElementGroup>
    const id = typeof candidate.id === 'string' ? candidate.id.trim() : ''
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''
    const elementKeys = Array.isArray(candidate.elementKeys)
      ? sortKeys(candidate.elementKeys.filter((key): key is LabReportElementKey => knownKeys.has(key as LabReportElementKey)))
      : []
    if (!id || !name || !elementKeys.length || ids.has(id) || names.has(name)) continue
    ids.add(id)
    names.add(name)
    normalized.push({ id, name, elementKeys })
    if (normalized.length === 100) break
  }
  return normalized
}

function createGroupId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  fallbackGroupIdSequence += 1
  const random = `${Math.random().toString(36).slice(2, 10)}-${fallbackGroupIdSequence.toString(36)}`
  return `group-${Date.now()}-${random}`
}

function handleCatalogueSaveResult(
  result: 'saved' | 'queued' | 'conflict' | 'error',
  successMessage: string
) {
  if (result === 'saved') {
    ElMessage.success(successMessage)
    return
  }
  if (result === 'queued') {
    ElMessage.warning('已保存到本机，联网后请确认同步')
    return
  }
  if (result === 'conflict') {
    ElMessage.warning('常用组合发生同步冲突，请使用页面同步提示处理')
    return
  }
  ElMessage.error('常用组合保存失败，请稍后重试')
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
  color: rgba(31, 41, 55, 0.3);
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
