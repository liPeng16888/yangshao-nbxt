<template>
  <section class="attendance-overview-panel" data-testid="attendance-overview-panel">
    <div v-if="overview" class="overview-grid" data-testid="attendance-overview-cards">
      <article v-for="card in cards" :key="card.label"><span>{{ card.label }}</span><strong>{{ card.value }}</strong></article>
    </div>
    <el-divider content-position="left">待处理问题</el-divider>
    <div data-testid="attendance-overview-issues">
      <el-empty v-if="!displayedIssues.length" description="当前没有异常" :image-size="64" />
      <el-alert v-for="issue in displayedIssues" v-else :key="issue" :title="issue" type="warning" show-icon :closable="false" class="issue" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AttendanceOverview } from '@/types/employeeAttendance'

const props = defineProps<{ overview: AttendanceOverview | null }>()
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
.attendance-overview-panel{margin-top:22px}.overview-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.overview-grid article{padding:16px;border:1px solid #dbe5f0;border-radius:7px;background:#f8fbff}.overview-grid span{display:block;color:#64748b;font-size:13px}.overview-grid strong{display:block;margin-top:8px;font-size:23px}.issue{margin:8px 0}@media(max-width:1000px){.overview-grid{grid-template-columns:repeat(2,1fr)}}
</style>
