<template>
  <div class="page">
    <section class="panel">
      <div class="panel__body">
        <el-tabs v-model="active" @tab-change="loadActive">
          <el-tab-pane label="客户账号" name="frontend" />
          <el-tab-pane label="后台子账号" name="sub" />
        </el-tabs>
      </div>
    </section>

    <section v-if="active === 'frontend'" class="panel">
      <div class="panel__header">
        <strong>客户账号</strong>
        <el-button type="primary" @click="inviteVisible = true">生成一次性注册码</el-button>
      </div>
      <el-table :data="frontendUsers" border>
        <el-table-column type="expand" width="48">
          <template #default="{ row }">
            <frontend-sub-accounts-read-only :rows="row.frontendSubAccounts || []" />
          </template>
        </el-table-column>
        <el-table-column prop="account" label="账号" width="160" />
        <el-table-column prop="username" label="名称" width="160" />
        <el-table-column label="名称备注" min-width="240">
          <template #default="{ row }">
            <div class="remark-editor">
              <el-input v-model.trim="row.remarkDraft" size="small" placeholder="不填则使用默认名称" />
              <el-button size="small" type="primary" @click="saveFrontendRemark(row)">保存</el-button>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="displayName" label="统计显示名" width="160" />
        <el-table-column prop="password" label="密码" width="160" />
        <el-table-column label="前端访问密码" min-width="320">
          <template #default="{ row }">
            <div v-if="row.accessGroups?.length" class="access-info">
              <section v-for="group in row.accessGroups" :key="group.id" class="access-group-row">
                <div>
                  <strong>{{ group.name }}</strong>
                  <el-tag size="small" :type="group.enabled ? 'success' : 'info'">{{ group.enabled ? '已启用' : '已停用' }}</el-tag>
                  <span>免输 {{ group.ttlMinutes }} 分钟</span>
                </div>
                <div>功能：{{ group.features.map(accessFeatureLabel).join('、') }}</div>
                <div>密码：{{ group.password }}</div>
                <div>提示词：{{ group.recoveryPrompt }}</div>
                <div>找回答案：{{ group.recoveryAnswer }}</div>
              </section>
            </div>
            <span v-else class="muted">未创建访问组合</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }"><el-tag :type="row.disabled ? 'danger' : 'success'">{{ row.disabled ? '已禁用' : '正常' }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" min-width="180" />
        <el-table-column label="操作" width="220">
          <template #default="{ row }">
            <el-button size="small" @click="setDisabled(row, !row.disabled)">{{ row.disabled ? '启用' : '禁用' }}</el-button>
            <el-button size="small" type="danger" @click="deleteFrontend(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section v-else class="panel">
      <div class="panel__header">
        <strong>后台子账号</strong>
        <el-button type="primary" @click="openSubDialog()">创建后台子账号</el-button>
      </div>
      <el-table :data="subAdmins" border>
        <el-table-column prop="account" label="账号" width="160" />
        <el-table-column prop="username" label="名称" width="160" />
        <el-table-column prop="password" label="密码" width="160" />
        <el-table-column label="授权前端账号" min-width="260">
          <template #default="{ row }">{{ row.permissions?.map((item: any) => item.username || item.account).join('、') || '未授权' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }"><el-button size="small" @click="openSubDialog(row)">权限管理</el-button></template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="inviteVisible" title="生成一次性注册码" width="440px">
      <el-form label-position="top">
        <el-form-item label="备注">
          <el-input v-model="inviteForm.note" />
        </el-form-item>
        <el-form-item label="过期时间">
          <el-date-picker v-model="inviteForm.expiresAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.SSS[Z]" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="inviteVisible = false">取消</el-button>
        <el-button type="primary" @click="createInvite">生成</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="subVisible" :title="editingSub ? '权限管理' : '创建子账号'" width="620px">
      <el-form label-position="top">
        <el-form-item label="子账号名称" v-if="!editingSub">
          <el-input v-model="subForm.username" />
        </el-form-item>
        <el-form-item label="账号" v-if="!editingSub">
          <el-input v-model="subForm.account" />
        </el-form-item>
        <el-form-item label="密码" v-if="!editingSub">
          <el-input v-model="subForm.password" type="password" show-password />
        </el-form-item>
        <el-form-item label="允许访问的前端账号">
          <el-select v-model="subForm.frontendUserIds" multiple filterable style="width: 100%">
            <el-option v-for="item in frontendOptions" :key="item.id" :label="`${item.name}（${item.account}）`" :value="item.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="subVisible = false">取消</el-button>
        <el-button type="primary" @click="saveSubAdmin">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { onMounted, reactive, ref } from 'vue'
