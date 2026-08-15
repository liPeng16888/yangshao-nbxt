<template>
  <div
    class="app-shell"
    :class="{
      'app-shell--sidebar-collapsed': sidebarCollapsed && !isMobileLayout,
      'app-shell--mobile': isMobileLayout
    }"
  >
    <AppMobileShell v-if="isMobileLayout" />
    <AppSidebar v-else :collapsed="sidebarCollapsed" @toggle="toggleSidebar" />
    <div class="app-main">
      <AppTopbar v-if="!isMobileLayout" />
      <main class="app-content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useMobileLayout } from '@/composables/useMobileLayout'
import { useAccessGuardStore } from '@/stores/accessGuard'
import AppMobileShell from './AppMobileShell.vue'
import AppSidebar from './AppSidebar.vue'
import AppTopbar from './AppTopbar.vue'

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'ys_sidebar_collapsed'
const sidebarCollapsed = ref(false)
const accessGuard = useAccessGuardStore()
const { isMobileLayout } = useMobileLayout()

onMounted(() => {
  sidebarCollapsed.value = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true'
  void accessGuard.loadGroups()
})

watch(sidebarCollapsed, (collapsed) => {
  window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed))
})

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
}
</script>
