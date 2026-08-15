<template>
  <div
    class="page-stack"
    :class="{ 'page-stack--mobile': isMobileLayout, 'page-stack--mobile-selection': isMobileLayout && selectionMode }"
    v-loading="labStore.loading"
  >
    <div class="toolbar">
      <div class="toolbar-left">
        <el-date-picker v-model="selectedDate" type="date" value-format="YYYY-MM-DD" @change="handleDateChange" />
        <el-tag v-if="switchingBusinessDay" type="info" effect="plain">正在切换业务日</el-tag>
        <el-tag v-else-if="labStore.sheet?.readonly" type="warning" effect="plain">历史副表只读</el-tag>
        <el-tag v-else type="success" effect="plain">当前表可编辑</el-tag>
        <el-tag v-if="!isPageReadonly" :type="autoSaveTagType" effect="plain">{{ autoSaveText }}</el-tag>
        <el-button
          v-if="!isPageReadonly && (labStore.autoSaveStatus === 'error' || labStore.autoSaveStatus === 'conflict')"
          size="small"
          :type="labStore.autoSaveStatus === 'conflict' ? 'danger' : 'primary'"
          :loading="labStore.saving || labStore.autoSaving"
          @click="handleSaveRecovery"
        >
          {{ labStore.autoSaveStatus === 'conflict' ? '确认保存本机内容' : '重试保存' }}
        </el-button>
      </div>
      <div v-if="!isMobileLayout || !selectionMode" class="toolbar-right">
        <el-button :icon="CircleCheck" :loading="labStore.saving" :disabled="isPageReadonly" @click="openSampleCompletionDialog">
          标记样品完成
        </el-button>
        <el-button v-if="!canViewCompletedSensitiveData" @click="requestCompletedSampleDataAccess">查看加密数据</el-button>
        <el-button :icon="EditPen" :loading="labStore.saving" :disabled="isPageReadonly" @click="handleBulkFillSamples">
          {{ bulkFillButtonText }}
        </el-button>
        <el-button :icon="ChatLineSquare" :loading="labStore.saving" @click="handleGenerateSms">
          {{ smsButtonText }}
        </el-button>
        <el-button :icon="DocumentChecked" :loading="labStore.saving" @click="handleGenerateReport">
          {{ reportButtonText }}
        </el-button>
        <el-button v-if="selectionMode" @click="cancelReportSelection">取消选择</el-button>
      </div>
    </div>

    <LabParameterPanel
      :parameters="labStore.currentParameters"
      :saving="labStore.saving"
      :readonly="isPageReadonly"
      :mobile="isMobileLayout"
      @save="labStore.saveParameters"
    />

    <MobileLabSampleList
      v-if="isMobileLayout"
      :blocks="labStore.sampleBlocks"
      :readonly="isPageReadonly"
      :selection-mode="selectionMode"
      :selected-block-ids="selectedReportBlockIds"
      :highlight-block-id="highlightBlockId"
      :can-view-completed-sensitive-data="canViewCompletedSensitiveData"
      @update="labStore.patchBlock"
      @field-commit="labStore.commitBlockFieldChange"
      @blacklist-hit="showBlacklistHit"
      @selection-change="toggleReportBlockSelection"
      @save-next="handleMobileSaveNext"
    />

    <LabSheetGrid
      v-else
      :blocks="labStore.sampleBlocks"
      :readonly="isPageReadonly"
      :selection-mode="selectionMode"
      :selected-block-ids="selectedReportBlockIds"
      :highlight-block-id="highlightBlockId"
      :can-view-completed-sensitive-data="canViewCompletedSensitiveData"
      @update="labStore.patchBlock"
      @field-commit="labStore.commitBlockFieldChange"
      @blacklist-hit="showBlacklistHit"
      @selection-change="toggleReportBlockSelection"
    />

    <section v-if="isMobileLayout && selectionMode" class="mobile-selection-bar" aria-label="手机批量操作">
      <div>
        <strong>已选 {{ selectedReportBlockIds.length }} 个样品</strong>
        <span>{{ mobileSelectionHint }}</span>
      </div>
      <el-button class="mobile-selection-primary" type="primary" @click="handleMobileSelectionPrimary">
        {{ mobileSelectionButtonText }}
      </el-button>
      <el-button class="mobile-selection-cancel" @click="cancelReportSelection">取消</el-button>
    </section>

    <section class="panel append-panel" v-if="!isPageReadonly">
      <div class="panel__body append-body">
        <span>增加样品数量</span>
        <el-input v-model.trim="appendCount" placeholder="正整数" class="append-input" />
        <el-button class="append-submit" type="primary" :icon="Plus" :loading="labStore.adding" @click="appendBlocks">确认增加</el-button>
      </div>
    </section>

    <BlacklistHitDialog
      :visible="hitDialogVisible"
      :records="hitRecords"
      @close="hitDialogVisible = false"
      @jump="jumpToBlacklist"
    />

    <BulkSampleFillDialog
      :visible="bulkFillDialogVisible"
      :selected-count="selectedReportBlockIds.length"
      @apply="applyBulkSampleFill"
      @close="bulkFillDialogVisible = false"
      @blacklist-hit="showBlacklistHit"
    />

    <SampleCompletionDialog
      :visible="completionDialogVisible"
      :blocks="labStore.sampleBlocks"
      :saving="labStore.saving || labStore.autoSaving"
      @apply="applySampleCompletion"
      @close="completionDialogVisible = false"
    />

    <LabReportDialog
      :visible="reportDialogVisible"
      :blocks="labStore.sampleBlocks"
      :selected-block-ids="selectedReportBlockIds"
      :template="reportTemplate"
      :date="selectedDate"
      :mobile="isMobileLayout"
      @close="reportDialogVisible = false"
    />

    <LabSmsDialog
      :visible="smsDialogVisible"
      :blocks="labStore.sampleBlocks"
      :selected-block-ids="selectedReportBlockIds"
      :template="smsTemplate"
      :mobile="isMobileLayout"
      @close="smsDialogVisible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChatLineSquare, CircleCheck, DocumentChecked, EditPen, Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import type { BlacklistRecord } from '@/types/blacklist'
