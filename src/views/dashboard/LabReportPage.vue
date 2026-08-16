<template>
  <div class="page-stack lab-report-page" :class="{ 'lab-report-page--mobile': isMobileLayout }">
    <div
      v-if="activeStatus === 'error'"
      class="template-save-error"
      data-testid="template-save-error"
      :data-section="activeSection"
      role="alert"
    >
      <span>模板自动保存失败，当前输入已保留，请重试。</span>
      <el-button data-testid="retry-template-save" @click="retryTemplateSave">重试保存</el-button>
    </div>

    <div class="preference-save-state">
      <el-tag :type="saveStatusType" effect="plain">{{ saveStatusText }}</el-tag>
      <template v-if="activeStatus === 'conflict'">
        <el-button size="small" @click="resolveActiveConflict('server')">加载服务器内容</el-button>
        <el-button size="small" type="danger" @click="resolveActiveConflict('overwrite')">用本机内容覆盖</el-button>
      </template>
    </div>

    <template v-if="isMobileLayout">
      <MobileLabReportTemplatePanel
        v-if="activeSection === 'image'"
        :model-value="reportTemplate"
        @update:model-value="updateReportTemplate"
      />
      <MobileLabReportSmsTemplatePanel
        v-else
        :model-value="smsTemplate"
        @update:model-value="updateSmsTemplate"
      />
    </template>

    <template v-else>
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
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LabReportSmsTemplatePanel from '@/components/lab-report/LabReportSmsTemplatePanel.vue'
import LabReportTemplatePanel from '@/components/lab-report/LabReportTemplatePanel.vue'
import MobileLabReportSmsTemplatePanel from '@/components/lab-report/MobileLabReportSmsTemplatePanel.vue'
import MobileLabReportTemplatePanel from '@/components/lab-report/MobileLabReportTemplatePanel.vue'
import { useMobileLayout } from '@/composables/useMobileLayout'
import { useAuthStore } from '@/stores/auth'
import {
  frontendPreferenceActorKey,
  frontendPreferenceOwnerId,
  useFrontendPreferencesStore
} from '@/stores/frontendPreferences'
import type { FrontendPreferenceSection, FrontendPreferenceStatus } from '@/types/frontendPreference'
import type { LabReportSmsTemplate, LabReportTemplate } from '@/types/labReport'
import { defaultLabReportSmsTemplate, defaultLabReportTemplate } from '@/utils/labReport'

type ReportSection = 'image' | 'sms'
type TemplatePreferenceSection = 'LAB_REPORT_TEMPLATE' | 'LAB_REPORT_SMS_TEMPLATE'

const route = useRoute()
const router = useRouter()
const { isMobileLayout } = useMobileLayout()
const authStore = useAuthStore()
const preferences = useFrontendPreferencesStore()
const reportTemplate = ref<LabReportTemplate>(preferences.value('LAB_REPORT_TEMPLATE', defaultLabReportTemplate))
const smsTemplate = ref<LabReportSmsTemplate>(preferences.value('LAB_REPORT_SMS_TEMPLATE', defaultLabReportSmsTemplate))
const saveTimers: Partial<Record<FrontendPreferenceSection, number>> = {}
const editRevisions: Partial<Record<FrontendPreferenceSection, number>> = {}
const localDirty = reactive<Partial<Record<FrontendPreferenceSection, boolean>>>({})
const localErrorRevisions = reactive<Partial<Record<FrontendPreferenceSection, number>>>({})
let ownerGeneration = 0
let editSessions = createEditSessions()

const sections: { label: string; value: ReportSection; path: string }[] = [
  { label: '化验报告图片模板', value: 'image', path: '/lab-report/image-template' },
  { label: '化验短信生成模板', value: 'sms', path: '/lab-report/sms-template' }
]

const activeSection = computed<ReportSection>(() => {
  return route.path.endsWith('/sms-template') ? 'sms' : 'image'
})

const activePreferenceSection = computed<TemplatePreferenceSection>(() => (
  activeSection.value === 'image' ? 'LAB_REPORT_TEMPLATE' : 'LAB_REPORT_SMS_TEMPLATE'
))
const activeStatus = computed(() => {
  const section = activePreferenceSection.value
  if (preferences.statuses[section] === 'conflict') return 'conflict'
  if (!localDirty[section]) return preferences.statuses[section]
  return localErrorRevisions[section] === editRevisions[section] ? 'error' : 'saving'
})
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
    if (localDirty.LAB_REPORT_TEMPLATE) return
    cancelSave('LAB_REPORT_TEMPLATE')
    reportTemplate.value = cloneValue(template)
  },
  { deep: true, immediate: true }
)

watch(
  () => preferences.value('LAB_REPORT_SMS_TEMPLATE', defaultLabReportSmsTemplate),
  (template) => {
    if (localDirty.LAB_REPORT_SMS_TEMPLATE) return
    cancelSave('LAB_REPORT_SMS_TEMPLATE')
    smsTemplate.value = cloneValue(template)
  },
  { deep: true, immediate: true }
)

watch(
  () => frontendPreferenceActorKey(authStore.user),
  () => {
    ownerGeneration += 1
    cancelAllSaves()
    unregisterEditSessions()
    editSessions = createEditSessions()
    for (const section of ['LAB_REPORT_TEMPLATE', 'LAB_REPORT_SMS_TEMPLATE'] as const) {
      editRevisions[section] = (editRevisions[section] ?? 0) + 1
      localDirty[section] = false
      delete localErrorRevisions[section]
      editSessions[section].update({ dirty: false })
    }
    reportTemplate.value = preferences.value('LAB_REPORT_TEMPLATE', defaultLabReportTemplate)
    smsTemplate.value = preferences.value('LAB_REPORT_SMS_TEMPLATE', defaultLabReportSmsTemplate)
  },
  { flush: 'sync' }
)

