<template>
  <header class="app-topbar">
    <div>
      <h1>{{ currentTitle }}</h1>
      <p>北京时间 {{ beijingTime }}</p>
    </div>
    <div class="topbar-actions">
      <el-tag type="info" effect="plain">{{ authStore.user?.username || '未登录' }}</el-tag>
      <el-button :icon="SwitchButton" @click="handleLogout">退出登录</el-button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { SwitchButton } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const beijingTime = ref(dayjs().format('YYYY-MM-DD HH:mm:ss'))
let timer: number | undefined

const currentTitle = computed(() => String(route.meta.title || '工作台'))

onMounted(() => {
  timer = window.setInterval(() => {
    beijingTime.value = dayjs().format('YYYY-MM-DD HH:mm:ss')
  }, 1000)
})

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})

async function handleLogout() {
  await authStore.logoutCurrentUser()
  router.replace('/login')
}
</script>
