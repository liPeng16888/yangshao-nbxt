<template>
  <section class="sub-account-manager">
    <div class="manager-heading">
      <div>
        <h3>子账号管理</h3>
        <p>子账号与主账号共用业务数据，只能访问已分配的菜单。</p>
      </div>
      <el-button type="primary" @click="openCreate">创建子账号</el-button>
    </div>

    <el-table v-loading="loading" :data="rows" border empty-text="暂无子账号">
      <el-table-column prop="username" label="名称" min-width="110" />
      <el-table-column prop="account" label="登录账号" min-width="120" />
      <el-table-column label="状态" width="86">
        <template #default="{ row }">
          <el-tag :type="row.disabled ? 'danger' : 'success'">{{ row.disabled ? '已停用' : '正常' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="菜单权限" min-width="230">
        <template #default="{ row }">
          <span class="permission-summary">{{ permissionSummary(row.permissions) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="访问密码" width="112">
        <template #default="{ row }">{{ row.requiresAccessGuardPassword ? '需要输入' : '无需输入' }}</template>
      </el-table-column>
      <el-table-column label="最后登录" width="150">
        <template #default="{ row }">{{ formatDate(row.lastLoginAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="306" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link :type="row.disabled ? 'success' : 'warning'" @click="toggleStatus(row)">
            {{ row.disabled ? '启用' : '停用' }}
          </el-button>
          <el-button link type="primary" @click="openResetPassword(row)">重置密码</el-button>
          <el-button link type="danger" @click="removeRow(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="formVisible"
      :title="editingId ? '编辑子账号' : '创建子账号'"
      width="680px"
      append-to-body
      destroy-on-close
    >
      <el-form label-position="top">
        <div class="form-grid">
          <el-form-item label="登录账号" required>
            <el-input
              v-model="form.account"
              :disabled="Boolean(editingId)"
              maxlength="64"
              placeholder="3 至 64 个字符"
            />
          </el-form-item>
          <el-form-item label="账号名称" required>
            <el-input v-model="form.username" maxlength="40" placeholder="例如：前台操作员" />
          </el-form-item>
          <template v-if="!editingId">
            <el-form-item label="登录密码" required>
              <el-input v-model="form.password" type="password" show-password maxlength="72" placeholder="至少 6 位" />
            </el-form-item>
            <el-form-item label="确认登录密码" required>
              <el-input v-model="form.confirmPassword" type="password" show-password maxlength="72" />
            </el-form-item>
          </template>
        </div>
        <el-form-item label="访问密码设置">
          <div class="guard-setting">
            <el-switch v-model="form.requiresAccessGuardPassword" />
            <span>{{ form.requiresAccessGuardPassword ? '访问受保护功能时，需要输入主账号设置的访问密码' : '访问已授权菜单时，不再要求输入访问密码' }}</span>
          </div>
        </el-form-item>
        <el-form-item label="菜单权限" required>
          <div class="permission-tree-wrap">
            <strong>菜单权限</strong>
            <p>可按一级菜单整组选取，也可单独选择二级菜单。授权后可查看、录入和修改该菜单内的数据。</p>
            <el-tree
              ref="treeRef"
              :data="permissionTree"
              show-checkbox
              node-key="id"
              default-expand-all
              :props="{ label: 'label', children: 'children' }"
            />
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveForm">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="resetVisible" title="重置子账号密码" width="440px" append-to-body destroy-on-close>
      <p class="reset-tip">正在为“{{ resettingRow?.username }}（{{ resettingRow?.account }}）”重置密码。为确认主账号身份，请输入主账号当前密码。</p>
      <el-form label-position="top">
        <el-form-item label="主账号当前密码" required>
          <el-input v-model="resetForm.currentPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="子账号新密码" required>
          <el-input v-model="resetForm.newPassword" type="password" show-password maxlength="72" placeholder="至少 6 位" />
        </el-form-item>
        <el-form-item label="确认子账号新密码" required>
          <el-input v-model="resetForm.confirmPassword" type="password" show-password maxlength="72" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetVisible = false">取消</el-button>
        <el-button type="primary" :loading="resetting" @click="submitResetPassword">确认重置</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ElTree } from 'element-plus'
import {
  createFrontendSubAccount,
  deleteFrontendSubAccount,
  listFrontendSubAccounts,
  resetFrontendSubAccountPassword,
  setFrontendSubAccountStatus,
  updateFrontendSubAccount
} from '@/api/frontendSubAccounts'
import { frontendNavigation, type FrontendMenuPermission } from '@/config/frontendNavigation'
import type { FrontendSubAccountDto } from '@/types/frontendSubAccount'

interface PermissionTreeNode {
  id: string
  label: string
  children?: PermissionTreeNode[]
}

const loading = ref(false)
const saving = ref(false)
const resetting = ref(false)
const rows = ref<FrontendSubAccountDto[]>([])
const formVisible = ref(false)
const resetVisible = ref(false)
const editingId = ref('')
const resettingRow = ref<FrontendSubAccountDto | null>(null)
const treeRef = ref<InstanceType<typeof ElTree>>()

const form = reactive({
  account: '',
  username: '',
  password: '',
  confirmPassword: '',
  requiresAccessGuardPassword: true
})

const resetForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const permissionTree = computed<PermissionTreeNode[]>(() => frontendNavigation.map((item) => ({
  id: `group:${item.key}`,
  label: item.label,
  children: item.children?.map((child) => ({ id: child.permission, label: child.label })) || (
    item.permission ? [{ id: item.permission, label: item.label }] : []
  )
})))

const permissionLabels = new Map<FrontendMenuPermission, string>(
  frontendNavigation.flatMap((item) => (
    item.children?.map((child) => [child.permission, child.label] as const) || (
      item.permission ? [[item.permission, item.label] as const] : []
    )
  ))
)

onMounted(() => void loadRows())

async function loadRows() {
  loading.value = true
  try {
    rows.value = await listFrontendSubAccounts()
  } finally {
    loading.value = false
  }
}

function resetEditor() {
  editingId.value = ''
  form.account = ''
  form.username = ''
  form.password = ''
  form.confirmPassword = ''
  form.requiresAccessGuardPassword = true
}

async function openCreate() {
  resetEditor()
  formVisible.value = true
  await nextTick()
  treeRef.value?.setCheckedKeys([])
}

async function openEdit(row: FrontendSubAccountDto) {
  editingId.value = row.id
  form.account = row.account
  form.username = row.username
  form.password = ''
  form.confirmPassword = ''
  form.requiresAccessGuardPassword = row.requiresAccessGuardPassword
  formVisible.value = true
  await nextTick()
  treeRef.value?.setCheckedKeys(row.permissions)
}

function checkedPermissions() {
  const checked = treeRef.value?.getCheckedKeys(true) || []
  return checked.filter((key): key is FrontendMenuPermission => permissionLabels.has(key as FrontendMenuPermission))
}

async function saveForm() {
  const account = form.account.trim()
  const username = form.username.trim()
  const permissions = checkedPermissions()
  if (!editingId.value && (account.length < 3 || account.length > 64)) {
    ElMessage.warning('登录账号长度应为 3 至 64 个字符')
    return
  }
  if (!username) {
    ElMessage.warning('请填写账号名称')
    return
  }
  if (!editingId.value && (form.password.length < 6 || form.password !== form.confirmPassword)) {
    ElMessage.warning(form.password.length < 6 ? '登录密码至少 6 位' : '两次登录密码不一致')
    return
  }
  if (!permissions.length) {
    ElMessage.warning('请至少选择一个菜单权限')
    return
  }

  saving.value = true
  try {
    if (editingId.value) {
      await updateFrontendSubAccount(editingId.value, {
        username,
        permissions,
        requiresAccessGuardPassword: form.requiresAccessGuardPassword
      })
      ElMessage.success('子账号设置已更新，原登录会话将自动失效')
    } else {
      await createFrontendSubAccount({
        account,
        username,
        password: form.password,
        confirmPassword: form.confirmPassword,
        permissions,
        requiresAccessGuardPassword: form.requiresAccessGuardPassword
      })
      ElMessage.success('子账号已创建')
    }
    formVisible.value = false
    await loadRows()
  } finally {
    saving.value = false
  }
}

async function toggleStatus(row: FrontendSubAccountDto) {
  const nextDisabled = !row.disabled
  await ElMessageBox.confirm(
    nextDisabled ? `停用后，子账号“${row.account}”将立即无法继续使用。` : `确定重新启用子账号“${row.account}”吗？`,
    nextDisabled ? '停用子账号' : '启用子账号',
    { type: 'warning', confirmButtonText: nextDisabled ? '确认停用' : '确认启用' }
  )
  await setFrontendSubAccountStatus(row.id, nextDisabled, nextDisabled ? '已由主账号停用' : undefined)
  ElMessage.success(nextDisabled ? '子账号已停用' : '子账号已启用')
  await loadRows()
}

function openResetPassword(row: FrontendSubAccountDto) {
  resettingRow.value = row
  resetForm.currentPassword = ''
  resetForm.newPassword = ''
  resetForm.confirmPassword = ''
  resetVisible.value = true
}

async function submitResetPassword() {
  if (!resettingRow.value) return
  if (!resetForm.currentPassword || !resetForm.newPassword || !resetForm.confirmPassword) {
    ElMessage.warning('请完整填写密码信息')
    return
  }
  if (resetForm.newPassword.length < 6 || resetForm.newPassword !== resetForm.confirmPassword) {
    ElMessage.warning(resetForm.newPassword.length < 6 ? '新密码至少 6 位' : '两次新密码不一致')
    return
  }
  resetting.value = true
  try {
    await resetFrontendSubAccountPassword(resettingRow.value.id, { ...resetForm })
    resetVisible.value = false
    ElMessage.success('子账号密码已重置，原登录会话将自动失效')
    await loadRows()
  } finally {
    resetting.value = false
  }
}

async function removeRow(row: FrontendSubAccountDto) {
  await ElMessageBox.confirm(
    `删除后，子账号“${row.account}”将立即无法登录，历史业务记录仍会保留。`,
    '删除子账号',
    { type: 'warning', confirmButtonText: '确认删除' }
  )
  await deleteFrontendSubAccount(row.id)
  ElMessage.success('子账号已删除')
  await loadRows()
}

function permissionSummary(permissions?: FrontendMenuPermission[]) {
  if (!permissions?.length) return '未分配'
  const labels = permissions.map((permission) => permissionLabels.get(permission) || permission)
  return labels.length > 3 ? `${labels.slice(0, 3).join('、')} 等 ${labels.length} 项` : labels.join('、')
}

function formatDate(value?: string | null) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '尚未登录'
}
</script>

<style scoped>
.sub-account-manager {
  min-height: 300px;
}

.manager-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.manager-heading h3 {
  margin: 0 0 6px;
  font-size: 16px;
}

.manager-heading p,
.permission-tree-wrap p,
.reset-tip {
  margin: 0;
  color: #718096;
  line-height: 1.6;
}

.permission-summary {
  color: var(--ui-text-secondary);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

.guard-setting {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--ui-text-secondary);
}

.permission-tree-wrap {
  width: 100%;
  max-height: 330px;
  overflow: auto;
  padding: 12px 14px;
  border: 1px solid #dfe7f1;
  border-radius: 6px;
  background: var(--ui-surface-subtle);
}

.permission-tree-wrap p {
  margin-bottom: 8px;
}

.reset-tip {
  margin-bottom: 16px;
  padding: 10px 12px;
  border-radius: 6px;
  background: #f4f8fd;
}

@media (max-width: 720px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
