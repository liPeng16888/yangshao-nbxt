<template>
  <section class="panel blacklist-table">
    <div class="panel__header">
      <h2>黑名单列表</h2>
      <div class="table-search">
        <el-input :model-value="keyword" placeholder="电话号、微信号、昵称、其他信息" clearable @update:model-value="emit('search', String($event))" />
        <el-button :icon="Search" @click="emit('search', keyword)">搜索</el-button>
      </div>
    </div>
    <el-table
      ref="tableRef"
      :data="records"
      border
      v-loading="loading"
      :row-class-name="rowClassName"
    >
      <el-table-column prop="uploadedAt" label="上传日期" min-width="150">
        <template #default="{ row }">{{ formatDateTime(row.uploadedAt) }}</template>
      </el-table-column>
      <el-table-column prop="uploadedBy" label="上传用户" width="110">
        <template #default="{ row }">{{ emptyText(row.uploadedBy) }}</template>
      </el-table-column>
      <el-table-column prop="phone" label="电话号" min-width="120">
        <template #default="{ row }">{{ emptyText(row.phone) }}</template>
      </el-table-column>
      <el-table-column prop="wechat" label="微信号" min-width="120">
        <template #default="{ row }">{{ emptyText(row.wechat) }}</template>
      </el-table-column>
      <el-table-column prop="wechatNickname" label="微信昵称" min-width="120">
        <template #default="{ row }">{{ emptyText(row.wechatNickname) }}</template>
      </el-table-column>
      <el-table-column prop="amount" label="金额" width="100">
        <template #default="{ row }">{{ Number.isFinite(row.amount) ? `¥${row.amount.toFixed(2)}` : '无信息' }}</template>
      </el-table-column>
      <el-table-column label="图片" min-width="120">
        <template #default="{ row }"><BlacklistImagePreview :images="row.images" /></template>
      </el-table-column>
      <el-table-column prop="other" label="其他" min-width="150">
        <template #default="{ row }">{{ emptyText(row.other) }}</template>
      </el-table-column>
      <el-table-column prop="note" label="备注" min-width="180">
        <template #default="{ row }">{{ emptyText(row.note) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <div v-if="canManage(row)" class="table-actions">
            <el-button
              type="primary"
              text
              :icon="EditPen"
              :loading="updatingId === row.id"
              @click="emit('supplement', row)"
            >
              补充信息
            </el-button>
            <el-button
              type="danger"
              text
              :icon="Delete"
              :loading="deletingId === row.id"
              @click="emit('delete', row.id)"
            >
              删除
            </el-button>
          </div>
          <span v-else class="readonly-action">仅查看</span>
        </template>
      </el-table-column>
    </el-table>
  </section>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { Delete, EditPen, Search } from '@element-plus/icons-vue'
import type { BlacklistRecord } from '@/types/blacklist'
import { formatDateTime } from '@/utils/date'
import BlacklistImagePreview from './BlacklistImagePreview.vue'

const props = defineProps<{
  records: BlacklistRecord[]
  keyword: string
  loading?: boolean
  highlightId?: string
  currentUsername: string
  deletingId?: string
  updatingId?: string
}>()

const emit = defineEmits<{
  search: [keyword: string]
  delete: [id: string]
  supplement: [row: BlacklistRecord]
}>()

const tableRef = ref()

watch(
  () => [props.highlightId, props.records.length],
  async () => {
    if (!props.highlightId) return
    await nextTick()
    const row = document.querySelector('.blacklist-row--highlight')
    row?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  },
  { immediate: true }
)

function rowClassName({ row }: { row: BlacklistRecord }) {
  return row.id === props.highlightId ? 'blacklist-row--highlight' : ''
}

function emptyText(value?: string) {
  return value?.trim() || '无信息'
}

function canManage(row: BlacklistRecord) {
  return Boolean(props.currentUsername && row.uploadedBy === props.currentUsername)
}
</script>

<style scoped lang="scss">
.table-search {
  display: flex;
  gap: 8px;
  width: min(480px, 100%);
}

:deep(.blacklist-row--highlight td) {
  background: #ffe9e8 !important;
}

.table-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.readonly-action {
  color: #94a3b8;
}
</style>
