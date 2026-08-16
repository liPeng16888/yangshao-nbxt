<template>
  <el-dialog
    :model-value="visible"
    width="1120px"
    class="lab-report-dialog"
    :fullscreen="mobile"
    :style="mobile ? mobileLabDialogFrameStyle : undefined"
    :body-class="mobile ? mobileLabDialogBodyClass : undefined"
    :footer-class="mobile ? mobileLabDialogFooterClass : undefined"
    :title="dialogTitle"
    @close="handleDialogClose"
  >
    <div v-if="step === 'elements'" class="element-step" :class="{ 'element-step--mobile': mobile }">
      <el-alert
        title="优先使用数据计算中已选择的化验元素；未填写的样品保持空白，可在这里手动选择。"
        type="info"
        show-icon
        :closable="false"
      />

      <section class="bulk-element-card">
        <div class="bulk-element-card__header">
          <div>
            <strong>批量选择检测元素</strong>
            <span>勾选后可一次应用到下方所有样品。</span>
          </div>
          <div class="bulk-element-card__actions">
            <el-button size="small" @click="clearBulkElements">清空批量</el-button>
            <el-button size="small" type="primary" @click="applyBulkElements">应用到下方样品</el-button>
            <el-button size="small" @click="clearAllSelections">清空下方选择</el-button>
          </div>
        </div>
        <el-checkbox-group v-model="bulkElementKeys" class="element-checkboxes bulk-element-card__checkboxes">
          <el-checkbox v-for="element in labReportElements" :key="element.key" :label="element.key">
            {{ element.label }} <small v-if="element.symbol">{{ element.symbol }}</small>
          </el-checkbox>
        </el-checkbox-group>
      </section>

      <div class="sample-element-list">
        <section v-for="block in selectedBlocks" :key="block.id" class="sample-element-card">
          <div class="sample-element-card__header">
            <strong>{{ getBlockDisplayName(block) }}</strong>
            <span>{{ getBlockCustomerName(block) || '无客户信息' }}</span>
          </div>
          <el-checkbox-group v-model="selectionMap[block.id]" class="element-checkboxes">
            <el-checkbox v-for="element in labReportElements" :key="element.key" :label="element.key">
              {{ element.label }} <small v-if="element.symbol">{{ element.symbol }}</small>
            </el-checkbox>
          </el-checkbox-group>
        </section>
      </div>
    </div>

    <div v-else-if="draft" class="preview-step" :class="{ 'preview-step--mobile': mobile }">
      <div v-if="sampleUnitConflict" class="sample-unit-conflict">
        <strong>来样单位快捷名称存在同步冲突</strong>
        <span>请选择服务器内容，或确认后用本机内容覆盖。</span>
        <div>
          <el-button size="small" :disabled="sampleUnitsResolving" @click="resolveSampleUnitConflict('server')">加载服务器内容</el-button>
          <el-button size="small" type="warning" :disabled="sampleUnitsResolving" @click="resolveSampleUnitConflict('overwrite')">用本机内容覆盖</el-button>
        </div>
      </div>
      <div class="preview-actions">
        <div class="sample-unit-shortcuts">
          <span class="sample-unit-shortcuts__label">来样单位快捷名称</span>
          <el-select
            v-model="draft.sampleUnit"
            class="sample-unit-shortcuts__select"
            filterable
            allow-create
            default-first-option
            clearable
            placeholder="选择或输入名称"
          >
            <el-option v-for="unit in savedSampleUnits" :key="unit" :label="unit" :value="unit">
              <div class="sample-unit-option">
                <span>{{ unit }}</span>
                <el-button
                  link
                  type="danger"
                  :icon="Delete"
                  :disabled="sampleUnitMutationLocked"
                  title="删除快捷名称"
                  @mousedown.prevent
                  @click.stop="removeSavedSampleUnit(unit)"
                />
              </div>
            </el-option>
          </el-select>
          <el-button
            :icon="Plus"
            :loading="sampleUnitsSaving || sharedSampleUnitsSaving"
            :disabled="sampleUnitMutationLocked"
            @click="saveCurrentSampleUnit"
          >保存名称</el-button>
        </div>
        <div class="preview-actions__commands">
          <el-button @click="step = 'elements'">返回选择元素</el-button>
          <el-button type="primary" :loading="exportingReport" @click="downloadCurrentReport">{{ reportExportButtonText }}</el-button>
        </div>
      </div>

      <section v-if="mobileReportPreviewUrl" class="mobile-report-share-preview">
        <img :src="mobileReportPreviewUrl" alt="化验报告保存预览" />
        <div>
          <strong>长按保存图片</strong>
          <p>当前浏览器不支持直接分享文件，请长按上方图片并选择“存储到照片”。</p>
        </div>
      </section>

      <div class="report-preview-viewport" aria-label="化验报告可滚动预览">
        <div class="report-preview">
        <input v-model="draft.title" class="report-title-input" />
        <div class="meta-grid">
          <div class="report-cell report-cell--label">来样日期</div>
          <div class="report-cell"><input v-model="draft.sampleDate" /></div>
          <div class="report-cell report-cell--label">报告日期</div>
          <div class="report-cell"><input v-model="draft.reportDate" /></div>
          <div class="report-cell report-cell--label">来样单位</div>
          <div class="report-cell"><input v-model="draft.sampleUnit" /></div>
          <div class="report-cell report-cell--label">来样数量</div>
          <div class="report-cell"><input v-model="draft.sampleCount" /></div>
        </div>

        <div class="result-grid" :style="{ gridTemplateColumns: resultGridColumns }">
          <div class="report-cell report-cell--sample-header">检验项目/样品编号</div>
          <div v-for="element in displayElements" :key="`${element.id}-label`" class="report-cell">
            <input :value="element.label" :disabled="element.blank" @input="updateDisplayElement(element, 'label', $event)" />
          </div>
          <div v-for="element in displayElements" :key="`${element.id}-symbol`" class="report-cell">
            <input :value="element.symbol" :disabled="element.blank" @input="updateDisplayElement(element, 'symbol', $event)" />
          </div>
          <template v-for="row in paddedRows" :key="row.blockId">
            <div class="report-cell"><input v-model="row.sampleName" /></div>
            <div v-for="element in displayElements" :key="`${row.blockId}-${element.id}`" class="report-cell">
              <input :value="getRowDisplayValue(row, element)" :disabled="element.blank" @input="updateRowDisplayValue(row, element, $event)" />
            </div>
          </template>
        </div>

        <div class="inspector-row">
          <div class="report-cell report-cell--label">检验员</div>
          <div class="report-cell"><input v-model="draft.reviewer" /></div>
        </div>

        <div class="report-bottom">
          <div class="report-bottom__left">
            <div class="statement-title">声明事项</div>
            <textarea
              v-for="(_, index) in draft.statements"
              :key="index"
              v-model="draft.statements[index]"
              class="statement-input"
              :style="{ minHeight: statementInputHeight(draft.statements[index]) }"
            />
            <div class="address-line">
              <div class="contact-line__content">
                <span>地址：</span>
                <input v-model="draft.address" :style="{ width: contactInputWidth(draft.address, 12) }" />
              </div>
            </div>
            <div class="phone-line">
              <div class="contact-line__content">
                <span>联系电话：</span>
                <input v-model="draft.phone" :style="{ width: contactInputWidth(draft.phone, 14) }" />
              </div>
            </div>
          </div>
          <div class="report-bottom__seal">
            <img v-if="draft.sealImage" :src="draft.sealImage" alt="电子公章" />
            <span v-else>电子公章</span>
          </div>
        </div>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="handleDialogClose">关闭</el-button>
      <el-button v-if="step === 'elements'" type="primary" @click="createPreview">生成预览</el-button>
      <el-button v-else type="primary" :loading="exportingReport" @click="downloadCurrentReport">{{ reportExportButtonText }}</el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts">