import type { LabSampleInput } from '@/types/labSheet'
import type { LabReportSmsTemplate, LabReportTemplate } from '@/types/labReport'
import BlacklistHitDialog from '@/components/lab-sheet/BlacklistHitDialog.vue'
import BulkSampleFillDialog from '@/components/lab-sheet/BulkSampleFillDialog.vue'
import LabParameterPanel from '@/components/lab-sheet/LabParameterPanel.vue'
import LabSheetGrid from '@/components/lab-sheet/LabSheetGrid.vue'
import MobileLabSampleList from '@/components/lab-sheet/MobileLabSampleList.vue'
import SampleCompletionDialog from '@/components/lab-sheet/SampleCompletionDialog.vue'
import LabReportDialog from '@/components/lab-report/LabReportDialog.vue'
import LabSmsDialog from '@/components/lab-report/LabSmsDialog.vue'
import { useAccessGuardStore } from '@/stores/accessGuard'
import { useLabSheetStore } from '@/stores/labSheet'
import { useMobileLayout } from '@/composables/useMobileLayout'
import { businessDateInBeijing, millisecondsUntilNextBusinessDayInBeijing } from '@/utils/date'
import { loadLabReportSmsTemplate, loadLabReportTemplate } from '@/utils/labReport'

type GenerationMode = 'report' | 'sms' | 'bulkFill' | null

const route = useRoute()
const router = useRouter()
const labStore = useLabSheetStore()
const accessGuard = useAccessGuardStore()
const { isMobileLayout } = useMobileLayout()
const BUSINESS_DAY_PREFLUSH_LEAD_MS = 5_000
const BUSINESS_DAY_RETRY_MS = 60_000

