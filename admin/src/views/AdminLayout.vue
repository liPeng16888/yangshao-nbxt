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
          <el-tag>{{ user?.role === 'ROOT_ADMIN' ? '主账号' : '子账号' }}</el-tag>
          <el-button @click="logout">退出登录</el-button>
        </div>
      </header>
      <main class="admin-content">
        <router-view />
      </main>
    </section>
  </div>
</template>

<script setup lang="ts">
import dayjs from 'dayjs'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { adminMe, currentAdminUser, logoutAdmin } from '../api'
import type { AdminUser } from '../types'

const route = useRoute()
const router = useRouter()
const user = ref<AdminUser | null>(currentAdminUser())
const now = ref(dayjs())
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

.admin-content {
  padding: 22px;
}
</style>
