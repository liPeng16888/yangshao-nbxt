<template>
  <div class="page-stack" v-loading="labStore.loading">
    <div class="toolbar">
      <div class="toolbar-left">
        <el-date-picker v-model="selectedDate" type="date" value-format="YYYY-MM-DD" @change="handleDateChange" />
        <el-tag v-if="labStore.sheet?.readonly" type="warning" effect="plain">历史副表只读</el-tag>
        <el-tag v-else type="success" effect="plain">当前表可编辑</el-tag>
        <el-tag v-if="!labStore.sheet?.readonly" :type="autoSaveTagType" effect="plain">{{ autoSaveText }}</el-tag>
      </div>
      <div class="toolbar-right">
        <el-button :icon="ChatLineSquare" :loading="labStore.saving" @click="handleGenerateSms">
          {{ smsButtonText }}
        </el-button>
        <el-button :icon="DocumentChecked" :loading="labStore.saving" @click="handleGenerateReport">
          {{ reportButtonText }}
        </el-button>
        <el-button v-if="selectionMode" @click="cancelReportSelection">取消选择</el-button>
      </div>
    </div>

    <LabParameterPanel :parameters="labStore.currentParameters" :saving="labStore.saving" @save="labStore.saveParameters" />

    <LabSheetGrid
      :blocks="labStore.sampleBlocks"
      :readonly="labStore.sheet?.readonly"
      :selection-mode="selectionMode"
      :selected-block-ids="selectedReportBlockIds"
      :highlight-block-id="highlightBlockId"
      @update="labStore.patchBlock"
      @field-commit="labStore.commitBlockFieldChange"
      @blacklist-hit="showBlacklistHit"
      @selection-change="toggleReportBlockSelection"
    />

    <section class="panel append-panel" v-if="!labStore.sheet?.readonly">
      <div class="panel__body append-body">
        <span>增加样品数量</span>
        <el-input v-model.trim="appendCount" placeholder="正整数" class="append-input" />
        <el-button type="primary" :icon="Plus" :loading="labStore.adding" @click="appendBlocks">确认增加</el-button>
      </div>
    </section>

    <BlacklistHitDialog
      :visible="hitDialogVisible"
      :records="hitRecords"
      @close="hitDialogVisible = false"
      @jump="jumpToBlacklist"
    />

    <LabReportDialog
      :visible="reportDialogVisible"
      :blocks="labStore.sampleBlocks"
      :selected-block-ids="selectedReportBlockIds"
      :template="reportTemplate"
      :date="selectedDate"
      @close="reportDialogVisible = false"
    />

    <LabSmsDialog
      :visible="smsDialogVisible"
      :blocks="labStore.sampleBlocks"
      :selected-block-ids="selectedReportBlockIds"
      :template="smsTemplate"
      @close="smsDialogVisible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChatLineSquare, DocumentChecked, Plus } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import type { BlacklistRecord } from '@/types/blacklist'
import type { LabReportSmsTemplate, LabReportTemplate } from '@/types/labReport'
import BlacklistHitDialog from '@/components/lab-sheet/BlacklistHitDialog.vue'
import LabParameterPanel from '@/components/lab-sheet/LabParameterPanel.vue'
import LabSheetGrid from '@/components/lab-sheet/LabSheetGrid.vue'
import LabReportDialog from '@/components/lab-report/LabReportDialog.vue'
import LabSmsDialog from '@/components/lab-report/LabSmsDialog.vue'
import { useAccessGuardStore } from '@/stores/accessGuard'
import { useLabSheetStore } from '@/stores/labSheet'
import { todayInBeijing } from '@/utils/date'
import { loadLabReportSmsTemplate, loadLabReportTemplate } from '@/utils/labReport'

type GenerationMode = 'report' | 'sms' | null

const route = useRoute()
const router = useRouter()
const labStore = useLabSheetStore()
const accessGuard = useAccessGuardStore()
const selectedDate = ref(todayInBeijing())
const appendCount = ref('1')
const hitDialogVisible = ref(false)
const hitRecords = ref<BlacklistRecord[]>([])
const generationMode = ref<GenerationMode>(null)
const selectedReportBlockIds = ref<string[]>([])
const reportDialogVisible = ref(false)
const smsDialogVisible = ref(false)
const highlightBlockId = ref('')
const reportTemplate = ref<LabReportTemplate>(loadLabReportTemplate())
const smsTemplate = ref<LabReportSmsTemplate>(loadLabReportSmsTemplate())

