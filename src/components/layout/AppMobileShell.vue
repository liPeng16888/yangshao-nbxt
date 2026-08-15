<template>
  <div class="mobile-app-chrome" aria-label="手机版导航">
    <header class="mobile-app-header">
      <button class="mobile-menu-button" type="button" aria-label="打开导航菜单" @click="menuVisible = true">
        <Menu class="mobile-action-icon" />
      </button>
      <div class="mobile-app-header__title">
        <span class="mobile-app-header__mark">仰</span>
        <strong>{{ currentTitle }}</strong>
      </div>
      <span class="mobile-app-header__online"><i aria-hidden="true" />在线</span>
    </header>

    <el-drawer
      v-model="menuVisible"
      direction="ltr"
      size="min(88vw, 360px)"
      :show-close="false"
      append-to-body
      class="mobile-menu-drawer"
    >
      <template #header>
        <div class="mobile-drawer-brand">
          <span class="mobile-app-header__mark">仰</span>
          <div>
            <strong>仰韶化验室</strong>
            <small>{{ authStore.user?.username || '未登录' }}</small>
          </div>
        </div>
      </template>

      <nav class="mobile-drawer-nav" aria-label="全部功能">
        <RouterLink
          v-for="item in customerNavigation"
          :key="item.path"
          :to="item.path"
          :class="{ 'router-link-active': navigation?.section.key === item.key }"
          @click="menuVisible = false"
        >
          <component :is="item.icon" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="mobile-drawer-actions">
        <button class="mobile-access-settings" type="button" @click="openAccessSettings">
          <Lock />
          <span>访问设置</span>
        </button>
        <button class="mobile-logout" type="button" @click="handleLogout">
          <SwitchButton />
          <span>退出登录</span>
        </button>
      </div>
    </el-drawer>

    <nav class="mobile-bottom-nav" aria-label="手机版底部导航">
      <RouterLink to="/data" :class="{ 'router-link-active': route.path === '/data' }">
        <DataAnalysis />
        <span>数据录入</span>
      </RouterLink>
      <RouterLink to="/lab-report/image-template" :class="{ 'router-link-active': route.path.startsWith('/lab-report') }">
        <Memo />
        <span>化验报告</span>
      </RouterLink>
      <button class="mobile-bottom-menu-button" type="button" @click="menuVisible = true">
        <MoreFilled />
        <span>菜单</span>
      </button>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  DataAnalysis,
  Lock,
  Memo,
  Menu,
  MoreFilled,
  SwitchButton
} from '@element-plus/icons-vue'
import { customerNavigation, findCustomerNavigation } from '@/config/customerNavigation'
import { useAccessGuardStore } from '@/stores/accessGuard'
import { useAuthStore } from '@/stores/auth'
import { useLabSheetStore } from '@/stores/labSheet'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const accessGuard = useAccessGuardStore()
const labSheetStore = useLabSheetStore()
const menuVisible = ref(false)
const currentTitle = computed(() => String(route.meta.title || '工作台'))
const navigation = computed(() => findCustomerNavigation(route.path))

function openAccessSettings() {
  menuVisible.value = false
  accessGuard.openSettings()
}

async function handleLogout() {
  labSheetStore.disconnectRealtime()
  await authStore.logoutCurrentUser()
  await router.replace('/login')
}
</script>

<style scoped lang="scss">
.mobile-app-header {
  position: fixed;
  inset: 0 0 auto;
  z-index: 18;
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  align-items: center;
  min-height: calc(56px + env(safe-area-inset-top));
  padding: env(safe-area-inset-top) 12px 0;
  color: #f8fafc;
  background: linear-gradient(135deg, #10233f, #1f4668);
  box-shadow: 0 3px 16px rgba(15, 35, 63, 0.2);
}

.mobile-menu-button,
.mobile-bottom-nav > *,
.mobile-drawer-nav a,
.mobile-drawer-actions button {
  min-width: 44px;
  min-height: 44px;
}

.mobile-menu-button {
  display: grid;
  padding: 0;
  place-items: center;
  color: inherit;
  background: transparent;
  border: 0;
}

.mobile-action-icon {
  width: 23px;
}

.mobile-app-header__title {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;

  strong {
    overflow: hidden;
    font-size: 17px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.mobile-app-header__mark {
  display: grid;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  place-items: center;
  color: #fff;
  font-weight: 700;
  background: linear-gradient(145deg, #df543c, #991f17);
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 9px;
}

.mobile-app-header__online {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #d9e9f8;
  font-size: 12px;

  i {
    width: 7px;
    height: 7px;
    background: #45d48a;
    border-radius: 50%;
    box-shadow: 0 0 0 3px rgba(69, 212, 138, 0.14);
  }
}

.mobile-bottom-nav {
  position: fixed;
  inset: auto 0 0;
  z-index: 18;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  min-height: calc(58px + env(safe-area-inset-bottom));
  padding: 4px 8px env(safe-area-inset-bottom);
  background: rgba(255, 255, 255, 0.96);
  border-top: 1px solid #d8e1eb;
  box-shadow: 0 -6px 20px rgba(15, 23, 42, 0.07);
  backdrop-filter: blur(14px);
}

.mobile-bottom-nav > * {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 2px;
  padding: 3px 8px;
  color: #64748b;
  background: transparent;
  border: 0;
  border-radius: 10px;
  font-size: 11px;
  text-decoration: none;

  svg {
    width: 21px;
    height: 21px;
  }

  &.router-link-active {
    color: #b12b20;
    background: #fff2ef;
  }
}

.mobile-drawer-brand {
  display: flex;
  align-items: center;
  gap: 10px;

  div {
    display: grid;
    gap: 2px;
  }

  strong {
    color: #10233f;
    font-size: 17px;
  }

  small {
    color: #64748b;
  }
}

.mobile-drawer-nav {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}

.mobile-drawer-nav a,
.mobile-drawer-actions button {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  color: #334155;
  background: #f6f9fc;
  border: 1px solid #e1e9f2;
  border-radius: 10px;
  text-decoration: none;

  svg {
    flex: 0 0 auto;
    width: 19px;
  }
}

.mobile-drawer-nav a.router-link-active {
  color: #a8261d;
  background: #fff1ee;
  border-color: #f0c3bb;
}

.mobile-drawer-actions {
  display: grid;
  gap: 9px;
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid #e2e8f0;

  button {
    width: 100%;
    font: inherit;
    text-align: left;
  }
}

:deep(.mobile-menu-drawer .el-drawer__header) {
  margin: 0;
  padding: calc(18px + env(safe-area-inset-top)) 18px 16px;
  border-bottom: 1px solid #e2e8f0;
}

:deep(.mobile-menu-drawer .el-drawer__body) {
  padding: 18px;
  padding-bottom: calc(18px + env(safe-area-inset-bottom));
}
</style>
