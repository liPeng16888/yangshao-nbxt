<template>
  <section class="attendance-overview-panel" data-testid="attendance-overview-panel">
    <div v-if="overview" class="overview-grid" :class="{ 'overview-grid--mobile': isMobileLayout }" data-testid="attendance-overview-cards">
      <article v-for="card in cards" :key="card.label" data-testid="attendance-overview-card"><span>{{ card.label }}</span><strong>{{ card.value }}</strong></article>
    </div>
    <el-divider content-position="left">待处理问题</el-divider>
    <div data-testid="attendance-overview-issues">
      <el-empty v-if="!displayedIssues.length" description="当前没有异常" :image-size="64" />
      <template v-else-if="isMobileLayout">
        <article v-for="issue in displayedIssues" :key="`mobile-${issue}`" class="issue-card" data-testid="attendance-issue-card">
          <strong>需要关注</strong><p>{{ issue }}</p>
        </article>
      </template>
      <template v-else>
        <el-alert v-for="issue in displayedIssues" :key="`desktop-${issue}`" :title="issue" type="warning" show-icon :closable="false" class="issue" />
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useMobileLayout } from '@/composables/useMobileLayout'
import type { AttendanceOverview } from '@/types/employeeAttendance'

const props = defineProps<{ overview: AttendanceOverview | null }>()
const { isMobileLayout } = useMobileLayout()
const displayedIssues = computed(() => props.overview?.issues.length
  ? props.overview.issues
  : props.overview?.issueCount
    ? [`当前有 ${props.overview.issueCount} 项考勤或工资问题，请进入工资统计查看详情`]
    : [])
const cards = computed(() => props.overview ? [
  { label: '在职员工', value: props.overview.activeEmployees },
  { label: '今日出勤', value: props.overview.todayPresent },
  { label: '今日请假', value: props.overview.todayOnLeave },
  { label: '今日缺勤', value: props.overview.todayAbsent },
  { label: '本月加班总时长', value: `${props.overview.overtimeHours} 小时` },
  { label: '待审请假', value: props.overview.pendingLeaves },
  { label: '预计应发', value: `¥${props.overview.projectedPayroll.toFixed(2)}` },
  { label: '异常数', value: props.overview.issueCount }
] : [])
</script>

<style scoped>
.attendance-overview-panel{margin-top:22px}.overview-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.overview-grid article{min-width:0;padding:16px;border:1px solid var(--ui-line);border-radius:7px;background:var(--ui-surface-subtle)}.overview-grid span{display:block;color:var(--ui-text-muted);font-size:13px;overflow-wrap:anywhere}.overview-grid strong{display:block;margin-top:8px;font-size:23px;overflow-wrap:anywhere}.issue{margin:8px 0}.issue-card{margin:8px 0;padding:12px;color:#7c2d12;background:var(--ui-warning-soft);border:1px solid var(--ui-warning-line);border-radius:10px}.issue-card strong{font-size:13px}.issue-card p{margin:5px 0 0;font-size:13px;line-height:1.55;overflow-wrap:anywhere}.overview-grid--mobile{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.overview-grid--mobile article{padding:12px}.overview-grid--mobile strong{font-size:18px}@media(max-width:1000px){.overview-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
