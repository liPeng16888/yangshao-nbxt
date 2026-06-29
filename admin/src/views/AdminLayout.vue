<template>
  <div class="admin-shell">
    <aside class="admin-sidebar">
      <div class="brand">
        <span>仰</span>
        <div>
          <strong>仰韶化验室</strong>
          <small>后台管理</small>
        </div>
      </div>
      <nav>
        <router-link to="/data">数据统计</router-link>
        <router-link to="/finance">财务报表</router-link>
        <router-link to="/abnormal">异常记录</router-link>
        <router-link v-if="user?.role === 'ROOT_ADMIN'" to="/accounts">账号管理</router-link>
        <router-link to="/blacklist">客户黑名单</router-link>
      </nav>
    </aside>
    <section class="admin-main">
      <header class="admin-topbar">
        <div>
          <h2>{{ title }}</h2>
          <span>北京时间 {{ nowText }}</span>
        </div>
        <div class="topbar-actions">
          <span class="account-name">{{ user?.username || user?.account }}</span>
          <el-tag>{{ user?.role === 'ROOT_ADMIN' ? '主账号' : '子账号' }}</el-tag>
          <el-button @click="openSettings">账号设置</el-button>
          <el-button @click="logout">退出登录</el-button>
        </div>
      </header>
      <main class="admin-content">
        <router-view />
      </main>
    </section>

    <el-dialog v-model="settingsVisible" title="账号设置" width="460px">
      <el-form label-position="top">
        <el-form-item label="登录账号">
          <el-input v-model.trim="settingsForm.account" placeholder="请输入登录账号" />
        </el-form-item>
        <el-form-item label="账号名称">
          <el-input v-model.trim="settingsForm.username" placeholder="请输入账号名称" />
        </el-form-item>
        <el-divider content-position="left">修改密码</el-divider>
        <el-form-item label="当前密码">
          <el-input v-model="settingsForm.currentPassword" type="password" show-password placeholder="不修改密码可留空" />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="settingsForm.newPassword" type="password" show-password placeholder="至少 6 位" />
        </el-form-item>
        <el-form-item label="确认新密码">
          <el-input v-model="settingsForm.confirmPassword" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="settingsVisible = false">取消</el-button>
        <el-button type="primary" :loading="settingsSaving" @click="saveSettings">保存设置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import dayjs from 'dayjs'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { adminMe, currentAdminUser, logoutAdmin, updateAdminProfile } from '../api'
import type { AdminUser } from '../types'

const route = useRoute()
const router = useRouter()
const user = ref<AdminUser | null>(currentAdminUser())
const now = ref(dayjs())
const settingsVisible = ref(false)
const settingsSaving = ref(false)
const settingsForm = reactive({
  account: '',
  username: '',
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})
let timer = 0

const title = computed(() => String(route.meta.title || '后台管理'))
const nowText = computed(() => now.value.format('YYYY-MM-DD HH:mm:ss'))

onMounted(async () => {
  timer = window.setInterval(() => {
    now.value = dayjs()
  }, 1000)
  try {
    user.value = await adminMe()
  } catch {
    logoutAdmin()
  }
})

onBeforeUnmount(() => window.clearInterval(timer))

function logout() {
  logoutAdmin()
  void router.push('/login')
}

function openSettings() {
  settingsForm.account = user.value?.account || ''
  settingsForm.username = user.value?.username || ''
  settingsForm.currentPassword = ''
  settingsForm.newPassword = ''
  settingsForm.confirmPassword = ''
  settingsVisible.value = true
}

async function saveSettings() {
  if (!settingsForm.account.trim()) {
    ElMessage.warning('请输入登录账号')
    return
  }
  if (!settingsForm.username.trim()) {
    ElMessage.warning('请输入账号名称')
    return
  }
  const wantsPasswordChange = Boolean(settingsForm.currentPassword || settingsForm.newPassword || settingsForm.confirmPassword)
  if (wantsPasswordChange) {
    if (!settingsForm.currentPassword || !settingsForm.newPassword || !settingsForm.confirmPassword) {
      ElMessage.warning('请完整填写当前密码、新密码和确认密码')
      return
    }
    if (settingsForm.newPassword.length < 6) {
      ElMessage.warning('新密码至少 6 位')
      return
    }
    if (settingsForm.newPassword !== settingsForm.confirmPassword) {
      ElMessage.warning('两次新密码不一致')
      return
    }
  }

  settingsSaving.value = true
  try {
    user.value = await updateAdminProfile({
      account: settingsForm.account.trim(),
      username: settingsForm.username.trim(),
      currentPassword: wantsPasswordChange ? settingsForm.currentPassword : undefined,
      newPassword: wantsPasswordChange ? settingsForm.newPassword : undefined,
      confirmPassword: wantsPasswordChange ? settingsForm.confirmPassword : undefined
    })
    settingsVisible.value = false
    ElMessage.success('账号设置已保存')
  } finally {
    settingsSaving.value = false
  }
}
</script>

<style scoped>
.admin-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 236px 1fr;
}

.admin-sidebar {
  min-height: 100vh;
  padding: 18px 14px;
  background: #10243c;
  color: #fff;
}

.brand {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px 8px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.14);
}

.brand span {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: #d83d31;
  font-weight: 700;
}

.brand strong,
.brand small {
  display: block;
}

.brand small {
  margin-top: 4px;
  color: #9fb2ca;
}

nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 20px;
}

nav a {
  color: #c9d7e8;
  text-decoration: none;
  padding: 12px 14px;
  border-radius: 6px;
}

nav a.router-link-active {
  color: #fff;
  background: #315273;
}

.admin-main {
  min-width: 0;
}

.admin-topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 76px;
  padding: 0 22px;
  background: rgba(255, 255, 255, 0.94);
  border-bottom: 1px solid #d9e3ee;
}

h2 {
  margin: 0 0 6px;
  font-size: 20px;
}

.admin-topbar span {
  color: #64748b;
  font-size: 13px;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.topbar-actions .account-name {
  max-width: 140px;
  overflow: hidden;
  color: #334155;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-content {
  padding: 22px;
}
</style>
