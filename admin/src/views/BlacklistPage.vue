<template>
  <div class="page">
    <section class="panel">
      <div class="panel__header">
        <strong>客户黑名单</strong>
        <div class="filters">
          <el-input v-model="keyword" placeholder="搜索客户、电话、微信、备注" clearable style="width: 320px" @keyup.enter="loadData" />
          <el-button type="primary" :loading="loading" @click="loadData">查询</el-button>
        </div>
      </div>
      <el-table :data="rows" border>
        <el-table-column prop="uploadedAt" label="上传时间" width="190" />
        <el-table-column prop="uploadedBy" label="上传账号" width="150" />
        <el-table-column prop="phone" label="电话" width="140" />
        <el-table-column prop="wechat" label="微信号" width="160" />
        <el-table-column prop="wechatNickname" label="微信昵称" width="160" />
        <el-table-column align="right" label="金额" width="110"><template #default="{ row }">{{ row.amount === null ? '无信息' : `¥${money(row.amount)}` }}</template></el-table-column>
        <el-table-column prop="other" label="其他信息" min-width="180" />
        <el-table-column prop="note" label="备注" min-width="180" />
        <el-table-column label="图片" min-width="180">
          <template #default="{ row }">
            <el-image v-for="url in row.images" :key="url" :src="url" :preview-src-list="row.images" fit="cover" class="thumb" />
            <span v-if="!row.images?.length">无信息</span>
          </template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { request } from '../api'

const keyword = ref('')
const rows = ref<any[]>([])
const loading = ref(false)

onMounted(loadData)

async function loadData() {
  loading.value = true
  try {
    rows.value = await request.get('/admin/blacklist', { params: { keyword: keyword.value } })
  } finally {
    loading.value = false
  }
}

function money(value: unknown) {
  const numeric = Number(value || 0)
  return Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00'
}
</script>

<style scoped>
.thumb {
  width: 48px;
  height: 48px;
  margin-right: 6px;
  border-radius: 4px;
}
</style>
