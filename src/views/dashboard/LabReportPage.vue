<template>
  <div class="page-stack lab-report-page" :class="{ 'lab-report-page--mobile': isMobileLayout }">
    <div
      v-if="saveErrors[activeSection]"
      class="template-save-error"
      data-testid="template-save-error"
      :data-section="activeSection"
      role="alert"
    >
      <span>模板自动保存失败，当前输入已保留，请重试。</span>
      <el-button data-testid="retry-template-save" @click="retryTemplateSave">重试保存</el-button>
    </div>

    <template v-if="isMobileLayout">
      <MobileLabReportTemplatePanel v-if="activeSection === 'image'" v-model="reportTemplate" />
      <MobileLabReportSmsTemplatePanel v-else v-model="smsTemplate" />
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

      <LabReportTemplatePanel v-if="activeSection === 'image'" v-model="reportTemplate" />
      <LabReportSmsTemplatePanel v-else v-model="smsTemplate" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LabReportSmsTemplatePanel from '@/components/lab-report/LabReportSmsTemplatePanel.vue'
import LabReportTemplatePanel from '@/components/lab-report/LabReportTemplatePanel.vue'
import MobileLabReportSmsTemplatePanel from '@/components/lab-report/MobileLabReportSmsTemplatePanel.vue'
import MobileLabReportTemplatePanel from '@/components/lab-report/MobileLabReportTemplatePanel.vue'
import { useMobileLayout } from '@/composables/useMobileLayout'
import type { LabReportSmsTemplate, LabReportTemplate } from '@/types/labReport'
import { loadLabReportSmsTemplate, loadLabReportTemplate, saveLabReportSmsTemplate, saveLabReportTemplate } from '@/utils/labReport'

type ReportSection = 'image' | 'sms'

const route = useRoute()
const router = useRouter()
const { isMobileLayout } = useMobileLayout()
const reportTemplate = ref<LabReportTemplate>(loadLabReportTemplate())
const smsTemplate = ref<LabReportSmsTemplate>(loadLabReportSmsTemplate())
const saveErrors = ref<Record<ReportSection, boolean>>({ image: false, sms: false })

const sections: { label: string; value: ReportSection; path: string }[] = [
  { label: '化验报告图片模板', value: 'image', path: '/lab-report/image-template' },
  { label: '化验短信生成模板', value: 'sms', path: '/lab-report/sms-template' }
]

const activeSection = computed<ReportSection>(() => {
  return route.path.endsWith('/sms-template') ? 'sms' : 'image'
})

watch(
  reportTemplate,
  (template) => {
    persistTemplate('image', template)
  },
  { deep: true }
)

watch(
  smsTemplate,
  (template) => {
    persistTemplate('sms', template)
  },
  { deep: true }
)

function persistTemplate(section: 'image', template: LabReportTemplate): void
function persistTemplate(section: 'sms', template: LabReportSmsTemplate): void
function persistTemplate(section: ReportSection, template: LabReportTemplate | LabReportSmsTemplate) {
  try {
    if (section === 'image') saveLabReportTemplate(template as LabReportTemplate)
    else saveLabReportSmsTemplate(template as LabReportSmsTemplate)
    saveErrors.value[section] = false
  } catch {
    saveErrors.value[section] = true
  }
}

function retryTemplateSave() {
  if (activeSection.value === 'image' && saveErrors.value.image) persistTemplate('image', reportTemplate.value)
  if (activeSection.value === 'sms' && saveErrors.value.sms) persistTemplate('sms', smsTemplate.value)
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
