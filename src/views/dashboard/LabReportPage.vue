<template>
  <div class="page-stack lab-report-page">
    <div class="report-section-tabs" role="tablist" aria-label="化验报告模板设置">
      <button
        v-for="section in sections"
        :key="section.value"
        type="button"
        :class="{ 'is-active': activeSection === section.value }"
        @click="switchSection(section.value)"
      >
        {{ section.label }}
      </button>
    </div>

    <div class="preference-save-state">
      <el-tag :type="saveStatusType" effect="plain">{{ saveStatusText }}</el-tag>
      <template v-if="activeStatus === 'conflict'">
        <el-button size="small" @click="resolveActiveConflict('server')">加载服务器内容</el-button>
        <el-button size="small" type="danger" @click="resolveActiveConflict('overwrite')">用本机内容覆盖</el-button>
      </template>
    </div>

    <LabReportTemplatePanel
      v-if="activeSection === 'image'"
      :model-value="reportTemplate"
      @update:model-value="updateReportTemplate"
    />
    <LabReportSmsTemplatePanel
      v-else
      :model-value="smsTemplate"
      @update:model-value="updateSmsTemplate"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LabReportSmsTemplatePanel from '@/components/lab-report/LabReportSmsTemplatePanel.vue'
import LabReportTemplatePanel from '@/components/lab-report/LabReportTemplatePanel.vue'
import { useAuthStore } from '@/stores/auth'
import { frontendPreferenceOwnerId, useFrontendPreferencesStore } from '@/stores/frontendPreferences'
import type { FrontendPreferenceSection, FrontendPreferenceStatus } from '@/types/frontendPreference'
import type { LabReportSmsTemplate, LabReportTemplate } from '@/types/labReport'
import { defaultLabReportSmsTemplate, defaultLabReportTemplate } from '@/utils/labReport'

type ReportSection = 'image' | 'sms'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const preferences = useFrontendPreferencesStore()
const reportTemplate = ref<LabReportTemplate>(preferences.value('LAB_REPORT_TEMPLATE', defaultLabReportTemplate))
const smsTemplate = ref<LabReportSmsTemplate>(preferences.value('LAB_REPORT_SMS_TEMPLATE', defaultLabReportSmsTemplate))
const saveTimers: Partial<Record<FrontendPreferenceSection, number>> = {}
const savesInFlight: Partial<Record<FrontendPreferenceSection, number>> = {}

const sections: { label: string; value: ReportSection; path: string }[] = [
  { label: '化验报告图片模板', value: 'image', path: '/lab-report/image-template' },
  { label: '化验短信生成模板', value: 'sms', path: '/lab-report/sms-template' }
]

const activeSection = computed<ReportSection>(() => {
  return route.path.endsWith('/sms-template') ? 'sms' : 'image'
})

const activePreferenceSection = computed<FrontendPreferenceSection>(() => (
  activeSection.value === 'image' ? 'LAB_REPORT_TEMPLATE' : 'LAB_REPORT_SMS_TEMPLATE'
))
const activeStatus = computed(() => preferences.statuses[activePreferenceSection.value])
const saveStatusText = computed(() => statusText(activeStatus.value))
const saveStatusType = computed(() => {
  if (activeStatus.value === 'conflict' || activeStatus.value === 'error') return 'danger'
  if (activeStatus.value === 'queued') return 'warning'
  if (activeStatus.value === 'saving' || activeStatus.value === 'loading') return 'info'
  return 'success'
})

watch(
  () => preferences.value('LAB_REPORT_TEMPLATE', defaultLabReportTemplate),
  (template) => {
    if (hasNewerEditDuringSave('LAB_REPORT_TEMPLATE')) return
    cancelSave('LAB_REPORT_TEMPLATE')
    reportTemplate.value = cloneValue(template)
  },
  { deep: true, immediate: true }
)

watch(
  () => preferences.value('LAB_REPORT_SMS_TEMPLATE', defaultLabReportSmsTemplate),
  (template) => {
    if (hasNewerEditDuringSave('LAB_REPORT_SMS_TEMPLATE')) return
    cancelSave('LAB_REPORT_SMS_TEMPLATE')
    smsTemplate.value = cloneValue(template)
  },
  { deep: true, immediate: true }
)

watch(
  () => frontendPreferenceOwnerId(authStore.user),
  () => {
    cancelAllSaves()
    reportTemplate.value = preferences.value('LAB_REPORT_TEMPLATE', defaultLabReportTemplate)
    smsTemplate.value = preferences.value('LAB_REPORT_SMS_TEMPLATE', defaultLabReportSmsTemplate)
  },
  { flush: 'sync' }
)

onBeforeUnmount(cancelAllSaves)

function updateReportTemplate(template: LabReportTemplate) {
  reportTemplate.value = cloneValue(template)
  scheduleSave('LAB_REPORT_TEMPLATE', template)
}

function updateSmsTemplate(template: LabReportSmsTemplate) {
  smsTemplate.value = cloneValue(template)
  scheduleSave('LAB_REPORT_SMS_TEMPLATE', template)
}

function scheduleSave(section: FrontendPreferenceSection, value: unknown) {
  cancelSave(section)
  const ownerId = frontendPreferenceOwnerId(authStore.user)
  const submittedValue = cloneValue(value)
  saveTimers[section] = window.setTimeout(() => {
    delete saveTimers[section]
    if (!ownerId || frontendPreferenceOwnerId(authStore.user) !== ownerId) return
    savesInFlight[section] = (savesInFlight[section] ?? 0) + 1
    void preferences.save(section, submittedValue).finally(async () => {
      await nextTick()
      const remaining = (savesInFlight[section] ?? 1) - 1
      if (remaining > 0) savesInFlight[section] = remaining
      else delete savesInFlight[section]
    })
  }, 500)
}

function hasNewerEditDuringSave(section: FrontendPreferenceSection) {
  return (savesInFlight[section] ?? 0) > 0 && saveTimers[section] !== undefined
}

async function resolveActiveConflict(strategy: 'server' | 'overwrite') {
  const section = activePreferenceSection.value
  cancelSave(section)
  await preferences.resolveConflict(section, strategy)
}

function cancelSave(section: FrontendPreferenceSection) {
  const timer = saveTimers[section]
  if (timer !== undefined) window.clearTimeout(timer)
  delete saveTimers[section]
}

function cancelAllSaves() {
  for (const section of Object.keys(saveTimers) as FrontendPreferenceSection[]) cancelSave(section)
}

function statusText(status: FrontendPreferenceStatus) {
  if (status === 'saving') return '保存中'
  if (status === 'queued') return '离线待同步'
  if (status === 'conflict') return '有版本冲突'
  if (status === 'loading') return '正在加载'
  if (status === 'error') return '保存失败'
  return '已保存'
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function switchSection(section: ReportSection) {
  const target = sections.find((item) => item.value === section)
  if (!target || route.path === target.path) return
  router.push(target.path)
}
</script>

<style scoped lang="scss">
.lab-report-page {
  min-width: 0;
}

.report-section-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 4px 0;

  button {
    min-height: 34px;
    padding: 0 14px;
    color: #475569;
    background: #ffffff;
    border: 1px solid #d8e1eb;
    border-radius: 8px;
    cursor: pointer;

    &:hover {
      color: #1d4ed8;
      border-color: #93c5fd;
    }

    &.is-active {
      color: #ffffff;
      background: #2563eb;
      border-color: #2563eb;
    }
  }
}

.preference-save-state {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
