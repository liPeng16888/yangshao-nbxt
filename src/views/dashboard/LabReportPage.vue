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

    <LabReportTemplatePanel v-if="activeSection === 'image'" v-model="reportTemplate" />
    <LabReportSmsTemplatePanel v-else v-model="smsTemplate" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LabReportSmsTemplatePanel from '@/components/lab-report/LabReportSmsTemplatePanel.vue'
import LabReportTemplatePanel from '@/components/lab-report/LabReportTemplatePanel.vue'
import type { LabReportSmsTemplate, LabReportTemplate } from '@/types/labReport'
import { loadLabReportSmsTemplate, loadLabReportTemplate, saveLabReportSmsTemplate, saveLabReportTemplate } from '@/utils/labReport'

type ReportSection = 'image' | 'sms'

const route = useRoute()
const router = useRouter()
const reportTemplate = ref<LabReportTemplate>(loadLabReportTemplate())
const smsTemplate = ref<LabReportSmsTemplate>(loadLabReportSmsTemplate())

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
    saveLabReportTemplate(template)
  },
  { deep: true }
)

watch(
  smsTemplate,
  (template) => {
    saveLabReportSmsTemplate(template)
  },
  { deep: true }
)

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
</style>
