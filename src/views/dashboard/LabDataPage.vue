<template>
  <div
    class="page-stack"
    :class="{ 'page-stack--mobile': isMobileLayout, 'page-stack--mobile-selection': isMobileLayout && selectionMode }"
    v-loading="labStore.loading"
  >
    <div class="toolbar">
      <button
        v-if="isMobileLayout"
        class="mobile-toolbar-summary"
        ref="mobileToolbarSummaryRef"
        type="button"
        :aria-expanded="mobileToolbarExpanded"
        :aria-label="mobileToolbarAccessibleName"
        @click="mobileToolbarExpanded = !mobileToolbarExpanded"
      >
        <span class="mobile-toolbar-summary__date">{{ selectedDate }}</span>
        <span class="mobile-toolbar-summary__edit">{{ mobileToolbarEditStatus }}</span>
        <span v-if="!isPageReadonly" class="mobile-toolbar-summary__save" :class="`is-${labStore.autoSaveStatus}`">
          {{ autoSaveText }}
        </span>
        <span class="mobile-toolbar-summary__toggle">{{ mobileToolbarExpanded ? '收起' : '展开' }}</span>
      </button>
      <span
        v-if="isMobileLayout && mobileToolbarLiveStatus"
        class="mobile-toolbar-live-status"
        role="status"
        aria-live="polite"
      >
        {{ mobileToolbarLiveStatus }}
      </span>
      <div v-if="!isMobileLayout || mobileToolbarExpanded" class="toolbar-content">
        <div class="toolbar-left">
          <el-date-picker v-model="selectedDate" type="date" value-format="YYYY-MM-DD" @change="handleDateChange" />
          <el-tag v-if="switchingBusinessDay" type="info" effect="plain">正在切换业务日</el-tag>
          <el-tag v-else-if="labStore.sheet?.readonly" type="warning" effect="plain">历史副表只读</el-tag>
          <el-tag v-else type="success" effect="plain">当前表可编辑</el-tag>
          <el-tag v-if="!isPageReadonly" :type="autoSaveTagType" effect="plain">{{ autoSaveText }}</el-tag>
          <el-button
            class="mobile-toolbar-recovery"
            :class="{ 'mobile-touch-target': isMobileLayout }"
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
          <el-button @click="openChangeRequestDrawer">修改申请记录</el-button>
          <el-button
            :loading="labStore.saving || creatingRetests"
            :disabled="isPageReadonly || creatingRetests"
            @click="openSampleRetestDialog"
          >
            样品复样
          </el-button>
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
      :highlight-retest-id="highlightRetestId"
      :pending-retest-action-ids="pendingRetestActionIds"
      :can-view-completed-sensitive-data="canViewCompletedSensitiveData"
      :sheet-date="labStore.sheet?.date || selectedDate"
      :sample-change-requests="changeRequestStore.pendingByBlock"
      :sample-change-loading="changeRequestStore.loading || changeRequestStore.withdrawing"
      @update="labStore.patchBlock"
      @field-commit="labStore.commitBlockFieldChange"
      @retest-update="labStore.patchRetest"
      @retest-field-commit="handleRetestFieldCommit"
      @retest-delete="handleRetestDelete"
      @retest-void="handleRetestVoid"
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
      :highlight-retest-id="highlightRetestId"
      :pending-retest-action-ids="pendingRetestActionIds"
      :can-view-completed-sensitive-data="canViewCompletedSensitiveData"
      :sheet-date="labStore.sheet?.date || selectedDate"
      :sample-change-requests="changeRequestStore.pendingByBlock"
      :sample-change-loading="changeRequestStore.loading || changeRequestStore.withdrawing"
      @update="labStore.patchBlock"
      @field-commit="labStore.commitBlockFieldChange"
      @retest-update="labStore.patchRetest"
      @retest-field-commit="handleRetestFieldCommit"
      @retest-delete="handleRetestDelete"
      @retest-void="handleRetestVoid"
      @blacklist-hit="showBlacklistHit"
      @selection-change="toggleReportBlockSelection"
      @request-sample-change="openSampleChangeDialog"
      @view-sample-change-request="openSampleChangeRequestDetail"
      @withdraw-sample-change-request="confirmAndWithdrawSampleChangeRequest"
    />

    <HistoricalSampleChangeDialog
      v-model="sampleChangeDialogVisible"
      :block="selectedSampleChangeBlock"
      :submitting="changeRequestStore.submitting || submittingSampleChange"
      @submit="submitSampleChangeRequest"
    />

    <LabSampleChangeRequestDrawer
      v-model="sampleChangeDrawerVisible"
      :rows="changeRequestStore.requests"
      :detail="changeRequestStore.detail"
      :loading="changeRequestStore.loading || changeRequestStore.loadingDetail"
      :withdrawing-id="withdrawingSampleChangeRequestId"
      @select="openSampleChangeRequestDetail"
      @withdraw="withdrawSampleChangeRequest"
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
        <el-input
          v-model.trim="appendCount"
          placeholder="正整数"
          class="append-input"
          :class="{ 'mobile-touch-target': isMobileLayout }"
        />
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

    <SampleRetestDialog
      :visible="retestDialogVisible"
      :blocks="labStore.sampleBlocks"
      :saving="labStore.saving || labStore.autoSaving || creatingRetests"
      @create="applySampleRetestCreation"
      @close="retestDialogVisible = false"
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
import type { LabSampleInput, SampleBlock, SampleRetestInputField } from '@/types/labSheet'
import type { CreateLabSampleChangeRequestPayload } from '@/types/labSampleChangeRequest'
import type { LabReportSmsTemplate, LabReportTemplate } from '@/types/labReport'
import BlacklistHitDialog from '@/components/lab-sheet/BlacklistHitDialog.vue'
import BulkSampleFillDialog from '@/components/lab-sheet/BulkSampleFillDialog.vue'
import LabParameterPanel from '@/components/lab-sheet/LabParameterPanel.vue'
import LabSheetGrid from '@/components/lab-sheet/LabSheetGrid.vue'
import HistoricalSampleChangeDialog from '@/components/lab-sheet/HistoricalSampleChangeDialog.vue'
import LabSampleChangeRequestDrawer from '@/components/lab-sheet/LabSampleChangeRequestDrawer.vue'
import MobileLabSampleList from '@/components/lab-sheet/MobileLabSampleList.vue'
import SampleCompletionDialog from '@/components/lab-sheet/SampleCompletionDialog.vue'
import SampleRetestDialog from '@/components/lab-sheet/SampleRetestDialog.vue'
import LabReportDialog from '@/components/lab-report/LabReportDialog.vue'
import LabSmsDialog from '@/components/lab-report/LabSmsDialog.vue'
import { useAccessGuardStore } from '@/stores/accessGuard'
import { useAuthStore } from '@/stores/auth'
import {
  canAccessFrontendPreference,
  useFrontendPreferencesStore
} from '@/stores/frontendPreferences'
import { useLabSheetStore } from '@/stores/labSheet'
import { useLabSampleChangeRequestStore } from '@/stores/labSampleChangeRequest'
import { useMobileLayout } from '@/composables/useMobileLayout'
import { businessDateInBeijing, millisecondsUntilNextBusinessDayInBeijing } from '@/utils/date'
import { defaultLabReportSmsTemplate, defaultLabReportTemplate } from '@/utils/labReport'

