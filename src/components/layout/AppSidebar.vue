<template>
  <aside class="app-sidebar" :class="{ 'app-sidebar--collapsed': collapsed }">
    <div class="brand">
      <div class="brand-mark">仰</div>
      <div class="brand-text">
        <strong>仰韶化验室</strong>
        <span>内部系统</span>
      </div>
      <el-tooltip :content="collapsed ? '展开侧边栏' : '折叠侧边栏'" placement="right">
        <button
          class="sidebar-toggle"
          type="button"
          :aria-label="collapsed ? '展开侧边栏' : '折叠侧边栏'"
          :title="collapsed ? '展开侧边栏' : '折叠侧边栏'"
          @click="emit('toggle')"
        >
          <component :is="collapsed ? Expand : Fold" class="sidebar-toggle__icon" />
        </button>
      </el-tooltip>
    </div>
    <nav class="side-nav">
      <div v-for="item in navItems" :key="item.path" class="side-nav__group">
        <el-tooltip :disabled="!collapsed" :content="item.label" placement="right">
          <RouterLink :to="item.path" class="side-nav__item" :class="{ 'router-link-active': isActive(item) }">
            <component :is="item.icon" class="side-nav__icon" />
            <span class="side-nav__label">{{ item.label }}</span>
          </RouterLink>
        </el-tooltip>
        <div v-if="!collapsed && item.children?.length && isActive(item)" class="side-nav__children">
          <RouterLink
            v-for="child in item.children"
            :key="child.path"
            :to="child.path"
            class="side-nav__child"
            active-class="side-nav__child--auto-active"
            :class="{ 'router-link-active': isChildActive(child) }"
          >
            {{ child.label }}
          </RouterLink>
        </div>
      </div>
    </nav>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Box, Calendar, DataAnalysis, DocumentChecked, Expand, Fold, Memo, Money, User, Warning } from '@element-plus/icons-vue'
import { navigationForUser, type FrontendNavigationLeaf } from '@/config/frontendNavigation'
import { useAuthStore } from '@/stores/auth'

const iconComponents = {
  data: DataAnalysis,
  report: Memo,
  attendance: Calendar,
  finance: Money,
  reports: DocumentChecked,
  medicine: Box,
  customers: User,
  blacklist: Warning
}

const route = useRoute()
let authStore: ReturnType<typeof useAuthStore> | null = null
try { authStore = useAuthStore() } catch { /* isolated navigation previews may omit Pinia */ }
const navItems = computed(() => navigationForUser(authStore?.user || null).map((item) => ({
  ...item,
  icon: iconComponents[item.icon]
})))
defineProps<{
  collapsed: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()

function isActive(item: { path: string; children?: FrontendNavigationLeaf[] }) {
  return route.path === item.path || route.path.startsWith(`${item.path}/`) || Boolean(item.children?.some((child) => child.path === route.path))
}

function isChildActive(child: FrontendNavigationLeaf) {
  if (child.path === '/data') return route.path === child.path
  return route.path === child.path || route.path.startsWith(`${child.path}/`)
}
</script>
