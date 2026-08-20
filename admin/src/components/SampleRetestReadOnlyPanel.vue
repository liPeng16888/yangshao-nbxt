<template>
  <div class="sample-retest-readonly-panel">
    <article
      v-for="retest in retests"
      :key="retest.id"
      class="retest-card"
      :class="{ 'retest-card--void': retest.status === 'VOID' }"
    >
      <header class="retest-card__header">
        <strong>复样{{ retest.sequence }}</strong>
        <span class="retest-status">{{ retest.status === 'VOID' ? '已作废' : '有效' }}</span>
      </header>

      <div class="audit-grid">
        <span>创建时间：{{ formatTime(retest.createdAt) }}</span>
        <span>更新时间：{{ formatTime(retest.updatedAt) }}</span>
        <span>创建人：{{ retest.createdById }}</span>
        <span>更新人：{{ retest.updatedById }}</span>
        <span v-if="retest.voidedAt">作废时间：{{ formatTime(retest.voidedAt) }}</span>
        <span v-if="retest.voidedById">作废人：{{ retest.voidedById }}</span>
        <span v-if="retest.voidReason">作废原因：{{ retest.voidReason }}</span>
      </div>

      <p v-if="retest.sensitiveFieldsHidden" class="protected-notice">受保护数据</p>
      <div class="data-sections">
        <section>
          <h4>检测输入</h4>
          <dl>
            <div v-for="entry in entries(retest.inputs)" :key="entry[0]">
              <dt>{{ fieldLabel(entry[0]) }}</dt>
              <dd>{{ formatValue(entry[1]) }}</dd>
            </div>
          </dl>
        </section>
        <section>
          <h4>计算结果</h4>
          <dl>
            <div v-for="entry in entries(retest.results)" :key="entry[0]">
              <dt>{{ resultLabel(entry[0]) }}</dt>
              <dd>{{ formatValue(entry[1]) }}</dd>
            </div>
          </dl>
        </section>
        <section>
          <h4>参数快照</h4>
          <dl>
            <div v-for="entry in entries(retest.parameterSnapshot)" :key="entry[0]">
              <dt>{{ parameterLabel(entry[0]) }}</dt>
              <dd>{{ formatValue(entry[1]) }}</dd>
            </div>
          </dl>
        </section>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import dayjs from 'dayjs'
import type {
  AdminSampleRetest,
  AdminSampleRetestInput,
  AdminSampleRetestParameterSnapshot,
  AdminSampleRetestResult
} from '../types'

defineProps<{ retests: AdminSampleRetest[] }>()

const inputLabels: Record<string, string> = {
  ironRaw: '铁原始值', siliconRaw: '硅原始值', siliconAdjust: '硅调整数',
  aluminumRaw: '铝原始值', aluminumAdjust: '铝调整数', sulfur: '硫', densityRaw: '比重原始值',
  whiteness: '白度', calciumRaw: '钙原始值', magnesiumRaw: '镁原始值', carbon: '碳', titaniumRaw: '钛原始值',
  waterSample: '样', bottleWater: '瓶+水', bottleWaterSample: '瓶+水+样', moisture: '水份',
  crucible: '坩埚', sampleWeight: '样重', burnedCrucibleSample: '烧坩埚+样'
}

const resultLabels: Record<string, string> = {
  iron: '铁', silicon: '硅', aluminum: '铝', aluminumSiliconRatio: '铝硅比', total: '合量',
  density: '比重', calcium: '钙', magnesium: '镁', titanium: '钛', bottleDensity: '比重(瓶法)', burnLoss: '灼减'
}

const parameterLabels: Record<string, string> = {
  ironBlank: '铁空白', ironFactor: '铁系数', siliconBlank: '硅空白', siliconFactor: '硅系数',
  aluminumFactor1: '铝系数1', aluminumFactor2: '铝系数2', calciumFactor: '钙系数',
  magnesiumFactor: '镁系数', titaniumFactor: '钛系数'
}

function entries(values: AdminSampleRetestInput | AdminSampleRetestResult | AdminSampleRetestParameterSnapshot) {
  return Object.entries(values) as Array<[string, number | null]>
}

function fieldLabel(field: string) {
  return inputLabels[field] || field
}

function resultLabel(field: string) {
  return resultLabels[field] || field
}

function parameterLabel(field: string) {
  return parameterLabels[field] || field
}

function formatValue(value: number | null) {
  return value === null ? '—' : String(value)
}

function formatTime(value: string) {
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss')
}
</script>

<style scoped>
.sample-retest-readonly-panel {
  display: grid;
  gap: 12px;
  padding: 12px 18px;
  background: #f7f9fc;
}

.retest-card {
  border: 1px solid #d9e2ef;
  border-radius: 8px;
  padding: 14px;
  background: #fff;
}

.retest-card--void {
  color: #77808c;
  background: #f2f3f5;
}

.retest-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.retest-status {
  border-radius: 999px;
  padding: 2px 9px;
  background: #eef6ff;
}

.audit-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin-bottom: 12px;
  font-size: 12px;
}

.protected-notice {
  color: #b42318;
}

.data-sections {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

h4 {
  margin: 0 0 6px;
  font-size: 13px;
}

dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 10px;
  margin: 0;
}

dl > div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px dashed #dfe3e8;
}

dt,
dd {
  margin: 0;
}

@media (max-width: 900px) {
  .data-sections {
    grid-template-columns: 1fr;
  }
}
</style>