type GenerationMode = 'report' | 'sms' | 'bulkFill' | null
type RetestCreationContext = {
  sheetId: string
  sheetDate: string
  selectedDate: string
  businessDate: string
  routeDate: string
  routeBlock: string
  actorId: string
  ownerId: string
}

const route = useRoute()
const router = useRouter()
const labStore = useLabSheetStore()
const changeRequestStore = useLabSampleChangeRequestStore()
const accessGuard = useAccessGuardStore()
const authStore = useAuthStore()
const frontendPreferences = useFrontendPreferencesStore()
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
const retestDialogVisible = ref(false)
const creatingRetests = ref(false)
const switchingBusinessDay = ref(false)
const highlightBlockId = ref('')
const sampleChangeDialogVisible = ref(false)
const selectedSampleChangeBlock = ref<SampleBlock | null>(null)
const sampleChangeDrawerVisible = ref(false)
const submittingSampleChange = ref(false)
const withdrawingSampleChangeRequestId = ref('')
const highlightRetestId = ref('')
const pendingRetestActionIds = ref<string[]>([])
const reportTemplate = ref<LabReportTemplate>({
  ...defaultLabReportTemplate,
  statements: [...defaultLabReportTemplate.statements]
})
const smsTemplate = ref<LabReportSmsTemplate>({ ...defaultLabReportSmsTemplate })
let businessDayBoundaryTimer: number | undefined
let businessDayPreflushTimer: number | undefined
let retestCreationGeneration = 0
let retestActionGeneration = 0
const activeRetestLifecycleActions = new Map<string, number>()

