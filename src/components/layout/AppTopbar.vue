<template>
  <header class="app-topbar">
    <div>
      <h1>{{ currentTitle }}</h1>
      <p>北京时间 {{ beijingTime }}</p>
    </div>
    <div class="topbar-actions">
      <el-popover placement="bottom-end" width="360" trigger="click" @show="reminderStore.loadReminders">
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
      <el-button :icon="SwitchButton" @click="handleLogout">退出登录</el-button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Bell, SwitchButton } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { useAuthStore } from '@/stores/auth'
import { useReminderStore } from '@/stores/reminder'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const reminderStore = useReminderStore()
const beijingTime = ref(dayjs().format('YYYY-MM-DD HH:mm:ss'))
let timer: number | undefined

const currentTitle = computed(() => String(route.meta.title || '工作台'))

onMounted(() => {
  timer = window.setInterval(() => {
    beijingTime.value = dayjs().format('YYYY-MM-DD HH:mm:ss')
  }, 1000)
  void reminderStore.loadReminders()
})

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})

async function handleLogout() {
  await authStore.logoutCurrentUser()
  router.replace('/login')
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
  border: 1px solid #e5edf7;
  border-radius: 6px;
  background: #f8fbff;
}

.reminder-item strong {
  display: block;
  margin-bottom: 6px;
}

.reminder-item p {
  margin: 0 0 8px;
  color: #475569;
  line-height: 1.5;
}

.reminder-item div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #8a97a8;
  font-size: 12px;
}
</style>
