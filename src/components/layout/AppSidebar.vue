<template>
  <aside class="app-sidebar" :class="{ 'app-sidebar--collapsed': collapsed }">
    <div class="brand">
      <BrandLogo class="brand-mark" :size="40" />
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
        <el-tooltip :disabled="!compactNavigation" :content="item.label" placement="right">
          <RouterLink :to="item.path" :aria-label="item.label" class="side-nav__item" :class="{ 'router-link-active': isActive(item) }">
            <component :is="item.icon" class="side-nav__icon" aria-hidden="true" />
            <span class="side-nav__label">{{ item.label }}</span>
          </RouterLink>
        </el-tooltip>
        <div v-if="item.children?.length && isActive(item)" class="side-nav__children">
          <el-tooltip
            v-for="child in item.children"
            :key="child.path"
            :disabled="!compactNavigation"
            :content="child.label"
            placement="right"
          >
            <RouterLink
              :to="child.path"
              :aria-label="child.label"
              :aria-current="isChildActive(child) ? 'page' : undefined"
              class="side-nav__child"
              active-class="side-nav__child--auto-active"
              :class="{ 'router-link-active': isChildActive(child) }"
            >
              <component :is="childIcons[child.permission]" class="side-nav__child-icon" aria-hidden="true" />
              <span class="side-nav__child-label">{{ child.label }}</span>
            </RouterLink>
          </el-tooltip>
        </div>
      </div>
    </nav>
  </aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { Component } from 'vue'
import { Aim, BottomLeft, Box, Calendar, ChatLineSquare, Coin, DataAnalysis, Document, DocumentChecked, Download, Expand, Fold, Grid, List, Memo, Money, Operation, Picture, Plus, Present, Switch, Tickets, Timer, TopRight, Upload, User, Wallet, Warning } from '@element-plus/icons-vue'
import { navigationForUser, type FrontendMenuPermission, type FrontendNavigationLeaf } from '@/config/frontendNavigation'
import { useAuthStore } from '@/stores/auth'
import BrandLogo from '../../../shared/BrandLogo.vue'

const iconComponents = {
  data: DataAnalysis,
  report: Memo,
  attendance: Calendar,
  prepaid: Coin,
  finance: Money,
  reports: DocumentChecked,
  medicine: Box,
  customers: User,
  blacklist: Warning
}

const childIcons: Record<FrontendMenuPermission, Component> = {
  DATA_MAIN: Grid,
  DATA_STANDARD_SAMPLE: Aim,
  DATA_COEFFICIENT: Operation,
  LAB_REPORT_IMAGE_TEMPLATE: Picture,
  LAB_REPORT_SMS_TEMPLATE: ChatLineSquare,
  ATTENDANCE_OVERVIEW: DataAnalysis,
  ATTENDANCE_EMPLOYEES: User,
  ATTENDANCE_SCHEDULES: Calendar,
  ATTENDANCE_RECORDS: Timer,
  ATTENDANCE_LEAVE: Document,
  ATTENDANCE_COMPENSATION: Present,
  ATTENDANCE_PAYROLL: Money,
  PREPAID_RECHARGE: Plus,
  PREPAID_CUSTOMERS: User,
  PREPAID_CONSUMPTIONS: Tickets,
  PREPAID_SETTLEMENTS: Switch,
  FINANCE_EXPENSES: TopRight,
  FINANCE_INCOME: BottomLeft,
  FINANCE_UNSETTLED: Wallet,
  FINANCE_MONTHLY_SETTLEMENT: Calendar,
  REPORTS: DocumentChecked,
  MEDICINE_STOCK: List,
  MEDICINE_INBOUND: Download,
  MEDICINE_OUTBOUND: Upload,
  CUSTOMER_OVERVIEW: User,
  BLACKLIST: Warning
}

const route = useRoute()
let authStore: ReturnType<typeof useAuthStore> | null = null
try { authStore = useAuthStore() } catch { /* isolated navigation previews may omit Pinia */ }
const navItems = computed(() => navigationForUser(authStore?.user || null).map((item) => ({
  ...item,
  icon: iconComponents[item.icon]
})))
const props = defineProps<{
  collapsed: boolean
}>()

// The existing tablet-width sidebar also uses icons without the manual collapse state.
const compactMedia = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(max-width: 900px)')
  : null
const compactViewport = ref(compactMedia?.matches ?? false)
const compactNavigation = computed(() => props.collapsed || compactViewport.value)
const updateCompactViewport = () => { compactViewport.value = compactMedia?.matches ?? false }
onMounted(() => compactMedia?.addEventListener('change', updateCompactViewport))
onBeforeUnmount(() => compactMedia?.removeEventListener('change', updateCompactViewport))

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