const isPageReadonly = computed(() => Boolean(
  labStore.sheet?.readonly || switchingBusinessDay.value || labStore.applyingParameters
))
const canViewCompletedSensitiveData = computed(() => {
  accessGuard.accessSessionRevision
  return accessGuard.hasFeatureAccess('COMPLETED_SAMPLE_DATA')
})
const retestActorContextKey = computed(() => {
  const user = authStore.user
  return JSON.stringify([user?.id || '', user?.dataOwnerId || user?.id || ''])
})
const loadedSheetContextKey = computed(() => JSON.stringify([
  labStore.sheet?.id || '',
  labStore.sheet?.date || ''
]))

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
const mobileToolbarExpanded = ref(false)
const mobileToolbarSummaryRef = ref<HTMLButtonElement | null>(null)
const mobileToolbarEditStatus = computed(() => {
  if (switchingBusinessDay.value) return '正在切换业务日'
  if (labStore.applyingParameters) return '正在应用参数'
  if (labStore.sheet?.readonly) return '历史副表只读'
  return '当前表可编辑'
})
const mobileToolbarAccessibleName = computed(() => [
  mobileToolbarExpanded.value ? '收起数据计算操作' : '展开数据计算操作',
  selectedDate.value,
  mobileToolbarEditStatus.value,
  isPageReadonly.value ? '' : autoSaveText.value
].filter(Boolean).join('，'))
const mobileToolbarLiveStatus = computed(() => {
  if (isPageReadonly.value) return ''
  if (labStore.autoSaveStatus === 'error' || labStore.autoSaveStatus === 'conflict') return autoSaveText.value
  return ''
})
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
  invalidateRetestCreationContext()
  clearBusinessDayTimers()
  unbindBusinessDayListeners()
  labStore.disconnectRealtime()
  changeRequestStore.reset()
})

watch(isMobileLayout, () => {
  mobileToolbarExpanded.value = false
})

watch(selectionMode, (selecting) => {
  if (isMobileLayout.value && selecting) {
    mobileToolbarExpanded.value = false
    void nextTick(() => mobileToolbarSummaryRef.value?.focus())
  }
})

watch(retestActorContextKey, (current, previous) => {
  if (current !== previous) invalidateRetestCreationContext()
})

