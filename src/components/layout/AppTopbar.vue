<template>
  <header class="app-topbar">
    <div>
      <h1>{{ currentTitle }}</h1>
      <p>北京时间 {{ beijingTime }}</p>
    </div>
    <div class="topbar-actions">
      <el-popover v-if="canUseReminders" placement="bottom-end" width="360" trigger="click" @show="reminderStore.loadReminders">
        <template #reference>
          <el-badge :value="reminderStore.unreadCount" :hidden="!reminderStore.unreadCount">
            <el-button :icon="Bell">提醒</el-button>
          </el-badge>
        </template>
        <div class="reminder-list">
          <div v-if="!reminderStore.reminders.length" class="reminder-empty">暂无提醒</div>
          <div v-for="item in reminderStore.reminders" :key="item.id" class="reminder-item">
            <strong>{{ item.title }}</strong>
            <p>{{ item.content }}</p>
            <div>
              <span>{{ dayjs(item.createdAt).format('YYYY-MM-DD HH:mm') }}</span>
              <el-button v-if="!item.readAt" link type="primary" @click="reminderStore.markRead(item.id)">标记已读</el-button>
            </div>
          </div>
        </div>
      </el-popover>
      <el-tag type="info" effect="plain">{{ authStore.user?.username || '未登录' }}</el-tag>
      <el-button v-if="isFrontendMainAccount" :icon="Lock" @click="accessGuard.openSettings">访问设置</el-button>
      <el-button :icon="Setting" @click="openSettings">账号设置</el-button>
      <el-button :icon="SwitchButton" @click="handleLogout">退出登录</el-button>
    </div>
  </header>
  <el-dialog v-model="settingsVisible" title="账号设置" :width="isFrontendMainAccount ? '1080px' : '440px'" append-to-body>
    <el-tabs v-if="isFrontendMainAccount" v-model="settingsTab">
      <el-tab-pane label="修改密码" name="password">
        <div class="password-panel">
          <el-form label-position="top">
            <el-form-item label="当前密码">
              <el-input v-model="passwordForm.currentPassword" type="password" show-password />
            </el-form-item>
            <el-form-item label="新密码">
              <el-input v-model="passwordForm.newPassword" type="password" show-password placeholder="至少 6 位" />
            </el-form-item>
            <el-form-item label="确认新密码">
              <el-input v-model="passwordForm.confirmPassword" type="password" show-password />
            </el-form-item>
          </el-form>
          <div class="password-actions">
            <el-button @click="settingsVisible = false">取消</el-button>
            <el-button type="primary" :loading="settingsSaving" @click="savePassword">保存密码</el-button>
          </div>
        </div>
      </el-tab-pane>
      <el-tab-pane label="子账号管理" name="subaccounts" lazy>
        <frontend-sub-account-manager />
      </el-tab-pane>
    </el-tabs>
    <template v-else>
      <el-form label-position="top">
        <el-form-item label="当前密码">
          <el-input v-model="passwordForm.currentPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="passwordForm.newPassword" type="password" show-password placeholder="至少 6 位" />
        </el-form-item>
        <el-form-item label="确认新密码">
          <el-input v-model="passwordForm.confirmPassword" type="password" show-password />
        </el-form-item>
      </el-form>
      <div class="password-actions">
        <el-button @click="settingsVisible = false">取消</el-button>
        <el-button type="primary" :loading="settingsSaving" @click="savePassword">保存密码</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Bell, Lock, Setting, SwitchButton } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import { useAccessGuardStore } from '@/stores/accessGuard'
import { useAuthStore } from '@/stores/auth'
import { useLabSheetStore } from '@/stores/labSheet'
import { useReminderStore } from '@/stores/reminder'
import FrontendSubAccountManager from '@/components/account/FrontendSubAccountManager.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const labSheetStore = useLabSheetStore()
const reminderStore = useReminderStore()
const accessGuard = useAccessGuardStore()
const beijingTime = ref(dayjs().format('YYYY-MM-DD HH:mm:ss'))
const settingsVisible = ref(false)
const settingsTab = ref('password')
const settingsSaving = ref(false)
const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})
let timer: number | undefined

const currentTitle = computed(() => String(route.meta.title || '工作台'))
const isFrontendMainAccount = computed(() => authStore.user?.role === 'FRONTEND_USER' && authStore.user?.isFrontendMainAccount !== false)
const canUseReminders = computed(() => !authStore.user?.isFrontendSubAccount || authStore.user.permissions?.some((permission) => permission.startsWith('FINANCE_')))

onMounted(() => {
  timer = window.setInterval(() => {
    beijingTime.value = dayjs().format('YYYY-MM-DD HH:mm:ss')
  }, 1000)
  if (canUseReminders.value) void reminderStore.loadReminders()
})

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})

async function handleLogout() {
  labSheetStore.disconnectRealtime()
  await authStore.logoutCurrentUser()
  router.replace('/login')
}

function openSettings() {
  passwordForm.currentPassword = ''
  passwordForm.newPassword = ''
  passwordForm.confirmPassword = ''
  settingsTab.value = 'password'
  settingsVisible.value = true
}

async function savePassword() {
  if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
    ElMessage.warning('请完整填写当前密码、新密码和确认密码')
    return
  }
  if (passwordForm.newPassword.length < 6) {
    ElMessage.warning('新密码至少 6 位')
    return
  }
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    ElMessage.warning('两次新密码不一致')
    return
  }
  settingsSaving.value = true
  try {
    await authStore.updateCurrentPassword({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
      confirmPassword: passwordForm.confirmPassword
    })
    settingsVisible.value = false
    ElMessage.success('密码已修改，请重新登录')
    await handleLogout()
  } finally {
    settingsSaving.value = false
  }
}
</script>

<style scoped>
.reminder-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 360px;
  overflow: auto;
}

.reminder-empty {
  color: #8a97a8;
  text-align: center;
  padding: 18px 0;
}

.reminder-item {
  padding: 10px;
  border: 1px solid var(--ui-line-soft);
  border-radius: 6px;
  background: var(--ui-surface-subtle);
}

.reminder-item strong {
  display: block;
  margin-bottom: 6px;
}

.reminder-item p {
  margin: 0 0 8px;
  color: var(--ui-text-secondary);
  line-height: 1.5;
}

.reminder-item div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #8a97a8;
  font-size: 12px;
}

.password-panel {
  max-width: 440px;
}

.password-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}
</style>
