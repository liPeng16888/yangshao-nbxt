<template>
  <div
    class="app-shell"
    :class="{
      'app-shell--sidebar-collapsed': sidebarCollapsed && !isMobileLayout,
      'app-shell--mobile': isMobileLayout,
      'app-shell--mobile-has-secondary-nav': isMobileLayout && showSecondaryNav
    }"
  >
    <AppMobileShell v-if="isMobileLayout" />
    <AppSidebar v-else :collapsed="sidebarCollapsed" @toggle="toggleSidebar" />
    <div class="app-main">
      <AppTopbar v-if="!isMobileLayout" />
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
import { ElMessageBox } from 'element-plus'
import { useMobileLayout } from '@/composables/useMobileLayout'
import { useCustomerNavigation } from '@/composables/useCustomerNavigation'
import { useAccessGuardStore } from '@/stores/accessGuard'
import { useAuthStore } from '@/stores/auth'
import { frontendPreferenceOwnerId, useFrontendPreferencesStore } from '@/stores/frontendPreferences'
import { useSharedPrepaidStore } from '@/stores/sharedPrepaid'
import { useTenantRealtimeStore } from '@/stores/tenantRealtime'
import type { FrontendPreferenceSection } from '@/types/frontendPreference'
import {
  collectLegacyPreferenceCandidates,
  markLegacyMigrationFinished
} from '@/utils/frontendPreferenceMigration'
import AppMobileShell from './AppMobileShell.vue'
import AppSidebar from './AppSidebar.vue'
import AppTopbar from './AppTopbar.vue'

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'ys_sidebar_collapsed'
const PREFERENCE_SECTION_LABELS: Record<FrontendPreferenceSection, string> = {
  LAB_REPORT_TEMPLATE: '化验报告图片模板',
  LAB_REPORT_SMS_TEMPLATE: '化验短信生成模板',
  LAB_REPORT_SAMPLE_UNITS: '来样单位快捷名称',
  LAB_ELEMENT_GROUPS: '常用化验元素组合'
}
const sidebarCollapsed = ref(false)
const authStore = useAuthStore()
const accessGuard = useAccessGuardStore()
const tenantRealtime = useTenantRealtimeStore()
const sharedPrepaid = useSharedPrepaidStore()
const frontendPreferences = useFrontendPreferencesStore()
let unregisterPreferences: (() => void) | undefined
const migratingOwners = new Set<string>()
const { isMobileLayout } = useMobileLayout()
const { showSecondaryNav } = useCustomerNavigation()

onMounted(() => {
  sidebarCollapsed.value = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true'
  void accessGuard.loadGroups()
  void loadPreferencesAndMigrate()
  unregisterPreferences = tenantRealtime.registerModule('frontend-preferences', {
    isDirty: () => frontendPreferences.hasPendingChanges,
    refresh: async () => { await loadPreferencesAndMigrate() }
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

async function loadPreferencesAndMigrate() {
  const result = await frontendPreferences.loadAll()
  if (result !== 'loaded') return
  await migrateLegacyPreferences()
}

async function migrateLegacyPreferences() {
  const user = authStore.user
  const ownerId = frontendPreferenceOwnerId(user)
  if (!user || !ownerId || migratingOwners.has(ownerId)) return
  const serverSections = new Set(
    Object.keys(frontendPreferences.records) as FrontendPreferenceSection[]
  )
  const candidates = collectLegacyPreferenceCandidates(user, serverSections)
  const sections = Object.keys(candidates) as FrontendPreferenceSection[]
  if (!sections.length) return

  migratingOwners.add(ownerId)
  try {
    try {
      await ElMessageBox.confirm(
        `检测到本机旧配置：${sections.map((section) => PREFERENCE_SECTION_LABELS[section]).join('、')}。是否同步到当前主账号并与子账号共享？`,
        '同步本机旧配置',
        {
          confirmButtonText: '同步到账号',
          cancelButtonText: '使用服务器默认',
          distinguishCancelAndClose: true
        }
      )
    } catch (error) {
      if (error === 'cancel' && frontendPreferenceOwnerId(authStore.user) === ownerId) {
        markLegacyMigrationFinished(ownerId, sections)
      }
      return
    }

    if (frontendPreferenceOwnerId(authStore.user) !== ownerId) return
    const finished: FrontendPreferenceSection[] = []
    for (const section of sections) {
      if (frontendPreferenceOwnerId(authStore.user) !== ownerId) return
      if (frontendPreferences.records[section]) {
        finished.push(section)
        continue
      }
      const result = await frontendPreferences.save(section, candidates[section])
      if (result === 'saved') {
        finished.push(section)
      } else if (result === 'conflict') {
        const resolved = await frontendPreferences.resolveConflict(section, 'server')
        if (resolved === 'saved') finished.push(section)
      }
    }
    if (finished.length && frontendPreferenceOwnerId(authStore.user) === ownerId) {
      markLegacyMigrationFinished(ownerId, finished)
    }
  } finally {
    migratingOwners.delete(ownerId)
  }
}
</script>

<style scoped>
.remote-change-alert {
  margin-bottom: 12px;
}
</style>