let mobileLabReportShareInFlight = false
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import {
  canAccessFrontendPreference,
  frontendPreferenceActorKey,
  frontendPreferenceOwnerId,
  useFrontendPreferencesStore
} from '@/stores/frontendPreferences'
import type { LabReportDraft, LabReportDraftRow, LabReportElementKey, LabReportTemplate } from '@/types/labReport'
import type { SampleBlock } from '@/types/labSheet'
import {
  mobileLabDialogBodyClass,
  mobileLabDialogFooterClass,
  mobileLabDialogFrameStyle
} from './mobileLabDialogLayout'
import {
  createLabReportFilename,
  createLabReportPngBlob,
  createReportDraft,
  downloadLabReportAsPng,
  getBlockCustomerName,
  getBlockDisplayName,
  labReportElements,
  parseLabElementKeys
} from '@/utils/labReport'

const MIN_REPORT_ELEMENT_COLUMNS = 5

type DisplayElement = {
  id: string
  key?: LabReportElementKey
  label: string
  symbol: string
  draftIndex?: number
  blank: boolean
}

type SampleUnitOperationContext = {
  generation: number
  actorKey: string
  ownerId: string
  draft: LabReportDraft
  editSession: ReturnType<ReturnType<typeof useFrontendPreferencesStore>['registerEditSession']>
}

