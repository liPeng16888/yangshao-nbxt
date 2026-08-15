<template>
  <PageShell title="排班考勤概览" description="按自然月编辑排班，并查看服务端统一计算的每日考勤状态和当月概览。" :class="{ 'schedule-page--mobile': isMobileLayout, 'schedule-page--mobile-batch': isMobileLayout && batchMode }" :employee-change-refresh="false" :month-change-refresh="false" @refresh="load()">
    <template #actions>
      <el-button v-if="!isMobileLayout || !batchMode" data-testid="copy-previous-month" :disabled="!store.employeeId" @click="openCopy">复制上月排班</el-button>
      <el-button data-testid="batch-mode" :disabled="!store.employeeId" :type="batchMode ? 'primary' : 'default'" @click="toggleBatchMode">
        {{ batchMode ? '退出批量选择' : '批量选择日期' }}
      </el-button>
      <el-button v-if="batchMode && !isMobileLayout" data-testid="apply-batch" type="primary" :disabled="!selectedDates.length" @click="batchVisible = true">应用到 {{ selectedDates.length }} 天</el-button>
    </template>

    <template v-if="store.employeeId">
      <section class="schedule-summary">
        <div><span>排班工作日</span><strong>{{ workdayCount }} 天</strong><small>由当前月每日排班自动统计</small></div>
        <div class="schedule-summary__quota">
          <span>月休额度</span>
          <el-input-number v-model="restQuotaDays" data-testid="month-rest-quota" :min="0" />
          <span>天</span>
          <el-button type="primary" :loading="store.saving" @click="saveMonthSetting">保存</el-button>
        </div>
      </section>
      <MobileAttendanceCalendar
        v-if="isMobileLayout"
        :month="store.month"
        :days="store.scheduleAttendanceOverview?.days || []"
        :selected-dates="selectedDates"
        :batch-mode="batchMode"
        @select-date="openDay"
        @toggle-date="toggleDate"
      />
      <MonthlyScheduleCalendar
        v-else
        :month="store.month"
        :days="store.scheduleAttendanceOverview?.days || []"
        :selected-dates="selectedDates"
        :batch-mode="batchMode"
        @select-date="openDay"
        @toggle-date="toggleDate"
      />
      <p v-if="batchMode" class="batch-tip">已选择 {{ selectedDates.length }} 个日期；应用后会完整覆盖这些日期原有排班。</p>
    </template>
    <el-empty v-else description="请先选择需要排班的员工" />
    <AttendanceOverviewPanel :overview="store.overview" />
  </PageShell>

  <MobileActionBar v-if="isMobileLayout && batchMode" data-testid="mobile-schedule-action-bar" class="mobile-schedule-action-bar">
    <span>已选择 {{ selectedDates.length }} 天</span>
    <el-button data-testid="apply-batch" type="primary" :disabled="!selectedDates.length" @click="batchVisible = true">应用并覆盖</el-button>
  </MobileActionBar>

  <ScheduleDayDrawer
    v-model:visible="drawerVisible"
    :date="editingDate"
    :employee-id="store.employeeId"
    :row="editingRow"
    :saving="store.saving"
    :error="drawerError"
    @save="saveDay"
    @delete="deleteDay"
  />
  <ScheduleBatchDialog
    v-model:visible="batchVisible"
    :employee-id="store.employeeId"
    :selected-dates="selectedDates"
    :rows="store.monthlySchedules"
    :saving="store.saving"
    :error="batchError"
    @save="saveBatch"
  />
  <el-dialog v-model="copyVisible" title="复制上月排班" :width="isMobileLayout ? '100%' : '440px'" :fullscreen="isMobileLayout" :close-on-click-modal="false">
    <p>将上月同日日期的排班复制到 {{ store.month }}。{{ store.monthlySchedules.length ? '覆盖当前月已有排班后，当前月原有排班会被完整替换。' : '当前月尚未有排班记录。' }}</p>
    <el-alert v-if="copyError" :title="copyError" type="error" :closable="false" show-icon />
    <template #footer>
      <el-button @click="copyVisible = false">取消</el-button>
      <el-button type="primary" :loading="store.saving" @click="copyPrevious">确认复制{{ store.monthlySchedules.length ? '并覆盖' : '' }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import PageShell from './EmployeeAttendancePageShell.vue'
import MonthlyScheduleCalendar from './MonthlyScheduleCalendar.vue'
import MobileAttendanceCalendar from './MobileAttendanceCalendar.vue'
import ScheduleDayDrawer from './ScheduleDayDrawer.vue'
import ScheduleBatchDialog from './ScheduleBatchDialog.vue'
import AttendanceOverviewPanel from './AttendanceOverviewPanel.vue'
import MobileActionBar from '@/components/mobile/MobileActionBar.vue'
import { useMobileLayout } from '@/composables/useMobileLayout'
import { useEmployeeAttendanceStore } from '@/stores/employeeAttendance'
import * as api from '@/api/employeeAttendance'
import type { BatchMonthlySchedulePayload, MonthlyScheduleDay, MonthlySchedulePayload } from '@/types/employeeAttendance'

const store = useEmployeeAttendanceStore()
const { isMobileLayout } = useMobileLayout()
const batchMode = ref(false)
const batchVisible = ref(false)
const copyVisible = ref(false)
const drawerVisible = ref(false)
const editingDate = ref('')
const selectedDates = ref<string[]>([])
const restQuotaDays = ref(0)
const drawerError = ref('')
const batchError = ref('')
const copyError = ref('')
const editingRow = computed<MonthlyScheduleDay | undefined>(() => store.monthlySchedules.find((row) => row.date === editingDate.value))
const workdayCount = computed(() => store.monthlySchedules.filter((row) => row.isWorkday && row.segments.length > 0).length)
const currentMonthSetting = computed(() => store.monthSettings.find((row) => row.employeeId === store.employeeId && row.month === store.month))
const errorText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback
let scheduleLoadSequence = 0
let activeLoadKey = ''
let activeLoad: Promise<void> | null = null

function hydrateMonthSetting() {
  const employee = store.employees.find((row) => row.id === store.employeeId)
  restQuotaDays.value = currentMonthSetting.value?.restQuotaDays ?? employee?.restQuotaDays ?? 0
}
async function load(options: { force?: boolean } = {}) {
  store.restoreMonthMode()
  if (!/^\d{4}-\d{2}$/.test(store.month)) {
    store.selectMonth(dayjs().format('YYYY-MM'))
    return
  }
  const employeeId = store.employeeId
  const month = store.month
  const requestKey = `${employeeId}:${month}`
  if (!options.force && activeLoad && activeLoadKey === requestKey) return activeLoad
  const requestId = ++scheduleLoadSequence
  store.clearError()
  const request = (async () => {
    try {
      const [result, settings] = await Promise.all([
        store.loadScheduleAttendanceOverview(),
        store.runQuiet(() => api.getMonthlySettings(month))
      ])
      if (requestId !== scheduleLoadSequence || store.employeeId !== employeeId || store.month !== month) return
      if (!result) return
      store.monthSettings = settings
      hydrateMonthSetting()
    } catch (error) {
      if (requestId === scheduleLoadSequence && store.employeeId === employeeId && store.month === month) {
        store.setError(errorText(error, '月度排班加载失败'))
      }
    }
  })()
  activeLoadKey = requestKey
  activeLoad = request
  try { await request } finally { if (activeLoad === request) { activeLoad = null; activeLoadKey = '' } }
}
function openDay(date: string) { editingDate.value = date; drawerError.value = ''; drawerVisible.value = true }
function toggleDate(date: string) {
  selectedDates.value = selectedDates.value.includes(date)
    ? selectedDates.value.filter((value) => value !== date)
    : [...selectedDates.value, date].sort()
}
function toggleBatchMode() {
  batchMode.value = !batchMode.value
  selectedDates.value = []
  batchVisible.value = false
}
async function saveDay(payload: MonthlySchedulePayload) {
  const context = { date: payload.date, employeeId: payload.employeeId, month: payload.date.slice(0, 7) }
  drawerError.value = ''
  try {
    await store.run(() => api.saveMonthlyScheduleDay(payload), true)
    if (drawerVisible.value && editingDate.value === context.date) drawerVisible.value = false
    if (store.employeeId === context.employeeId && store.month === context.month) await load({ force: true })
  } catch (error) {
    if (drawerVisible.value && editingDate.value === context.date && store.employeeId === context.employeeId && store.month === context.month) {
      drawerError.value = errorText(error, '当天排班保存失败')
    }
  }
}
async function deleteDay(id: string) {
  const context = { date: editingDate.value, employeeId: store.employeeId, month: store.month }
  drawerError.value = ''
  try {
    await store.run(() => api.deleteMonthlyScheduleDay(id), true)
    if (drawerVisible.value && editingDate.value === context.date) drawerVisible.value = false
    if (store.employeeId === context.employeeId && store.month === context.month) await load({ force: true })
  } catch (error) {
    if (drawerVisible.value && editingDate.value === context.date && store.employeeId === context.employeeId && store.month === context.month) {
      drawerError.value = errorText(error, '当天排班删除失败')
    }
  }
}
async function saveBatch(payload: BatchMonthlySchedulePayload) {
  batchError.value = ''
  try {
    const result = await store.run(() => api.batchSaveMonthlySchedules(payload), true)
    batchVisible.value = false
    batchMode.value = false
    selectedDates.value = []
    await load({ force: true })
    ElMessage.success(`已覆盖 ${result.updated} 个日期，其中 ${result.overwritten} 天原有排班已替换`)
  } catch (error) { batchError.value = errorText(error, '批量排班保存失败') }
}
async function saveMonthSetting() {
  if (!store.employeeId) return
  try {
    await store.run(() => api.saveMonthlySetting({ employeeId: store.employeeId, month: store.month, restQuotaDays: restQuotaDays.value }), true)
    await load({ force: true })
  } catch (error) { store.setError(errorText(error, '月休额度保存失败')) }
}
function openCopy() { copyError.value = ''; copyVisible.value = true }
async function copyPrevious() {
  copyError.value = ''
  try {
    const result = await store.run(() => api.copyPreviousMonthSchedules(store.employeeId, store.month, store.monthlySchedules.length > 0), true)
    copyVisible.value = false
    await load({ force: true })
    ElMessage.success(`已复制 ${result.copied} 天上月排班`)
  } catch (error) { copyError.value = errorText(error, '复制上月排班失败') }
}

watch([() => store.employeeId, () => store.month], () => { selectedDates.value = []; batchMode.value = false; void load() })
onMounted(() => { store.restoreMonthMode(); void load() })
</script>

<style scoped>
.schedule-summary{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px;padding:14px 16px;border:1px solid #dbe5f0;border-radius:8px;background:#f8fbff}.schedule-summary>div:first-child{display:flex;align-items:baseline;gap:10px}.schedule-summary strong{font-size:20px}.schedule-summary small{color:#64748b}.schedule-summary__quota{display:flex;align-items:center;gap:8px}.schedule-summary__quota :deep(.el-input-number){width:120px}.batch-tip{margin:12px 0 0;color:#2563eb;font-size:13px}.mobile-schedule-action-bar{align-items:center;justify-content:space-between;padding-bottom:max(10px,env(safe-area-inset-bottom))}.mobile-schedule-action-bar span{min-width:0;color:#334155;font-size:14px;font-weight:600}.mobile-schedule-action-bar :deep(.el-button){min-height:44px;margin:0}.schedule-page--mobile-batch :deep(.attendance-body){padding-bottom:76px}@media(max-width:900px){.schedule-summary{align-items:flex-start;flex-direction:column}.schedule-summary__quota{flex-wrap:wrap}.schedule-page--mobile .schedule-summary{padding:12px}.schedule-page--mobile .schedule-summary>div:first-child{flex-wrap:wrap}.schedule-page--mobile .schedule-summary small{width:100%;line-height:1.45}.schedule-page--mobile .schedule-summary__quota{width:100%}.schedule-page--mobile .schedule-summary__quota :deep(.el-input-number){width:min(120px,40vw)}}
</style>
