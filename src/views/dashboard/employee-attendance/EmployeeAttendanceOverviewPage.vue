<template>
  <PageShell title="考勤概览" description="员工出勤、加班、待办与工资异常的当月概览。" :show-employee="false" @refresh="load">
    <div v-if="store.overview" class="overview-grid">
      <article v-for="card in cards" :key="card.label"><span>{{ card.label }}</span><strong>{{ card.value }}</strong></article>
    </div>
    <el-divider content-position="left">待处理问题</el-divider>
    <el-empty v-if="!displayedIssues.length" description="当前没有异常" :image-size="64" />
    <el-alert v-for="issue in displayedIssues" v-else :key="issue" :title="issue" type="warning" show-icon :closable="false" class="issue" />
  </PageShell>
</template>
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import PageShell from './EmployeeAttendancePageShell.vue'
import { useEmployeeAttendanceStore } from '@/stores/employeeAttendance'
const store = useEmployeeAttendanceStore()
const displayedIssues = computed(() => store.overview?.issues.length ? store.overview.issues : store.overview?.issueCount ? [`当前有 ${store.overview.issueCount} 项考勤或工资问题，请进入工资统计查看详情`] : [])
const cards = computed(() => { const data = store.overview; return data ? [
  { label: '在职员工', value: data.activeEmployees }, { label: '今日出勤', value: data.todayPresent },
  { label: '今日请假', value: data.todayOnLeave }, { label: '今日缺勤', value: data.todayAbsent },
  { label: '本月加班总时长', value: `${data.overtimeHours} 小时` }, { label: '待审请假', value: data.pendingLeaves },
  { label: '预计应发', value: `¥${data.projectedPayroll.toFixed(2)}` }, { label: '异常数', value: data.issueCount }
] : [] })
async function load() { await store.loadOverview().catch(() => undefined) }
onMounted(load)
</script>
<style scoped>.overview-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.overview-grid article{padding:16px;border:1px solid #dbe5f0;border-radius:7px;background:#f8fbff}.overview-grid span{display:block;color:#64748b;font-size:13px}.overview-grid strong{display:block;margin-top:8px;font-size:23px}.issue{margin:8px 0}@media(max-width:1000px){.overview-grid{grid-template-columns:repeat(2,1fr)}}</style>