const props = defineProps<{
  visible: boolean
  blocks: SampleBlock[]
  selectedBlockIds: string[]
  template: LabReportTemplate
  date: string
  mobile?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const preferences = useFrontendPreferencesStore()
const authStore = useAuthStore()
const step = ref<'elements' | 'preview'>('elements')
const selectionMap = ref<Record<string, LabReportElementKey[]>>({})
const bulkElementKeys = ref<LabReportElementKey[]>([])
const draft = ref<LabReportDraft | null>(null)
const exportingReport = ref(false)
const sampleUnitsSaving = ref(false)
const sampleUnitsResolving = ref(false)
const savedSampleUnits = ref<string[]>([])
let sampleUnitOperationGeneration = 0
let sampleUnitEditSession = preferences.registerEditSession('LAB_REPORT_SAMPLE_UNITS')
let sampleUnitMutationsInFlight = 0
const mobileReportPreviewUrl = ref('')
let exportOperationId = 0
let componentMounted = true

const selectedBlocks = computed(() => props.blocks.filter((block) => props.selectedBlockIds.includes(block.id)))
const dialogTitle = computed(() => (step.value === 'elements' ? '选择化验报告检测元素' : '化验报告预览'))
const actorKey = computed(() => frontendPreferenceActorKey(authStore.user))
const canAccessSampleUnits = computed(() => canAccessFrontendPreference(
  authStore.user,
  'LAB_REPORT_SAMPLE_UNITS'
))
const sharedSampleUnitsSaving = computed(() => preferences.statuses.LAB_REPORT_SAMPLE_UNITS === 'saving')
const sampleUnitConflict = computed(() => canAccessSampleUnits.value &&
  preferences.statuses.LAB_REPORT_SAMPLE_UNITS === 'conflict' &&
  Boolean(preferences.conflicts.LAB_REPORT_SAMPLE_UNITS))
const sampleUnitMutationLocked = computed(() => !canAccessSampleUnits.value ||
  sampleUnitsSaving.value || sampleUnitsResolving.value || sharedSampleUnitsSaving.value || sampleUnitConflict.value)
const reportExportButtonText = computed(() => (props.mobile ? '分享或保存图片' : '保存为图片'))
const displayElements = computed<DisplayElement[]>(() => {
  if (!draft.value) return []
  const elements: DisplayElement[] = draft.value.elements.map((element, index) => ({
    id: element.key,
    key: element.key,
    label: element.label,
    symbol: element.symbol,
    draftIndex: index,
    blank: false
  }))
  while (elements.length < MIN_REPORT_ELEMENT_COLUMNS) {
    elements.push({ id: `blank-${elements.length}`, label: '', symbol: '', blank: true })
  }
  return elements
})
const resultGridColumns = computed(() => `142px repeat(${Math.max(MIN_REPORT_ELEMENT_COLUMNS, draft.value?.elements.length || 0)}, minmax(0, 1fr))`)
const paddedRows = computed(() => {
  if (!draft.value) return []
  const rows = draft.value.rows
  while (rows.length < 5) {
    rows.push({
      blockId: `empty-${rows.length}`,
      sampleName: '',
      values: Object.fromEntries(labReportElements.map((element) => [element.key, ''])) as Record<LabReportElementKey, string>
    })
  }
  return rows
})

watch(
  () => props.visible,
  (visible) => {
    invalidateSampleUnitOperations()
    invalidateExportOperation()
    clearMobileReportPreview()
    if (!visible) return
    step.value = 'elements'
    draft.value = null
    bulkElementKeys.value = []
    refreshSavedSampleUnits()
    const nextSelections: Record<string, LabReportElementKey[]> = {}
    selectedBlocks.value.forEach((block) => {
      nextSelections[block.id] = parseLabElementKeys(block.inputs.elementNote || '')
    })
    selectionMap.value = nextSelections
  },
  { immediate: true, flush: 'sync' }
)

watch(
  actorKey,
  () => {
    invalidateSampleUnitOperations()
    sampleUnitEditSession.unregister()
    sampleUnitEditSession = preferences.registerEditSession('LAB_REPORT_SAMPLE_UNITS')
    if (props.visible) refreshSavedSampleUnits()
  },
  { flush: 'sync' }
)

watch(
  () => ({
    status: preferences.statuses.LAB_REPORT_SAMPLE_UNITS,
    value: canAccessSampleUnits.value
      ? preferences.value<unknown>('LAB_REPORT_SAMPLE_UNITS', [])
      : []
  }),
  ({ status, value }) => {
    if (sampleUnitMutationsInFlight > 0 || sampleUnitsResolving.value || status === 'saving') return
    savedSampleUnits.value = normalizeSampleUnits(value)
  },
  { deep: true, immediate: true, flush: 'sync' }
)

watch(
  () => props.mobile,
  () => {
    invalidateExportOperation()
    clearMobileReportPreview()
  }
)
function applyBulkElements() {
  if (!selectedBlocks.value.length) {
    ElMessage.warning('请先选择需要生成报告的样品')
    return
  }
  if (!bulkElementKeys.value.length) {
    ElMessage.warning('请先选择需要批量应用的检测元素')
    return
  }
  const elementKeys = [...bulkElementKeys.value]
  const nextSelections = { ...selectionMap.value }
  selectedBlocks.value.forEach((block) => {
    nextSelections[block.id] = [...elementKeys]
  })
  selectionMap.value = nextSelections
  ElMessage.success('已应用到下方所有样品')
}

function clearBulkElements() {
  bulkElementKeys.value = []
}

function clearAllSelections() {
  const nextSelections = { ...selectionMap.value }
  selectedBlocks.value.forEach((block) => {
    nextSelections[block.id] = []
  })
  selectionMap.value = nextSelections
}

function createPreview() {
  const selections = selectedBlocks.value.map((block) => ({
    blockId: block.id,
    elementKeys: selectionMap.value[block.id] || []
  }))
  if (!selections.some((selection) => selection.elementKeys.length > 0)) {
    ElMessage.warning('请至少选择一个检测元素')
    return
  }
  draft.value = createReportDraft(selectedBlocks.value, selections, props.template, props.date)
  step.value = 'preview'
}

async function saveCurrentSampleUnit() {
  if (sampleUnitMutationLocked.value) return
  const unit = draft.value?.sampleUnit.trim() || ''
  if (!unit) {
    ElMessage.warning('请先填写来样单位名称')
    return
  }
  const currentUnits = currentSampleUnits()
  if (currentUnits.includes(unit)) {
    ElMessage.info('该名称已经保存')
    return
  }
  const next = normalizeSampleUnits([unit, ...currentUnits])
  const operation = captureSampleUnitOperation()
  if (!operation) return
  sampleUnitsSaving.value = true
  operation.editSession.update({ dirty: true, value: next })
  sampleUnitMutationsInFlight += 1
  try {
    const result = await preferences.save('LAB_REPORT_SAMPLE_UNITS', next)
    if (!isCurrentSampleUnitOperation(operation)) return
    const effectiveResult = currentSampleUnitResult(result)
    if (effectiveResult === 'saved' || effectiveResult === 'queued') refreshSavedSampleUnits()
    handleSampleUnitSaveResult(effectiveResult, '来样单位名称已保存')
    if (effectiveResult === 'saved' || effectiveResult === 'queued') {
      operation.draft.sampleUnit = unit
    }
  } finally {
    sampleUnitMutationsInFlight -= 1
    operation.editSession.update({ dirty: false })
    if (isCurrentSampleUnitOperation(operation)) sampleUnitsSaving.value = false
  }
}

async function removeSavedSampleUnit(unit: string) {
  if (sampleUnitMutationLocked.value) return
  const operation = captureSampleUnitOperation()
  if (!operation) return
  sampleUnitsSaving.value = true
  let mutationStarted = false
  try {
    await ElMessageBox.confirm(
      `确认删除快捷名称“${unit}”吗？此操作不会删除数据计算中的客户资料。`,
      '删除快捷名称',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消'
      }
    )
    if (!isCurrentSampleUnitOperation(operation) ||
      preferences.statuses.LAB_REPORT_SAMPLE_UNITS === 'saving' ||
      preferences.statuses.LAB_REPORT_SAMPLE_UNITS === 'conflict') return
    const next = normalizeSampleUnits(currentSampleUnits().filter((item) => item !== unit))
    operation.editSession.update({ dirty: true, value: next })
    sampleUnitMutationsInFlight += 1
    mutationStarted = true
    const result = await preferences.save('LAB_REPORT_SAMPLE_UNITS', next)
    if (!isCurrentSampleUnitOperation(operation)) return
    const effectiveResult = currentSampleUnitResult(result)
    if (effectiveResult === 'saved' || effectiveResult === 'queued') refreshSavedSampleUnits()
    handleSampleUnitSaveResult(effectiveResult, '快捷名称已删除')
  } catch (error) {
    if (isCurrentSampleUnitOperation(operation) && error !== 'cancel' && error !== 'close') {
      ElMessage.error('快捷名称删除失败，请重试')
    }
  } finally {
    if (mutationStarted) sampleUnitMutationsInFlight -= 1
    operation.editSession.update({ dirty: false })
    if (isCurrentSampleUnitOperation(operation)) sampleUnitsSaving.value = false
  }
}