const selectedDate = ref(businessDateInBeijing())
const appendCount = ref('1')
const hitDialogVisible = ref(false)
const hitRecords = ref<BlacklistRecord[]>([])
const generationMode = ref<GenerationMode>(null)
const selectedReportBlockIds = ref<string[]>([])
const reportDialogVisible = ref(false)
const smsDialogVisible = ref(false)
const bulkFillDialogVisible = ref(false)
const completionDialogVisible = ref(false)
const switchingBusinessDay = ref(false)
const highlightBlockId = ref('')
const reportTemplate = ref<LabReportTemplate>(loadLabReportTemplate())
const smsTemplate = ref<LabReportSmsTemplate>(loadLabReportSmsTemplate())
let businessDayBoundaryTimer: number | undefined
let businessDayPreflushTimer: number | undefined

const isPageReadonly = computed(() => Boolean(
  labStore.sheet?.readonly || switchingBusinessDay.value || labStore.applyingParameters
))
const canViewCompletedSensitiveData = computed(() => {
  accessGuard.accessSessionRevision
  return accessGuard.hasFeatureAccess('COMPLETED_SAMPLE_DATA')
})

const autoSaveText = computed(() => {
  if (labStore.autoSaveStatus === 'pending') return '等待自动保存'
  if (labStore.autoSaveStatus === 'saving') return '自动保存中'
  if (labStore.autoSaveStatus === 'retrying') return '网络不稳定，正在重试保存'
  if (labStore.autoSaveStatus === 'saved') {
    return labStore.lastAutoSavedAt ? `已自动保存 ${dayjs(labStore.lastAutoSavedAt).format('HH:mm:ss')}` : '已自动保存'
  }
  if (labStore.autoSaveStatus === 'error') return '自动保存失败，请手动保存'
  if (labStore.autoSaveStatus === 'conflict') return '保存冲突，本机内容已保留'
  return '自动保存开启'
})

const autoSaveTagType = computed(() => {
  if (labStore.autoSaveStatus === 'error') return 'danger'
  if (labStore.autoSaveStatus === 'conflict') return 'danger'
  if (labStore.autoSaveStatus === 'pending') return 'warning'
  if (labStore.autoSaveStatus === 'retrying') return 'warning'
  if (labStore.autoSaveStatus === 'saving') return 'info'
  if (labStore.autoSaveStatus === 'saved') return 'success'
  return 'info'
})

const reportButtonText = computed(() => {
  if (generationMode.value !== 'report') return '生成化验报告'
  return selectedReportBlockIds.value.length ? '选择元素生成报告' : '请选择样品'
})

const smsButtonText = computed(() => {
  if (generationMode.value !== 'sms') return '生成化验短信'
  return selectedReportBlockIds.value.length ? '选择元素生成短信' : '请选择样品'
})

const bulkFillButtonText = computed(() => {
  if (generationMode.value !== 'bulkFill') return '批量填写样品'
  return selectedReportBlockIds.value.length ? `填写已选${selectedReportBlockIds.value.length}个样品` : '请选择样品'
})

const selectionMode = computed(() => generationMode.value !== null)
const mobileSelectionButtonText = computed(() => {
  if (generationMode.value === 'report') return reportButtonText.value
  if (generationMode.value === 'sms') return smsButtonText.value
  if (generationMode.value === 'bulkFill') return bulkFillButtonText.value
  return '请选择操作'
})
const mobileSelectionHint = computed(() => {
  if (generationMode.value === 'report') return '勾选后生成化验报告'
  if (generationMode.value === 'sms') return '勾选后生成化验短信'
  return '勾选后批量填写样品'
})

onMounted(async () => {
  await accessGuard.loadGroups()
  await loadSheetFromRoute()
  bindBusinessDayListeners()
  await checkBusinessDayBoundary()
})

onBeforeUnmount(() => {
  clearBusinessDayTimers()
  unbindBusinessDayListeners()
  labStore.disconnectRealtime()
})

watch(
  () => [route.query.date, route.query.block],
  () => {
    void loadSheetFromRoute()
  }
)

