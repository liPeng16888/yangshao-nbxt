<template>
  <div class="app-shell" :class="{ 'app-shell--sidebar-collapsed': sidebarCollapsed }">
    <AppSidebar :collapsed="sidebarCollapsed" @toggle="toggleSidebar" />
    <div class="app-main">
      <AppTopbar />
      <main class="app-content">
        <el-alert
          v-if="tenantRealtime.hasRemoteChanges"
          class="remote-change-alert"
          type="warning"
          show-icon
          :closable="false"
          title="其他账号已更新数据；当前未保存内容已保留，请保存后再刷新页面。"
        />
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAccessGuardStore } from '@/stores/accessGuard'
import { useFrontendPreferencesStore } from '@/stores/frontendPreferences'
import { useSharedPrepaidStore } from '@/stores/sharedPrepaid'
import { useTenantRealtimeStore } from '@/stores/tenantRealtime'
import AppSidebar from './AppSidebar.vue'
import AppTopbar from './AppTopbar.vue'

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'ys_sidebar_collapsed'
const sidebarCollapsed = ref(false)
const accessGuard = useAccessGuardStore()
const tenantRealtime = useTenantRealtimeStore()
const sharedPrepaid = useSharedPrepaidStore()
const frontendPreferences = useFrontendPreferencesStore()
let unregisterPreferences: (() => void) | undefined

onMounted(() => {
  sidebarCollapsed.value = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true'
  void accessGuard.loadGroups()
  void frontendPreferences.loadAll()
  unregisterPreferences = tenantRealtime.registerModule('frontend-preferences', {
    isDirty: () => frontendPreferences.hasPendingChanges,
    refresh: async () => { await frontendPreferences.loadAll() }
  })
  tenantRealtime.connect()
  void sharedPrepaid.connectRealtime()
})

onBeforeUnmount(() => {
  unregisterPreferences?.()
  tenantRealtime.disconnect()
  sharedPrepaid.disconnectRealtime()
})

watch(sidebarCollapsed, (collapsed) => {
  window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed))
})

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
}
</script>

<style scoped>
.remote-change-alert {
  margin-bottom: 12px;
}
</style>