async function resolveSampleUnitConflict(strategy: 'server' | 'overwrite') {
  if (!canAccessSampleUnits.value || sampleUnitsResolving.value ||
    preferences.statuses.LAB_REPORT_SAMPLE_UNITS !== 'conflict') return
  const operation = captureSampleUnitOperation()
  if (!operation) return
  sampleUnitsResolving.value = true
  let mutationStarted = false
  try {
    if (strategy === 'overwrite') {
      try {
        await ElMessageBox.confirm(
          '覆盖会用本机来样单位快捷名称替换服务器上的最新内容，确认继续吗？',
          '确认覆盖来样单位快捷名称',
          {
            type: 'warning',
            confirmButtonText: '确认覆盖',
            cancelButtonText: '取消'
          }
        )
      } catch (error) {
        if (!isCurrentSampleUnitOperation(operation)) return
        if (error !== 'cancel' && error !== 'close') {
          ElMessage.error('来样单位快捷名称冲突处理失败，请稍后重试')
        }
        return
      }
    }
    if (!isCurrentSampleUnitOperation(operation) ||
      preferences.statuses.LAB_REPORT_SAMPLE_UNITS !== 'conflict') return
    sampleUnitMutationsInFlight += 1
    mutationStarted = true
    const result = await preferences.resolveConflict('LAB_REPORT_SAMPLE_UNITS', strategy)
    if (!isCurrentSampleUnitOperation(operation)) return
    if (result === 'saved' || result === 'queued') refreshSavedSampleUnits()
    handleSampleUnitConflictResult(result, strategy)
  } finally {
    if (mutationStarted) sampleUnitMutationsInFlight -= 1
    if (isCurrentSampleUnitOperation(operation)) sampleUnitsResolving.value = false
  }
}

