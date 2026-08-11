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
import type { Component } from 'vue'
import { useRoute } from 'vue-router'
import { Box, Calendar, DataAnalysis, DocumentChecked, Expand, Fold, Memo, Money, User, Warning } from '@element-plus/icons-vue'

interface NavChild {
  path: string
  label: string
}

interface NavItem {
  path: string
  label: string
  icon: Component
  children?: NavChild[]
}

const navItems: NavItem[] = [
  {
    path: '/data',
    label: '数据计算',
    icon: DataAnalysis,
    children: [
      { path: '/data', label: '数据计算' },
      { path: '/data/standard-sample', label: '标样计算' },
      { path: '/data/coefficient', label: '系数计算' }
    ]
  },
  {
    path: '/lab-report',
    label: '化验报告',
    icon: Memo,
    children: [
      { path: '/lab-report/image-template', label: '化验报告图片模板' },
      { path: '/lab-report/sms-template', label: '化验短信生成模板' }
    ]
  },
  {
    path: '/employee-attendance',
    label: '员工考勤',
    icon: Calendar,
    children: [
      { path: '/employee-attendance/schedules', label: '排班考勤概览' },
      { path: '/employee-attendance/employees', label: '员工档案' },
      { path: '/employee-attendance/records', label: '考勤记录' },
      { path: '/employee-attendance/leave', label: '请假管理' },
      { path: '/employee-attendance/compensation', label: '提成与奖金' },
      { path: '/employee-attendance/payroll', label: '工资统计' }
    ]
  },
  {
    path: '/finance',
    label: '财务',
    icon: Money,
    children: [
      { path: '/finance/expenses', label: '支出账单' },
      { path: '/finance/income', label: '收入账单' },
      { path: '/finance/unsettled', label: '未结款' },
      { path: '/finance/monthly-settlement', label: '月结款' },
      { path: '/finance/prepaid', label: '预存款' }
    ]
  },
  { path: '/reports', label: '报表', icon: DocumentChecked },
  {
    path: '/medicine-inventory',
    label: '药品库存',
    icon: Box,
    children: [
      { path: '/medicine-inventory/stock', label: '药品库存' },
      { path: '/medicine-inventory/inbound', label: '药品入库' },
      { path: '/medicine-inventory/outbound', label: '药品出库' }
    ]
  },
  { path: '/customers-overview', label: '客户总览', icon: User },
  { path: '/blacklist', label: '黑名单', icon: Warning }
]

const route = useRoute()
defineProps<{
  collapsed: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()

function isActive(item: NavItem) {
  return route.path === item.path || route.path.startsWith(`${item.path}/`) || Boolean(item.children?.some((child) => child.path === route.path))
}

function isChildActive(child: NavChild) {
  if (child.path === '/data') return route.path === child.path
  return route.path === child.path || route.path.startsWith(`${child.path}/`)
}
</script>