function bindBusinessDayListeners() {
  window.addEventListener('focus', handleBusinessDayRecovery)
  window.addEventListener('online', handleBusinessDayRecovery)
  document.addEventListener('visibilitychange', handleBusinessDayVisibilityChange)
}

function unbindBusinessDayListeners() {
  window.removeEventListener('focus', handleBusinessDayRecovery)
  window.removeEventListener('online', handleBusinessDayRecovery)
  document.removeEventListener('visibilitychange', handleBusinessDayVisibilityChange)
}

function clearBusinessDayTimers() {
  if (businessDayBoundaryTimer !== undefined) window.clearTimeout(businessDayBoundaryTimer)
  if (businessDayPreflushTimer !== undefined) window.clearTimeout(businessDayPreflushTimer)
  businessDayBoundaryTimer = undefined
  businessDayPreflushTimer = undefined
}

function scheduleBusinessDayBoundary() {
  clearBusinessDayTimers()
  const delay = millisecondsUntilNextBusinessDayInBeijing()
  businessDayPreflushTimer = window.setTimeout(() => {
    void preflushBeforeBusinessDayBoundary()
  }, Math.max(0, delay - BUSINESS_DAY_PREFLUSH_LEAD_MS))
  businessDayBoundaryTimer = window.setTimeout(() => {
    void checkBusinessDayBoundary()
  }, delay)
}

function scheduleBusinessDayRetry() {
  clearBusinessDayTimers()
  businessDayBoundaryTimer = window.setTimeout(() => {
    void checkBusinessDayBoundary()
  }, BUSINESS_DAY_RETRY_MS)
}

async function preflushBeforeBusinessDayBoundary() {
  const currentSheet = labStore.sheet
  if (!currentSheet || currentSheet.readonly || currentSheet.date !== businessDateInBeijing()) return
  await labStore.persistAllBlocks({ silent: true })
}

async function checkBusinessDayBoundary() {
  const explicitDate = typeof route.query.date === 'string' ? route.query.date : ''
  if (explicitDate) {
    scheduleBusinessDayBoundary()
    return
  }
  const businessDate = businessDateInBeijing()
  if (!labStore.sheet || labStore.sheet.date === businessDate) {
    scheduleBusinessDayBoundary()
    return
  }
  if (switchingBusinessDay.value) return
  switchingBusinessDay.value = true
  try {
    const loaded = await labStore.loadCurrentSheet()
    if (loaded === false) {
      ElMessage.error('仍有数据未保存，已保留当前表格，请保存成功后再切换业务日')
      scheduleBusinessDayRetry()
      return
    }
    selectedDate.value = labStore.sheet?.date || businessDate
    highlightBlockId.value = ''
    scheduleBusinessDayBoundary()
  } catch {
    ElMessage.error('新业务日表格加载失败，已保留当前表格')
    scheduleBusinessDayRetry()
  } finally {
    switchingBusinessDay.value = false
  }
}

function handleBusinessDayRecovery() {
  void checkBusinessDayBoundary()
}

function handleBusinessDayVisibilityChange() {
  if (document.visibilityState === 'visible') void checkBusinessDayBoundary()
}

async function loadSheetFromRoute() {
  const queryDate = typeof route.query.date === 'string' ? route.query.date : ''
  const queryBlock = typeof route.query.block === 'string' ? route.query.block : ''
  if (queryDate) {
    const allowed = await requestHistoricalDateAccess(queryDate, () => loadRouteSheetFromQuery(queryDate, queryBlock))
    if (!allowed) {
      selectedDate.value = labStore.sheet?.date || businessDateInBeijing()
      highlightBlockId.value = ''
      return
    }
    await loadRouteSheet(queryDate, queryBlock)
  } else if (!labStore.sheet) {
    await labStore.loadCurrentSheet()
    const loadedSheet = labStore.sheet as { date?: string } | null
    selectedDate.value = loadedSheet?.date || businessDateInBeijing()
  }
  highlightBlockId.value = queryBlock
  if (queryBlock) await scrollToHighlightedBlock(queryBlock)
}