function refreshSavedSampleUnits() {
  savedSampleUnits.value = currentSampleUnits()
}

function invalidateSampleUnitOperations() {
  sampleUnitOperationGeneration += 1
  sampleUnitEditSession.update({ dirty: false })
  sampleUnitsSaving.value = false
  sampleUnitsResolving.value = false
}

function captureSampleUnitOperation(): SampleUnitOperationContext | null {
  if (!props.visible || !draft.value || !canAccessSampleUnits.value) return null
  return {
    generation: sampleUnitOperationGeneration,
    actorKey: actorKey.value,
    ownerId: frontendPreferenceOwnerId(authStore.user),
    draft: draft.value,
    editSession: sampleUnitEditSession
  }
}

function isCurrentSampleUnitOperation(operation: SampleUnitOperationContext) {
  return props.visible &&
    operation.generation === sampleUnitOperationGeneration &&
    operation.actorKey === actorKey.value &&
    operation.ownerId === frontendPreferenceOwnerId(authStore.user) &&
    operation.draft === draft.value
}

function currentSampleUnits() {
  return canAccessSampleUnits.value
    ? normalizeSampleUnits(preferences.value<unknown>('LAB_REPORT_SAMPLE_UNITS', []))
    : []
}

function currentSampleUnitResult(result: 'saved' | 'queued' | 'conflict' | 'error') {
  return preferences.statuses.LAB_REPORT_SAMPLE_UNITS === 'conflict' ? 'conflict' : result
}

