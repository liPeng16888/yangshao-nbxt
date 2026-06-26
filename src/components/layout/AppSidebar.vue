<template>
  <aside class="app-sidebar">
    <div class="brand">
      <div class="brand-mark">仰</div>
      <div>
        <strong>仰韶化验室</strong>
        <span>内部系统</span>
      </div>
    </div>
    <nav class="side-nav">
      <div v-for="item in navItems" :key="item.path" class="side-nav__group">
        <RouterLink :to="item.path" class="side-nav__item" :class="{ 'router-link-active': isActive(item) }">
          <component :is="item.icon" class="side-nav__icon" />
          <span>{{ item.label }}</span>
        </RouterLink>
        <div v-if="item.children?.length && isActive(item)" class="side-nav__children">
          <RouterLink v-for="child in item.children" :key="child.path" :to="child.path" class="side-nav__child">
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
import { DataAnalysis, DocumentChecked, Memo, Money, Warning } from '@element-plus/icons-vue'

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
  { path: '/data', label: '数据计算', icon: DataAnalysis },
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
    path: '/finance',
    label: '财务',
    icon: Money,
    children: [
      { path: '/finance/expenses', label: '支出账单' },
      { path: '/finance/income', label: '收入账单' },
      { path: '/finance/unsettled', label: '未结款' },
      { path: '/finance/monthly-settlement', label: '月结款' }
    ]
  },
  { path: '/reports', label: '报表', icon: DocumentChecked },
  { path: '/blacklist', label: '黑名单', icon: Warning }
]

const route = useRoute()

function isActive(item: NavItem) {
  return route.path === item.path || route.path.startsWith(`${item.path}/`) || Boolean(item.children?.some((child) => child.path === route.path))
}
</script>