watch(loadedSheetContextKey, (current, previous) => {
  if (current !== previous) invalidateRetestCreationContext()
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
  invalidateRetestCreationContext()
  try {
    const loaded = await labStore.loadCurrentSheet()
    if (loaded === false) {
      ElMessage.error('仍有数据未保存，已保留当前表格，请保存成功后再切换业务日')
      scheduleBusinessDayRetry()
      return
    }
    selectedDate.value = labStore.sheet?.date || businessDate
    highlightBlockId.value = ''
    await syncSampleChangeRequestsForSheet()
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
  invalidateRetestCreationContext()
  if (queryDate) {
    const allowed = await requestHistoricalDateAccess(queryDate, () => loadRouteSheetFromQuery(queryDate, queryBlock))
    if (!allowed) {
      changeRequestStore.reset()
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
  await syncSampleChangeRequestsForSheet()
  highlightBlockId.value = queryBlock
  if (queryBlock) await scrollToHighlightedBlock(queryBlock)
}

async function handleDateChange(value: string) {
  if (!value) return
  const allowed = await requestHistoricalDateAccess(value, () => loadSelectedDate(value))
  if (!allowed) {
    changeRequestStore.reset()
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
  invalidateRetestCreationContext()
  const loaded = await labStore.loadSheetByDate(value)
  if (!loaded) {
    changeRequestStore.reset()
    selectedDate.value = labStore.sheet?.date || businessDateInBeijing()
    ElMessage.error('仍有数据未保存，已停止切换日期')
    return
  }
  await syncSampleChangeRequestsForSheet()
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

async function syncSampleChangeRequestsForSheet() {
  const sheet = labStore.sheet
  if (!sheet?.readonly || sheet.date >= businessDateInBeijing()) {
    changeRequestStore.reset()
    return
  }
  try {
    await changeRequestStore.load({ date: sheet.date })
  } catch {
    changeRequestStore.reset()
    ElMessage.error('修改申请记录加载失败，请稍后重试')
  }
}

function openSampleChangeDialog(blockId: string) {
  const sheet = labStore.sheet
  if (!sheet?.readonly || sheet.date >= businessDateInBeijing()) return
  const block = labStore.sampleBlocks.find((item) => item.id === blockId)
  if (!block) return
  selectedSampleChangeBlock.value = block
  sampleChangeDialogVisible.value = true
}

async function submitSampleChangeRequest(payload: CreateLabSampleChangeRequestPayload) {
  if (submittingSampleChange.value || changeRequestStore.submitting) return
  submittingSampleChange.value = true
  try {
    await changeRequestStore.submit(payload)
    sampleChangeDialogVisible.value = false
    selectedSampleChangeBlock.value = null
    ElMessage.success('修改申请已提交，历史样品数据保持不变')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '修改申请提交失败，请重试')
  } finally {
    submittingSampleChange.value = false
  }
}

async function openChangeRequestDrawer() {
  sampleChangeDrawerVisible.value = true
  try {
    await changeRequestStore.load()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '修改申请记录加载失败，请稍后重试')
  }
}

async function openSampleChangeRequestDetail(id: string) {
  sampleChangeDrawerVisible.value = true
  try {
    await changeRequestStore.loadDetail(id)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '申请详情加载失败')
  }
}

async function confirmAndWithdrawSampleChangeRequest(id: string) {
  if (withdrawingSampleChangeRequestId.value) return
  try {
    await ElMessageBox.confirm(
      '撤回后该申请会保留在历史记录中，且可重新提交修改申请。',
      '确认撤回修改申请',
      { type: 'warning', confirmButtonText: '确认撤回', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  await withdrawSampleChangeRequest(id)
}

async function withdrawSampleChangeRequest(id: string) {
  if (withdrawingSampleChangeRequestId.value) return
  withdrawingSampleChangeRequestId.value = id
  try {
    await changeRequestStore.withdraw(id)
    ElMessage.success('修改申请已撤回，历史样品数据未发生变化')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '撤回申请失败')
  } finally {
    withdrawingSampleChangeRequestId.value = ''
  }
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
  reportTemplate.value = canAccessFrontendPreference(authStore.user, 'LAB_REPORT_TEMPLATE')
    ? frontendPreferences.value('LAB_REPORT_TEMPLATE', defaultLabReportTemplate)
    : cloneDefaultReportTemplate()
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
  smsTemplate.value = canAccessFrontendPreference(authStore.user, 'LAB_REPORT_SMS_TEMPLATE')
    ? frontendPreferences.value('LAB_REPORT_SMS_TEMPLATE', defaultLabReportSmsTemplate)
    : { ...defaultLabReportSmsTemplate }
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

function openSampleRetestDialog() {
  if (isPageReadonly.value) {
    ElMessage.warning('历史副表只读，不能创建复样')
    return
  }
  retestDialogVisible.value = true
}

async function applySampleRetestCreation(payload: { sampleBlockIds: string[] }) {
  if (creatingRetests.value) return
  const operationGeneration = ++retestCreationGeneration
  const operationContext = captureRetestCreationContext()
  creatingRetests.value = true
  try {
    const created = await labStore.createRetests(payload.sampleBlockIds)
    if (!isCurrentRetestCreationOperation(operationGeneration, operationContext)) return
    retestDialogVisible.value = false
    highlightRetestId.value = created[0]?.id || ''
    ElMessage.success(`已创建 ${created.length} 组复样`)
  } catch (error) {
    if (!isCurrentRetestCreationOperation(operationGeneration, operationContext)) return
    ElMessage.error(error instanceof Error ? error.message : '复样创建失败')
  } finally {
    if (operationGeneration === retestCreationGeneration) creatingRetests.value = false
  }
}

function captureRetestCreationContext(): RetestCreationContext {
  const user = authStore.user
  return {
    sheetId: labStore.sheet?.id || '',
    sheetDate: labStore.sheet?.date || '',
    selectedDate: selectedDate.value,
    businessDate: businessDateInBeijing(),
    routeDate: typeof route.query.date === 'string' ? route.query.date : '',
    routeBlock: typeof route.query.block === 'string' ? route.query.block : '',
    actorId: user?.id || '',
    ownerId: user?.dataOwnerId || user?.id || ''
  }
}

function isCurrentRetestCreationOperation(generation: number, context: RetestCreationContext) {
  return generation === retestCreationGeneration &&
    JSON.stringify(context) === JSON.stringify(captureRetestCreationContext())
}

function invalidateRetestCreationContext() {
  retestCreationGeneration += 1
  retestActionGeneration += 1
  activeRetestLifecycleActions.clear()
  pendingRetestActionIds.value = []
  creatingRetests.value = false
  retestDialogVisible.value = false
  highlightRetestId.value = ''
}

function handleRetestFieldCommit(
  sampleBlockId: string,
  retestId: string,
  _field: SampleRetestInputField,
  oldValue: unknown,
  newValue: unknown
) {
  if (JSON.stringify(oldValue ?? null) === JSON.stringify(newValue ?? null)) return
  void labStore.persistRetest(sampleBlockId, retestId)
}

async function handleRetestDelete(sampleBlockId: string, retestId: string) {
  const operationGeneration = beginRetestLifecycleAction(retestId)
  if (operationGeneration === null) return
  const operationContext = captureRetestCreationContext()
  try {
    try {
      await ElMessageBox.confirm('确认删除这条空白复样吗？', '删除复样', {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消'
      })
    } catch {
      return
    }
    if (!isCurrentRetestActionOperation(retestId, operationGeneration, operationContext)) return
    try {
      const deleted = await labStore.deleteRetestRecord(sampleBlockId, retestId)
      if (!deleted || !isCurrentRetestActionOperation(retestId, operationGeneration, operationContext)) return
      if (highlightRetestId.value === retestId) highlightRetestId.value = ''
      ElMessage.success('空白复样已删除')
    } catch (error) {
      if (!isCurrentRetestActionOperation(retestId, operationGeneration, operationContext)) return
      ElMessage.error(error instanceof Error ? error.message : '复样删除失败')
    }
  } finally {
    finishRetestLifecycleAction(retestId, operationGeneration)
  }
}

async function handleRetestVoid(sampleBlockId: string, retestId: string) {
  const operationGeneration = beginRetestLifecycleAction(retestId)
  if (operationGeneration === null) return
  const operationContext = captureRetestCreationContext()
  try {
    let reason = ''
    try {
      const response = await ElMessageBox.prompt('作废后不可恢复，可选填写作废原因。', '作废复样', {
        type: 'warning',
        confirmButtonText: '确认作废',
        cancelButtonText: '取消',
        inputPlaceholder: '可选：填写作废原因'
      })
      reason = response.value || ''
    } catch {
      return
    }
    if (!isCurrentRetestActionOperation(retestId, operationGeneration, operationContext)) return
    try {
      const voided = await labStore.voidRetestRecord(sampleBlockId, retestId, reason)
      if (!voided || !isCurrentRetestActionOperation(retestId, operationGeneration, operationContext)) return
      ElMessage.success('复样已作废')
    } catch (error) {
      if (!isCurrentRetestActionOperation(retestId, operationGeneration, operationContext)) return
      ElMessage.error(error instanceof Error ? error.message : '复样作废失败')
    }
  } finally {
    finishRetestLifecycleAction(retestId, operationGeneration)
  }
}

function beginRetestLifecycleAction(retestId: string) {
  if (activeRetestLifecycleActions.has(retestId)) return null
  const generation = ++retestActionGeneration
  activeRetestLifecycleActions.set(retestId, generation)
  pendingRetestActionIds.value = [...pendingRetestActionIds.value, retestId]
  return generation
}

function finishRetestLifecycleAction(retestId: string, generation: number) {
  if (activeRetestLifecycleActions.get(retestId) === generation) {
    activeRetestLifecycleActions.delete(retestId)
    pendingRetestActionIds.value = pendingRetestActionIds.value.filter((id) => id !== retestId)
  }
}

function isCurrentRetestActionOperation(retestId: string, generation: number, context: RetestCreationContext) {
  return activeRetestLifecycleActions.get(retestId) === generation &&
    JSON.stringify(context) === JSON.stringify(captureRetestCreationContext())
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
  selectedBlocks.forEach((block) => {
    const blockPatch = { ...payload.patch }
    if (
      block.inputs.paymentStatus === '预存款' &&
      hasPatchField(blockPatch, 'paymentStatus') &&
      blockPatch.paymentStatus !== '预存款'
    ) {
      blockPatch.prepaidMemberId = undefined
      blockPatch.prepaidMemberPhone = undefined
    }
    const fields = getBulkFillChangeLogFields(blockPatch)
    fields.forEach((field) => {
      labStore.commitBlockFieldChange(block.id, field, block.inputs[field] ?? null, blockPatch[field] ?? null)
    })
    labStore.patchBlock(block.id, blockPatch)
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

function cloneDefaultReportTemplate(): LabReportTemplate {
  return {
    ...defaultLabReportTemplate,
    statements: [...defaultLabReportTemplate.statements]
  }
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

.toolbar-content {
  display: contents;
}

.mobile-toolbar-summary {
  display: none;
}

.mobile-toolbar-live-status {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
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

  .mobile-toolbar-summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) 44px;
    align-items: center;
    gap: 6px;
    width: 100%;
    min-width: 0;
    min-height: 44px;
    padding: 0;
    overflow: hidden;
    color: #183657;
    text-align: left;
    background: transparent;
    border: 0;

    > span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &__date,
    &__edit,
    &__save {
      font-size: 12px;
    }

    &__toggle {
      display: grid;
      min-height: 44px;
      place-items: center;
      color: #2563eb;
      font-size: 12px;
    }
  }

  .toolbar-content {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .toolbar-left {
    display: grid;
    grid-template-columns: minmax(145px, 1fr) auto;
    gap: 6px;

    .mobile-toolbar-recovery {
      min-height: 44px;
      margin-left: 0;
    }

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
    grid-template-columns: repeat(2, minmax(0, 1fr));
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

  :deep(.append-input .el-input__wrapper) {
    min-height: 44px;
  }

  .append-submit {
    min-height: 44px;
  }
}

.page-stack--mobile-selection {
  padding-bottom: 84px;
}

@media (max-width: 374px) {
  .mobile-toolbar-summary {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) 44px;

    &__edit,
    &__save {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .mobile-selection-bar {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .mobile-selection-cancel {
    grid-column: 2;
  }
}
</style>