function normalizeSampleUnits(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const normalized = value
    .filter((unit): unit is string => typeof unit === 'string')
    .map((unit) => unit.trim())
    .filter(Boolean)
  return [...new Set(normalized)].slice(0, 100)
}

function handleSampleUnitSaveResult(
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
    ElMessage.warning('来样单位快捷名称发生同步冲突，请使用页面同步提示处理')
    return
  }
  ElMessage.error('来样单位快捷名称保存失败，请稍后重试')
}

function handleSampleUnitConflictResult(
  result: 'saved' | 'queued' | 'conflict' | 'error',
  strategy: 'server' | 'overwrite'
) {
  if (result === 'saved') {
    ElMessage.success(strategy === 'server' ? '已加载服务器来样单位快捷名称' : '已用本机来样单位快捷名称覆盖')
    return
  }
  if (result === 'queued') {
    ElMessage.warning('已保存到本机，联网后请确认同步')
    return
  }
  if (result === 'conflict') {
    ElMessage.warning('服务器内容已再次更新，请重新确认冲突内容')
    return
  }
  ElMessage.error('来样单位快捷名称冲突处理失败，请稍后重试')
}

async function downloadCurrentReport() {
  if (!draft.value || exportingReport.value || mobileLabReportShareInFlight) return
  const operationId = ++exportOperationId
  const mobileAtStart = Boolean(props.mobile)
  exportingReport.value = true
  clearMobileReportPreview()
  ElMessage.info('正在生成化验报告图片')
  try {
    const filename = createLabReportFilename(selectedBlocks.value, draft.value.reportDate || props.date)
    if (mobileAtStart) {
      const blob = await createLabReportPngBlob(draft.value)
      if (!isExportOperationCurrent(operationId, mobileAtStart)) return
      if (!blob) {
        ElMessage.error('图片生成失败，请刷新页面后重试')
        return
      }
      await shareOrPreviewMobileReport(blob, filename, operationId)
      return
    }
    const downloaded = await downloadLabReportAsPng(draft.value, filename)
    if (!isExportOperationCurrent(operationId, mobileAtStart)) return
    if (downloaded) {
      ElMessage.success('化验报告图片已开始下载')
      return
    }
    ElMessage.error('图片生成失败，请刷新页面后重试')
  } catch {
    if (!isExportOperationCurrent(operationId, mobileAtStart)) return
    ElMessage.error('图片生成失败，请刷新页面后重试')
  } finally {
    if (operationId === exportOperationId) exportingReport.value = false
  }
}

async function shareOrPreviewMobileReport(blob: Blob, filename: string, operationId: number) {
  if (!isExportOperationCurrent(operationId, true)) return
  if (typeof File !== 'function') {
    showMobileReportPreview(blob, operationId)
    return
  }
  const file = new File([blob], filename, { type: 'image/png' })
  const shareData: ShareData = { files: [file], title: '化验报告' }
  let supportsFileShare = false
  try {
    supportsFileShare = typeof navigator.share === 'function'
      && typeof navigator.canShare === 'function'
      && navigator.canShare(shareData)
  } catch {
    supportsFileShare = false
  }

  if (supportsFileShare) {
    if (mobileLabReportShareInFlight) return
    mobileLabReportShareInFlight = true
    try {
      await navigator.share(shareData)
      if (!isExportOperationCurrent(operationId, true)) return
      clearMobileReportPreview()
      ElMessage.success('已打开系统分享')
      return
    } catch (error) {
      if (!isExportOperationCurrent(operationId, true)) return
      if (error instanceof DOMException && error.name === 'AbortError') {
        ElMessage.info('已取消分享')
        return
      }
      ElMessage.error('系统分享失败，已切换为长按保存图片')
    } finally {
      mobileLabReportShareInFlight = false
    }
  }

  if (!isExportOperationCurrent(operationId, true)) return
  showMobileReportPreview(blob, operationId)
}

function showMobileReportPreview(blob: Blob, operationId: number) {
  if (!isExportOperationCurrent(operationId, true)) return
  clearMobileReportPreview()
  const previewUrl = URL.createObjectURL(blob)
  if (!isExportOperationCurrent(operationId, true)) {
    URL.revokeObjectURL(previewUrl)
    return
  }
  mobileReportPreviewUrl.value = previewUrl
  ElMessage.info('请长按图片保存到手机')
}