watch(
  () => [
    preferences.statuses.LAB_REPORT_TEMPLATE,
    preferences.statuses.LAB_REPORT_SMS_TEMPLATE
  ] as const,
  (statuses) => {
    const sections = ['LAB_REPORT_TEMPLATE', 'LAB_REPORT_SMS_TEMPLATE'] as const
    statuses.forEach((status, index) => {
      if (status !== 'conflict') return
      const section = sections[index]
      cancelSave(section)
    })
  },
  { flush: 'sync' }
)

onBeforeUnmount(() => {
  cancelAllSaves()
  unregisterEditSessions()
})

function updateReportTemplate(template: LabReportTemplate) {
  reportTemplate.value = cloneValue(template)
  scheduleSave('LAB_REPORT_TEMPLATE', template, nextEditRevision('LAB_REPORT_TEMPLATE', template))
}

function updateSmsTemplate(template: LabReportSmsTemplate) {
  smsTemplate.value = cloneValue(template)
  scheduleSave('LAB_REPORT_SMS_TEMPLATE', template, nextEditRevision('LAB_REPORT_SMS_TEMPLATE', template))
}

function nextEditRevision(section: TemplatePreferenceSection, value: unknown) {
  const revision = (editRevisions[section] ?? 0) + 1
  editRevisions[section] = revision
  localDirty[section] = true
  editSessions[section].update({ dirty: true, value })
  delete localErrorRevisions[section]
  return revision
}

function scheduleSave(section: TemplatePreferenceSection, value: unknown, revision: number) {
  cancelSave(section)
  const ownerId = frontendPreferenceOwnerId(authStore.user)
  const generation = ownerGeneration
  const submittedValue = cloneValue(value)
  saveTimers[section] = window.setTimeout(() => {
    delete saveTimers[section]
    if (!isCurrentRevision(ownerId, generation, section, revision)) return
    void saveRevision(section, submittedValue, ownerId, generation, revision)
  }, 500)
}

async function saveRevision(
  section: TemplatePreferenceSection,
  value: unknown,
  ownerId: string,
  generation: number,
  revision: number
) {
  const result = await preferences.save(section, value)
  settleRevision(section, ownerId, generation, revision, result)
}

async function resolveActiveConflict(strategy: 'server' | 'overwrite') {
  const section = activePreferenceSection.value
  cancelSave(section)
  const ownerId = frontendPreferenceOwnerId(authStore.user)
  const generation = ownerGeneration
  const revision = editRevisions[section] ?? 0
  const result = await preferences.resolveConflict(section, strategy)
  settleRevision(section, ownerId, generation, revision, result)
}

function settleRevision(
  section: TemplatePreferenceSection,
  ownerId: string,
  generation: number,
  revision: number,
  result: 'saved' | 'queued' | 'conflict' | 'error'
) {
  if (!isCurrentRevision(ownerId, generation, section, revision)) return
  if (result === 'error') {
    localErrorRevisions[section] = revision
    return
  }
  localDirty[section] = false
  editSessions[section].update({ dirty: false })
  delete localErrorRevisions[section]
  if (section === 'LAB_REPORT_TEMPLATE') {
    reportTemplate.value = preferences.value(section, defaultLabReportTemplate)
  } else if (section === 'LAB_REPORT_SMS_TEMPLATE') {
    smsTemplate.value = preferences.value(section, defaultLabReportSmsTemplate)
  }
}

function isCurrentRevision(
  ownerId: string,
  generation: number,
  section: TemplatePreferenceSection,
  revision: number
) {
  return Boolean(ownerId) &&
    generation === ownerGeneration &&
    ownerId === frontendPreferenceOwnerId(authStore.user) &&
    revision === (editRevisions[section] ?? 0)
}

function cancelSave(section: FrontendPreferenceSection) {
  const timer = saveTimers[section]
  if (timer !== undefined) window.clearTimeout(timer)
  delete saveTimers[section]
}

function cancelAllSaves() {
  for (const section of Object.keys(saveTimers) as FrontendPreferenceSection[]) cancelSave(section)
}

function createEditSessions() {
  return {
    LAB_REPORT_TEMPLATE: preferences.registerEditSession('LAB_REPORT_TEMPLATE'),
    LAB_REPORT_SMS_TEMPLATE: preferences.registerEditSession('LAB_REPORT_SMS_TEMPLATE')
  }
}

function unregisterEditSessions() {
  editSessions.LAB_REPORT_TEMPLATE.unregister()
  editSessions.LAB_REPORT_SMS_TEMPLATE.unregister()
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

function retryTemplateSave() {
  if (activeStatus.value !== 'error') return
  if (activeSection.value === 'image') updateReportTemplate(reportTemplate.value)
  else updateSmsTemplate(smsTemplate.value)
}

function switchSection(section: ReportSection) {
  const target = sections.find((item) => item.value === section)
  if (!target || route.path === target.path) return
  void router.push(target.path)
}
</script>

<style scoped lang="scss">
.lab-report-page {
  min-width: 0;
  max-width: 100%;
  overflow-x: clip;
}

.template-save-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  color: #991b1b;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
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

.lab-report-page--mobile {
  padding-bottom: calc(20px + var(--mobile-page-action-bottom, env(safe-area-inset-bottom)));

  .template-save-error {
    align-items: stretch;
    flex-direction: column;
  }

  .template-save-error :deep(.el-button) {
    min-height: 44px;
    margin: 0;
  }
}
</style>
