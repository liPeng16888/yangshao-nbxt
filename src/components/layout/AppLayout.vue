<template>
  <div class="app-shell" :class="{ 'app-shell--sidebar-collapsed': sidebarCollapsed }">
    <AppSidebar :collapsed="sidebarCollapsed" @toggle="toggleSidebar" />
    <div class="app-main">
      <AppTopbar />
      <main class="app-content">
        <router-view />
      </main>
    </div>
    <AccessGuardDialog />
    <AccessGuardSettingsDialog />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import AccessGuardDialog from '@/components/access/AccessGuardDialog.vue'
import AccessGuardSettingsDialog from '@/components/access/AccessGuardSettingsDialog.vue'
import { useAccessGuardStore } from '@/stores/accessGuard'
import AppSidebar from './AppSidebar.vue'
import AppTopbar from './AppTopbar.vue'

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'ys_sidebar_collapsed'
const sidebarCollapsed = ref(false)
const accessGuard = useAccessGuardStore()

onMounted(() => {
  sidebarCollapsed.value = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true'
  void accessGuard.loadSettings()
})

watch(sidebarCollapsed, (collapsed) => {
  window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed))
})

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
}
</script>