import { getAdminFrontendAccounts, getFrontendOptions, request } from '../api'
import FrontendSubAccountsReadOnly from '../components/FrontendSubAccountsReadOnly.vue'
import type { AdminFrontendAccount, FrontendOption } from '../types'

const active = ref('frontend')
const frontendUsers = ref<Array<AdminFrontendAccount & { remarkDraft: string }>>([])
const subAdmins = ref<any[]>([])
const frontendOptions = ref<FrontendOption[]>([])
const inviteVisible = ref(false)
const subVisible = ref(false)
const editingSub = ref<any | null>(null)
const inviteForm = reactive({ note: '', expiresAt: '' })
const subForm = reactive({ account: '', username: '', password: '', frontendUserIds: [] as string[] })

onMounted(async () => {
  frontendOptions.value = await getFrontendOptions()
  await loadActive()
})

async function loadActive() {
  if (active.value === 'frontend') {
    const rows = await getAdminFrontendAccounts()
    frontendUsers.value = rows.map((row) => ({ ...row, remarkDraft: row.displayRemark || '' }))
  }
  else subAdmins.value = await request.get('/admin/accounts/sub-admins')
}

async function createInvite() {
  const row = await request.post<any, { code: string }>('/admin/accounts/invite-codes', inviteForm)
  ElMessage.success(`注册码：${row.code}`)
  inviteVisible.value = false
}

async function setDisabled(row: any, disabled: boolean) {
  await request.patch(`/admin/accounts/frontend-users/${row.id}/disabled`, { disabled })
  ElMessage.success(disabled ? '账号已禁用' : '账号已启用')
  await loadActive()
}

async function deleteFrontend(row: any) {
  await ElMessageBox.confirm('删除账号不会删除已有数据，确认删除？', '删除确认', { type: 'warning' })
  await request.delete(`/admin/accounts/frontend-users/${row.id}`)
  ElMessage.success('账号已删除')
  await loadActive()
}

async function saveFrontendRemark(row: any) {
  await request.patch(`/admin/accounts/frontend-users/${row.id}/remark`, { displayRemark: row.remarkDraft || '' })
  ElMessage.success('名称备注已保存')
  frontendOptions.value = await getFrontendOptions()
  await loadActive()
}

function accessFeatureLabel(feature: string) {
  return ({ FINANCE: '财务', REPORTS: '报表', BLACKLIST: '黑名单', HISTORICAL_DATES: '历史日期查看', MEDICINE_INVENTORY: '药品库存', CUSTOMER_OVERVIEW: '客户总览', COMPLETED_SAMPLE_DATA: '已完成样品隐藏数据' } as Record<string, string>)[feature] || feature
}

function openSubDialog(row?: any) {
  editingSub.value = row || null
  subForm.account = ''
  subForm.username = ''
  subForm.password = ''
  subForm.frontendUserIds = row?.permissions?.map((item: any) => item.id) || []
  subVisible.value = true
}

async function saveSubAdmin() {
  if (editingSub.value) {
    await request.patch(`/admin/accounts/sub-admins/${editingSub.value.id}/permissions`, { frontendUserIds: subForm.frontendUserIds })
  } else {
    await request.post('/admin/accounts/sub-admins', subForm)
  }
  ElMessage.success('子账号已保存')
  subVisible.value = false
  await loadActive()
}
</script>

<style scoped>
.remark-editor {
  display: flex;
  align-items: center;
  gap: 8px;
}

.access-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #334155;
  line-height: 1.4;
}

.access-info > div:first-child {
  display: flex;
  align-items: center;
  gap: 8px;
}

.access-group-row + .access-group-row { border-top: 1px solid #e2e8f0; padding-top: 6px; }
.access-group-row strong { margin-right: 6px; }
.muted { color: #94a3b8; }
</style>
