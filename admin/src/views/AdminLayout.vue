<template>
  <div class="admin-shell" :class="{ 'admin-shell--sidebar-collapsed': sidebarCollapsed }">
    <aside class="admin-sidebar" :class="{ 'admin-sidebar--collapsed': sidebarCollapsed }">
      <div class="brand">
        <span class="brand-mark">仰</span>
        <div class="brand-text">
          <strong>仰韶化验室</strong>
          <small>后台管理</small>
        </div>
        <el-tooltip :content="sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'" placement="right">
          <button
            class="sidebar-toggle"
            type="button"
            :aria-label="sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
            :title="sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
            @click="toggleSidebar"
          >
            <component :is="sidebarCollapsed ? Expand : Fold" class="sidebar-toggle__icon" />
          </button>
        </el-tooltip>
      </div>
      <nav>
        <el-tooltip v-for="item in navItems" :key="item.path" :disabled="!sidebarCollapsed" :content="item.label" placement="right">
          <router-link :to="item.path" class="admin-nav-link">
            <component :is="item.icon" class="admin-nav-link__icon" />
            <span class="admin-nav-link__label">{{ item.label }}</span>
          </router-link>
        </el-tooltip>
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
import type { Component } from 'vue'
import dayjs from 'dayjs'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { DataAnalysis, DocumentChecked, Expand, Fold, Memo, Money, User } from '@element-plus/icons-vue'
import { adminMe, currentAdminUser, logoutAdmin, updateAdminProfile } from '../api'
import type { AdminUser } from '../types'

const route = useRoute()
const router = useRouter()
const user = ref<AdminUser | null>(currentAdminUser())
const now = ref(dayjs())
const settingsVisible = ref(false)
const settingsSaving = ref(false)
const sidebarCollapsed = ref(false)
const settingsForm = reactive({
  account: '',
  username: '',
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})
let timer = 0
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'ys_admin_sidebar_collapsed'

const title = computed(() => String(route.meta.title || '后台管理'))
const nowText = computed(() => now.value.format('YYYY-MM-DD HH:mm:ss'))
const navItems = computed<Array<{ path: string; label: string; icon: Component }>>(() => {
  const items = [
    { path: '/data', label: '数据统计', icon: DataAnalysis },
    { path: '/finance', label: '财务报表', icon: Money },
    { path: '/abnormal', label: '异常记录', icon: Memo },
    ...(user.value?.role === 'ROOT_ADMIN' ? [{ path: '/accounts', label: '账号管理', icon: User }] : []),
    { path: '/blacklist', label: '客户黑名单', icon: DocumentChecked }
  ]
  return items
})

onMounted(async () => {
  sidebarCollapsed.value = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true'
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

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
  window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(sidebarCollapsed.value))
}

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
  --admin-sidebar-expanded-width: 236px;
  --admin-sidebar-collapsed-width: 76px;
  --admin-sidebar-width: var(--admin-sidebar-expanded-width);
  min-height: 100vh;
  display: grid;
  grid-template-columns: var(--admin-sidebar-width) 1fr;
  transition: grid-template-columns 0.18s ease;
}

.admin-shell--sidebar-collapsed {
  --admin-sidebar-width: var(--admin-sidebar-collapsed-width);
}

.admin-sidebar {
  min-height: 100vh;
  padding: 18px 14px;
  background: #10243c;
  color: #fff;
  overflow-x: hidden;
  transition: width 0.18s ease, padding 0.18s ease;
}

.brand {
  position: relative;
  display: flex;
  gap: 12px;
  align-items: center;
  height: 66px;
  padding: 8px 40px 18px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.14);
}

.brand-mark {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: #d83d31;
  font-weight: 700;
}

.brand-text {
  min-width: 0;
}

.brand strong,
.brand small {
  display: block;
}

.brand small {
  margin-top: 4px;
  color: #9fb2ca;
}

.sidebar-toggle {
  position: absolute;
  right: 2px;
  top: 13px;
  display: grid;
  width: 30px;
  height: 30px;
  padding: 0;
  place-items: center;
  color: #dbeafe;
  background: rgba(15, 23, 42, 0.2);
  border: 1px solid rgba(226, 232, 240, 0.18);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.sidebar-toggle:hover {
  color: #fff;
  background: rgba(78, 113, 150, 0.52);
  border-color: rgba(226, 232, 240, 0.42);
}

.sidebar-toggle__icon {
  width: 17px;
  height: 17px;
}

nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 20px;
}

.admin-nav-link {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  color: #c9d7e8;
  text-decoration: none;
  padding: 0 14px;
  border-radius: 6px;
}

.admin-nav-link:hover,
.admin-nav-link.router-link-active {
  color: #fff;
  background: #315273;
}

.admin-nav-link__icon {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
}

.admin-nav-link__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-sidebar--collapsed {
  padding-inline: 14px;
}

.admin-sidebar--collapsed .brand {
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  height: 98px;
  padding: 6px 0 14px;
}

.admin-sidebar--collapsed .brand-text {
  display: none;
}

.admin-sidebar--collapsed .sidebar-toggle {
  position: static;
  width: 36px;
  height: 30px;
}

.admin-sidebar--collapsed nav {
  padding-top: 14px;
}

.admin-sidebar--collapsed .admin-nav-link {
  justify-content: center;
  padding: 0;
}

.admin-sidebar--collapsed .admin-nav-link__label {
  display: none;
}

.admin-sidebar--collapsed .admin-nav-link__icon {
  width: 20px;
  height: 20px;
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
