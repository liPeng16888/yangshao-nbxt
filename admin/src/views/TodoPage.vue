<template>
  <div class="page">
    <section class="panel">
      <div class="panel__header">
        <strong>待办事项</strong>
        <div class="filters">
          <el-select v-model="status" clearable placeholder="全部状态" style="width: 140px" @change="loadRequests">
            <el-option label="待审核" value="PENDING" />
            <el-option label="已同意" value="APPROVED" />
            <el-option label="已拒绝" value="REJECTED" />
          </el-select>
          <el-button type="primary" :loading="loading" @click="loadRequests">查询</el-button>
        </div>
      </div>
      <div class="panel__body todo-intro">删除申请集中在此处理；审批后会通知对应前端账号。</div>
      <el-table v-loading="loading" :data="rows" border>
        <el-table-column prop="createdAt" label="申请时间" width="190" />
        <el-table-column prop="name" label="名称" width="150" />
        <el-table-column prop="sourceLabel" label="类型" width="140" />
        <el-table-column prop="sourceSummary" label="删除内容" min-width="260" />
        <el-table-column prop="reason" label="删除理由" min-width="220" />
        <el-table-column label="状态" width="110">
          <template #default="{ row }"><el-tag :type="statusType(row.status)" effect="plain">{{ row.statusLabel }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="reviewRemark" label="审核备注" min-width="180">
          <template #default="{ row }">{{ row.reviewRemark || '无信息' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openDetail(row)">详情</el-button>
            <template v-if="row.status === 'PENDING'">
              <el-button size="small" type="primary" @click="approve(row)">同意</el-button>
              <el-button size="small" type="danger" @click="reject(row)">拒绝</el-button>
            </template>
            <span v-else class="muted">已处理</span>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="detailVisible" title="删除申请详情" width="680px">
      <el-descriptions v-if="detailRow" :column="1" border>
        <el-descriptions-item label="名称">{{ detailRow.name || '无信息' }}</el-descriptions-item>
        <el-descriptions-item label="类型">{{ detailRow.sourceLabel || '无信息' }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ detailRow.statusLabel || '无信息' }}</el-descriptions-item>
        <el-descriptions-item label="申请时间">{{ detailRow.createdAt || '无信息' }}</el-descriptions-item>
        <el-descriptions-item label="删除理由">{{ detailRow.reason || '无信息' }}</el-descriptions-item>
        <el-descriptions-item v-for="item in snapshotEntries(detailRow)" :key="item.key" :label="item.label">{{ item.value }}</el-descriptions-item>
        <el-descriptions-item label="审核备注">{{ detailRow.reviewRemark || '无信息' }}</el-descriptions-item>
        <el-descriptions-item label="审核时间">{{ detailRow.reviewedAt || '无信息' }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request } from '../api'

const rows = ref<any[]>([])
const status = ref('')
const loading = ref(false)
const detailVisible = ref(false)
const detailRow = ref<any | null>(null)

onMounted(() => { void loadRequests() })

async function loadRequests() {
  loading.value = true
  try {
    const params = status.value ? { status: status.value } : undefined
    rows.value = await request.get('/admin/finance/delete-requests', { params })
  } finally { loading.value = false }
}

function statusType(value: string) {
  if (value === 'APPROVED') return 'success'
  if (value === 'REJECTED') return 'danger'
  return 'warning'
}

function openDetail(row: any) { detailRow.value = row; detailVisible.value = true }

function snapshotEntries(row: any) {
  const snapshot = row?.sourceSnapshot && typeof row.sourceSnapshot === 'object' ? row.sourceSnapshot : {}
  return Object.entries(snapshot).map(([key, value]) => ({ key, label: snapshotLabel(key), value: snapshotValue(key, value) }))
}

function snapshotLabel(key: string) {
  return ({ paymentDate: '支付日期', item: '开支项目', amount: '金额', paymentMethod: '支付方式', screenshotUrls: '支付截图', remark: '备注' } as Record<string, string>)[key] || key
}

function snapshotValue(key: string, value: unknown) {
  if (key === 'amount') return `¥${Number(value || 0).toFixed(2)}`
  if (key === 'paymentMethod') return value === 'cash' ? '现金支付' : value === 'online' ? '线上支付' : '无信息'
  if (Array.isArray(value)) return value.length ? value.join('，') : '无信息'
  return value === null || value === undefined || value === '' ? '无信息' : String(value)
}

async function approve(row: any) {
  await ElMessageBox.confirm(`确认同意删除「${row.sourceSummary}」？同意后原记录会被删除，并通知前端账号。`, '同意删除申请', { confirmButtonText: '同意删除', cancelButtonText: '取消', type: 'warning' })
  await request.post(`/admin/finance/delete-requests/${row.id}/approve`)
  ElMessage.success('已同意删除申请，并发送前端提醒')
  await loadRequests()
}

async function reject(row: any) {
  const result = await ElMessageBox.prompt(`确认拒绝「${row.sourceSummary}」的删除申请？可填写拒绝原因。`, '拒绝删除申请', { confirmButtonText: '确认拒绝', cancelButtonText: '取消', inputType: 'textarea', inputPlaceholder: '可填写拒绝原因', type: 'warning' })
  await request.post(`/admin/finance/delete-requests/${row.id}/reject`, { reviewRemark: String(result.value || '').trim() })
  ElMessage.success('已拒绝删除申请，并发送前端提醒')
  await loadRequests()
}
</script>

<style scoped>
.todo-intro { padding-top: 0; color: #64748b; }
.muted { color: #94a3b8; }
</style>
