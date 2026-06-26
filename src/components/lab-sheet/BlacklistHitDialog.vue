<template>
  <el-dialog :model-value="visible" width="560px" class="blacklist-hit-dialog" title="黑名单命中提醒" @close="$emit('close')">
    <el-alert
      title="当前客户信息命中黑名单，请确认后再继续登记样品。"
      type="error"
      show-icon
      :closable="false"
    />

    <el-table :data="records" class="hit-table" border>
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
        <template #default="{ row }">{{ Number.isFinite(row.amount) ? row.amount : '无信息' }}</template>
      </el-table-column>
    </el-table>

    <template #footer>
      <el-button @click="$emit('close')">留在当前页</el-button>
      <el-button type="danger" @click="$emit('jump', records[0]?.id)">跳转至黑名单</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import type { BlacklistRecord } from '@/types/blacklist'

defineProps<{
  visible: boolean
  records: BlacklistRecord[]
}>()

defineEmits<{
  close: []
  jump: [id?: string]
}>()

function emptyText(value?: string) {
  return value?.trim() || '无信息'
}
</script>

<style scoped lang="scss">
.hit-table {
  margin-top: 14px;
}
</style>