const autoSaveText = computed(() => {
  if (labStore.autoSaveStatus === 'pending') return '等待自动保存'
  if (labStore.autoSaveStatus === 'saving') return '自动保存中'
  if (labStore.autoSaveStatus === 'saved') {
    return labStore.lastAutoSavedAt ? `已自动保存 ${dayjs(labStore.lastAutoSavedAt).format('HH:mm:ss')}` : '已自动保存'
  }
  if (labStore.autoSaveStatus === 'error') return '自动保存失败，请手动保存'
  return '自动保存开启'
})

const autoSaveTagType = computed(() => {
  if (labStore.autoSaveStatus === 'error') return 'danger'
  if (labStore.autoSaveStatus === 'pending') return 'warning'
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

const selectionMode = computed(() => generationMode.value !== null)

onMounted(async () => {
  await loadSheetFromRoute()
})

onBeforeUnmount(() => {
  labStore.disconnectRealtime()
})

watch(
  () => [route.query.date, route.query.block],
  () => {
    void loadSheetFromRoute()
  }
)

async function loadSheetFromRoute() {
  const queryDate = typeof route.query.date === 'string' ? route.query.date : ''
  const queryBlock = typeof route.query.block === 'string' ? route.query.block : ''
  if (queryDate) {
    const allowed = await requestHistoricalDateAccess(queryDate, () => loadRouteSheetFromQuery(queryDate, queryBlock))
    if (!allowed) {
      selectedDate.value = labStore.sheet?.date || todayInBeijing()
      highlightBlockId.value = ''
      return
    }
    await loadRouteSheet(queryDate, queryBlock)
  } else if (!labStore.sheet) {
    await labStore.loadCurrentSheet()
    const loadedSheet = labStore.sheet as { date?: string } | null
    selectedDate.value = loadedSheet?.date || todayInBeijing()
  }
  highlightBlockId.value = queryBlock
  if (queryBlock) await scrollToHighlightedBlock(queryBlock)
}

async function handleDateChange(value: string) {
  if (!value) return
  const allowed = await requestHistoricalDateAccess(value, () => loadSelectedDate(value))
  if (!allowed) {
    selectedDate.value = labStore.sheet?.date || todayInBeijing()
    return
  }
  await loadSelectedDate(value)
}

async function loadRouteSheet(queryDate: string, queryBlock: string) {
  selectedDate.value = queryDate
  if (labStore.sheet?.date !== queryDate || queryBlock) await labStore.loadSheetByDate(queryDate)
}

async function loadRouteSheetFromQuery(queryDate: string, queryBlock: string) {
  await loadRouteSheet(queryDate, queryBlock)
  highlightBlockId.value = queryBlock
  if (queryBlock) await scrollToHighlightedBlock(queryBlock)
}

async function loadSelectedDate(value: string) {
  selectedDate.value = value
  highlightBlockId.value = ''
  await labStore.loadSheetByDate(value)
}

async function requestHistoricalDateAccess(date: string, onSuccess: () => void | Promise<void>) {
  if (date === todayInBeijing()) return true
  await accessGuard.loadSettings()
  return accessGuard.requestAccess({
    title: '历史日期访问验证',
    message: '默认只能查看当日数据。请输入访问密码后查看过往日期数据。',
    onSuccess
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
  await labStore.persistAllBlocks({ silent: true })
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
  await labStore.persistAllBlocks({ silent: true })
  smsTemplate.value = loadLabReportSmsTemplate()
  smsDialogVisible.value = true
}

function beginSelection(mode: Exclude<GenerationMode, null>) {
  if (generationMode.value === mode) return false
  generationMode.value = mode
  selectedReportBlockIds.value = []
  ElMessage.info(`请在编号左侧勾选需要生成${mode === 'report' ? '化验报告' : '化验短信'}的样品`)
  return true
}

function cancelReportSelection() {
  generationMode.value = null
  selectedReportBlockIds.value = []
}

function toggleReportBlockSelection(blockId: string, checked: boolean) {
  selectedReportBlockIds.value = checked
    ? Array.from(new Set([...selectedReportBlockIds.value, blockId]))
    : selectedReportBlockIds.value.filter((id) => id !== blockId)
}

async function appendBlocks() {
  try {
    await labStore.appendSampleBlocks(appendCount.value)
    appendCount.value = '1'
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '新增数量无效')
  }
}

function jumpToBlacklist(id?: string) {
  hitDialogVisible.value = false
  router.push({ path: '/blacklist', query: id ? { hit: id } : undefined })
}

async function scrollToHighlightedBlock(blockId: string) {
  await nextTick()
  window.setTimeout(() => {
    document.querySelector(`[data-block-id="${blockId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
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
</style>