async function handleDateChange(value: string) {
  if (!value) return
  const allowed = await requestHistoricalDateAccess(value, () => loadSelectedDate(value))
  if (!allowed) {
    selectedDate.value = labStore.sheet?.date || businessDateInBeijing()
    return
  }
  await loadSelectedDate(value)
}

async function loadRouteSheet(queryDate: string, queryBlock: string) {
  selectedDate.value = queryDate
  if (labStore.sheet?.date !== queryDate || queryBlock) {
    const loaded = await labStore.loadSheetByDate(queryDate)
    if (!loaded) selectedDate.value = labStore.sheet?.date || businessDateInBeijing()
  }
}

async function loadRouteSheetFromQuery(queryDate: string, queryBlock: string) {
  await loadRouteSheet(queryDate, queryBlock)
  highlightBlockId.value = queryBlock
  if (queryBlock) await scrollToHighlightedBlock(queryBlock)
}

async function loadSelectedDate(value: string) {
  selectedDate.value = value
  highlightBlockId.value = ''
  const loaded = await labStore.loadSheetByDate(value)
  if (!loaded) {
    selectedDate.value = labStore.sheet?.date || businessDateInBeijing()
    ElMessage.error('仍有数据未保存，已停止切换日期')
  }
}

async function requestHistoricalDateAccess(date: string, onSuccess: () => void | Promise<void>) {
  if (date === businessDateInBeijing()) return true
  await accessGuard.loadGroups()
  return accessGuard.requestFeatureAccess('HISTORICAL_DATES', {
    title: '历史日期访问验证',
    message: '默认只能查看当日数据。请输入访问密码后查看过往日期数据。',
    onSuccess
  })
}

async function requestCompletedSampleDataAccess() {
  await accessGuard.loadGroups()
  accessGuard.requestFeatureAccess('COMPLETED_SAMPLE_DATA', {
    title: '已完成样品数据访问验证',
    message: '已完成样品的检测数据、样品金额和结款状态已隐藏。请输入对应组合密码后查看。',
    onSuccess: async () => { await labStore.loadSheetByDate(selectedDate.value) }
  })
}

function showBlacklistHit(records: BlacklistRecord[]) {
  hitRecords.value = records
  hitDialogVisible.value = true
}

async function handleGenerateReport() {
  if (beginSelection('report')) {
    return
  }
  if (!selectedReportBlockIds.value.length) {
    ElMessage.warning('请先选择至少一个样品')
    return
  }
  const saved = await labStore.persistAllBlocks({ silent: true })
  if (!saved.success) return
  reportTemplate.value = loadLabReportTemplate()
  reportDialogVisible.value = true
}

async function handleGenerateSms() {
  if (beginSelection('sms')) {
    return
  }
  if (!selectedReportBlockIds.value.length) {
    ElMessage.warning('请先选择至少一个样品')
    return
  }
  const saved = await labStore.persistAllBlocks({ silent: true })
  if (!saved.success) return
  smsTemplate.value = loadLabReportSmsTemplate()
  smsDialogVisible.value = true
}

async function handleBulkFillSamples() {
  if (isPageReadonly.value) {
    ElMessage.warning('历史副表只读，不能批量填写')
    return
  }
  if (beginSelection('bulkFill')) {
    return
  }
  if (!selectedReportBlockIds.value.length) {
    ElMessage.warning('请先选择至少一个样品')
    return
  }
  bulkFillDialogVisible.value = true
}

function openSampleCompletionDialog() {
  if (isPageReadonly.value) {
    ElMessage.warning('历史副表只读，不能修改完成状态')
    return
  }
  completionDialogVisible.value = true
}