function isExportOperationCurrent(operationId: number, mobileAtStart: boolean) {
  return componentMounted
    && operationId === exportOperationId
    && props.visible
    && Boolean(props.mobile) === mobileAtStart
}

function invalidateExportOperation() {
  exportOperationId += 1
  exportingReport.value = false
}

function handleDialogClose() {
  invalidateExportOperation()
  clearMobileReportPreview()
  emit('close')
}

function clearMobileReportPreview() {
  if (!mobileReportPreviewUrl.value) return
  URL.revokeObjectURL(mobileReportPreviewUrl.value)
  mobileReportPreviewUrl.value = ''
}

function updateDisplayElement(element: DisplayElement, field: 'label' | 'symbol', event: Event) {
  if (element.blank || element.draftIndex === undefined || !draft.value) return
  draft.value.elements[element.draftIndex][field] = (event.target as HTMLInputElement).value
}

function getRowDisplayValue(row: LabReportDraftRow, element: DisplayElement) {
  if (element.blank || !element.key) return ''
  return row.values[element.key] || ''
}

function updateRowDisplayValue(row: LabReportDraftRow, element: DisplayElement, event: Event) {
  if (element.blank || !element.key) return
  row.values[element.key] = (event.target as HTMLInputElement).value
}

function statementInputHeight(statement: string) {
  const lineCount = Math.max(1, Math.ceil(statement.length / 64))
  return `${Math.max(28, 10 + lineCount * 18)}px`
}

function contactInputWidth(value: string, minChars: number) {
  const length = Math.max(minChars, Array.from(value || '').length)
  return `${length + 1}em`
}

onBeforeUnmount(() => {
  componentMounted = false
  invalidateSampleUnitOperations()
  sampleUnitEditSession.unregister()
  invalidateExportOperation()
  clearMobileReportPreview()
})

</script>

<style scoped lang="scss">
.element-step,
.preview-step {
  display: grid;
  gap: 14px;
}

.sample-element-list {
  display: grid;
  gap: 12px;
  max-height: 520px;
  overflow: auto;
}

.bulk-element-card {
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px solid #b6d4fe;
  border-radius: 8px;
  background: #eff6ff;
}

.bulk-element-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  strong {
    display: block;
    color: #10233f;
    font-size: 17px;
  }

  span {
    display: block;
    margin-top: 4px;
    color: #64748b;
    font-size: 14px;
  }
}

.bulk-element-card__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.bulk-element-card__checkboxes {
  padding-top: 2px;
}

.sample-element-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid #dce5ef;
  border-radius: 8px;
}

.sample-element-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  strong {
    font-size: 17px;
  }

  span {
    color: #64748b;
    font-size: 16px;
  }
}