async function applySampleCompletion(payload: { blockIds: string[]; completed: boolean }) {
  const targetBlocks = labStore.sampleBlocks.filter((block) => payload.blockIds.includes(block.id))
  const changedBlocks = targetBlocks.filter((block) => Boolean(block.inputs.completed) !== payload.completed)
  if (!changedBlocks.length) {
    ElMessage.info(payload.completed ? '所选样品已经标记为完成' : '所选样品当前没有完成标记')
    return
  }
  changedBlocks.forEach((block) => {
    labStore.commitBlockFieldChange(block.id, 'completed', Boolean(block.inputs.completed), payload.completed)
    labStore.patchBlock(block.id, { completed: payload.completed })
  })
  const saved = await labStore.persistAllBlocks({ silent: true })
  if (!saved.success) {
    ElMessage.error('样品完成状态尚未保存，请先重试保存')
    return
  }
  completionDialogVisible.value = false
  ElMessage.success(payload.completed ? `已标记 ${changedBlocks.length} 个样品为完成` : `已取消 ${changedBlocks.length} 个样品的完成标记`)
}

function beginSelection(mode: Exclude<GenerationMode, null>) {
  if (generationMode.value === mode) return false
  generationMode.value = mode
  selectedReportBlockIds.value = []
  const actionText = mode === 'bulkFill' ? '批量填写' : `生成${mode === 'report' ? '化验报告' : '化验短信'}`
  ElMessage.info(`请在编号左侧勾选需要${actionText}的样品`)
  return true
}

function cancelReportSelection() {
  generationMode.value = null
  selectedReportBlockIds.value = []
  bulkFillDialogVisible.value = false
}

function toggleReportBlockSelection(blockId: string, checked: boolean) {
  selectedReportBlockIds.value = checked
    ? Array.from(new Set([...selectedReportBlockIds.value, blockId]))
    : selectedReportBlockIds.value.filter((id) => id !== blockId)
}

async function applyBulkSampleFill(payload: { patch: Partial<LabSampleInput> }) {
  const selectedBlocks = labStore.sampleBlocks.filter((block) => selectedReportBlockIds.value.includes(block.id))
  if (!selectedBlocks.length) {
    ElMessage.warning('请先选择至少一个样品')
    return
  }
  const fields = getBulkFillChangeLogFields(payload.patch)
  selectedBlocks.forEach((block) => {
    fields.forEach((field) => {
      labStore.commitBlockFieldChange(block.id, field, block.inputs[field] ?? null, payload.patch[field] ?? null)
    })
    labStore.patchBlock(block.id, payload.patch)
  })
  const saved = await labStore.persistAllBlocks({ silent: true })
  if (!saved.success) {
    ElMessage.error('批量填写内容尚未保存，请先重试')
    return
  }
  bulkFillDialogVisible.value = false
  generationMode.value = null
  selectedReportBlockIds.value = []
  ElMessage.success(`已批量填写 ${selectedBlocks.length} 个样品`)
}

function getBulkFillChangeLogFields(patch: Partial<LabSampleInput>) {
  const fields: Array<keyof LabSampleInput> = []
  if (hasPatchField(patch, 'customerText')) fields.push('customerText')
  if (hasPatchField(patch, 'recipientCustomerText')) fields.push('recipientCustomerText')
  if (hasPatchField(patch, 'price')) fields.push('price')
  if (hasPatchField(patch, 'paymentStatus')) fields.push('paymentStatus')
  if (hasPatchField(patch, 'elementNote')) fields.push('elementNote')
  return fields
}

function hasPatchField(patch: Partial<LabSampleInput>, field: keyof LabSampleInput) {
  return Object.prototype.hasOwnProperty.call(patch, field)
}

async function handleSaveRecovery() {
  if (labStore.autoSaveStatus === 'conflict') {
    try {
      await ElMessageBox.confirm(
        `确认用本机内容覆盖 ${labStore.conflictBlockIds.length} 个冲突样品格中的对应字段吗？`,
        '确认保存本机内容',
        { type: 'warning', confirmButtonText: '确认保存', cancelButtonText: '取消' }
      )
    } catch {
      return
    }
    const result = await labStore.confirmConflictOverwrite()
    if (result.success) ElMessage.success('冲突内容已保存')
    return
  }
  const result = await labStore.retryFailedSaves()
  if (result.success) ElMessage.success('未保存内容已重新保存')
}

async function appendBlocks() {
  try {
    await labStore.appendSampleBlocks(appendCount.value)
    appendCount.value = '1'
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '新增数量无效')
  }
}

async function handleMobileSaveNext() {
  const saved = await labStore.persistAllBlocks({ silent: true })
  if (!saved.success) ElMessage.error('当前样品尚未全部保存，系统将继续自动重试')
}

function handleMobileSelectionPrimary() {
  if (generationMode.value === 'report') return void handleGenerateReport()
  if (generationMode.value === 'sms') return void handleGenerateSms()
  if (generationMode.value === 'bulkFill') return void handleBulkFillSamples()
}

function jumpToBlacklist(id?: string) {
  hitDialogVisible.value = false
  router.push({ path: '/blacklist', query: id ? { hit: id } : undefined })
}

async function scrollToHighlightedBlock(blockId: string) {
  await nextTick()
  window.setTimeout(() => {
    const block = Array.from(document.querySelectorAll<HTMLElement>('[data-block-id]'))
      .find((element) => element.dataset.blockId === blockId)
    const target = isMobileLayout.value
      ? block?.querySelector<HTMLElement>('.mobile-sample-card__header') || block
      : block
    target?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
  }, 120)
}
</script>

<style scoped lang="scss">
.page-stack,
.page-stack > * {
  min-width: 0;
}

.page-stack {
  min-height: calc(100vh - 120px);
  gap: 10px;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
}

.toolbar-left,
.toolbar-right,
.append-body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.toolbar {
  position: sticky;
  top: 74px;
  z-index: 9;
  padding: 8px 0;
  background: rgba(238, 243, 248, 0.96);
  border-bottom: 1px solid #d8e1eb;
  backdrop-filter: blur(8px);
}

.append-panel {
  margin-top: -6px;
}

.append-input {
  width: 140px;
}

:deep(.lab-grid-panel) {
  min-height: 0;
}

.mobile-selection-bar {
  position: fixed;
  right: 0;
  bottom: var(--mobile-page-action-bottom);
  left: 0;
  z-index: 19;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  min-height: 74px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.98);
  border-top: 1px solid #cbd5e1;
  box-shadow: 0 -10px 30px rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(14px);

  > div {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  strong {
    color: #183657;
    font-size: 14px;
  }

  span {
    overflow: hidden;
    color: #64748b;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :deep(.el-button) {
    min-height: 44px;
    margin-left: 0;
  }
}

.page-stack--mobile {
  min-height: calc(100dvh - 140px);
  gap: 10px;
  grid-template-rows: none;

  .toolbar {
    top: calc(56px + env(safe-area-inset-top));
    display: grid;
    gap: 8px;
    margin: -4px -12px 0;
    padding: 8px 12px;
    background: rgba(238, 243, 248, 0.98);
  }

  .toolbar-left {
    display: grid;
    grid-template-columns: minmax(145px, 1fr) auto;
    gap: 6px;

    :deep(.el-date-editor) {
      width: 100%;
      min-height: 44px;
    }

    :deep(.el-tag) {
      min-height: 28px;
    }
  }

  .toolbar-right {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
    width: 100%;

    :deep(.el-button) {
      min-width: 0;
      min-height: 44px;
      margin-left: 0;
      padding-inline: 7px;
      font-size: 12px;
    }
  }

  :deep(.parameter-panel) {
    position: static;
  }

  .append-body {
    display: grid;
    grid-template-columns: auto minmax(70px, 1fr) auto;
    padding: 10px;
  }

  .append-input {
    width: 100%;
  }

  .append-submit {
    min-height: 44px;
  }
}

.page-stack--mobile-selection {
  padding-bottom: 84px;
}

@media (max-width: 374px) {
  .mobile-selection-bar {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .mobile-selection-cancel {
    grid-column: 2;
  }
}
</style>