.element-checkboxes {
  display: grid;
  gap: 8px 16px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.element-checkboxes small {
  color: #64748b;
  font-size: 15px;
}

.element-checkboxes :deep(.el-checkbox__label) {
  font-size: 17px;
  line-height: 1.5;
}

@media (max-width: 960px) {
  .element-checkboxes {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .bulk-element-card__header {
    align-items: stretch;
    flex-direction: column;
  }

  .bulk-element-card__actions {
    justify-content: flex-start;
  }
}

.preview-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.sample-unit-conflict {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 12px;
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #f59e0b;
  border-radius: 8px;

  > div {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }
}

.sample-unit-shortcuts,
.preview-actions__commands {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sample-unit-shortcuts__label {
  color: #475569;
  white-space: nowrap;
}

.sample-unit-shortcuts__select {
  width: 270px;
}

.sample-unit-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

@media (max-width: 960px) {
  .preview-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .sample-unit-shortcuts {
    flex-wrap: wrap;
  }

  .preview-actions__commands {
    justify-content: flex-end;
  }
}

.report-preview {
  width: 1008px;
  margin: 0 auto;
  color: #111827;
  background: #ffffff;
  border: 1px solid #111827;
  font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
}

.report-preview-viewport {
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
}

.element-step--mobile,
.preview-step--mobile {
  min-width: 0;
  max-width: 100%;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
  overflow-x: clip;
}

.element-step--mobile .element-checkboxes {
  grid-template-columns: 1fr;
}

.element-step--mobile .bulk-element-card__header,
.element-step--mobile .sample-element-card__header,
.preview-step--mobile .preview-actions {
  align-items: stretch;
  flex-direction: column;
}

.element-step--mobile .bulk-element-card__actions {
  display: grid;
  justify-content: stretch;
  width: 100%;
  grid-template-columns: 1fr;
}

.preview-step--mobile .sample-unit-shortcuts,
.preview-step--mobile .preview-actions__commands {
  display: grid;
  width: 100%;
  grid-template-columns: 1fr;
}

.preview-step--mobile .sample-unit-shortcuts__select {
  width: 100%;
}

.preview-step--mobile .preview-actions :deep(.el-button),
.element-step--mobile .bulk-element-card__actions :deep(.el-button) {
  min-height: 44px;
  margin: 0;
}

.preview-step--mobile .report-preview-viewport {
  width: 100%;
  border-radius: 8px;
}

:global(.lab-report-dialog.is-fullscreen) {
  display: flex;
  flex-direction: column;
  width: 100% !important;
  max-width: none !important;
  height: 100dvh !important;
  max-height: 100dvh !important;
  margin: 0 !important;
  border-radius: 0 !important;
  overflow: hidden;
}

:global(.lab-report-dialog.is-fullscreen .el-dialog__header) {
  padding-top: calc(12px + env(safe-area-inset-top));
}

:global(.lab-report-dialog.is-fullscreen .lab-mobile-action-dialog__body) {
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
  overflow: auto;
  overscroll-behavior: contain;
}

:global(.lab-report-dialog.is-fullscreen .lab-mobile-action-dialog__footer) {
  flex: 0 0 auto;
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
}

:global(.lab-report-dialog.is-fullscreen .el-dialog__footer .el-button),
:global(.lab-report-dialog.is-fullscreen .el-dialog__headerbtn) {
  min-width: 44px;
  min-height: 44px;
}

.mobile-report-share-preview {
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px solid #86b7fe;
  border-radius: 10px;
  background: #eff6ff;

  img {
    display: block;
    width: min(100%, 430px);
    max-height: 60dvh;
    margin: 0 auto;
    object-fit: contain;
    background: #ffffff;
  }

  strong {
    color: #10233f;
  }

  p {
    margin: 4px 0 0;
    color: #475569;
    line-height: 1.6;
  }
}

.report-title-input {
  width: 100%;
  height: 68px;
  font-size: 28px;
  text-align: center;
  border: 0;
  border-bottom: 1px solid #111827;
}

.meta-grid {
  display: grid;
  grid-template-columns: 170px 1fr 170px 1fr;
}

.result-grid {
  display: grid;
  align-items: stretch;
}

.inspector-row {
  display: grid;
  grid-template-columns: 222px 1fr;
}

.report-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 35px;
  border-right: 1px solid #111827;
  border-bottom: 1px solid #111827;
  text-align: center;

  input {
    width: 100%;
    height: 100%;
    min-width: 0;
    padding: 0 4px;
    background: transparent;
    border: 0;
    outline: none;
    text-align: center;
  }

  input:disabled {
    color: transparent;
    cursor: default;
  }
}

.meta-grid .report-cell:nth-child(4n),
.inspector-row .report-cell:last-child {
  border-right: 0;
}

.result-grid .report-cell {
  min-height: 35px;
}

.report-cell--sample-header {
  grid-row: span 2;
  padding: 0 6px;
}

.report-cell--label {
  font-weight: 400;
}

.report-bottom {
  display: grid;
  grid-template-columns: 1fr 230px;
  min-height: 256px;
}

.report-bottom__left {
  border-right: 1px solid #111827;
}

.statement-title {
  height: 34px;
  text-align: center;
  line-height: 34px;
  border-bottom: 1px solid #111827;
}

.statement-input {
  display: block;
  width: 100%;
  padding: 5px 4px;
  resize: none;
  border: 0;
  border-bottom: 1px solid #111827;
  outline: none;
  font-size: 12px;
  line-height: 17px;
  overflow: hidden;
}

.address-line,
.phone-line {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 51px;
  font-size: 24px;
  text-align: center;
  border-bottom: 1px solid #111827;

  input {
    flex: 0 0 auto;
    max-width: 520px;
    border: 0;
    outline: none;
    font-size: inherit;
    text-align: left;
  }
}

.contact-line__content {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: calc(100% - 24px);
}

.phone-line {
  border-bottom: 0;
}

.report-bottom__seal {
  display: grid;
  place-items: center;
  color: #dc2626;

  img {
    max-width: 190px;
    max-height: 160px;
  }
}
</style>
