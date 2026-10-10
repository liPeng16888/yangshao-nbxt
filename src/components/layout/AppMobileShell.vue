<template>
  <div class="mobile-app-chrome" aria-label="手机版导航">
    <header class="mobile-app-header">
      <button class="mobile-menu-button" type="button" aria-label="打开导航菜单" @click="menuVisible = true">
        <Menu class="mobile-action-icon" />
      </button>
      <div class="mobile-app-header__title">
        <BrandLogo class="mobile-app-header__mark" />
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
          <BrandLogo class="mobile-app-header__mark" />
          <div>
            <strong>仰韶化验室</strong>
            <small>{{ authStore.user?.username || '未登录' }}</small>
          </div>
        </div>
      </template>

      <nav class="mobile-drawer-nav" aria-label="全部功能">
        <RouterLink
          v-for="item in navigationItems"
          :key="item.path"
          :to="item.path"
          :class="{ 'router-link-active': section?.key === item.key }"
          @click="menuVisible = false"
        >
          <component :is="item.icon" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="mobile-drawer-actions">
        <button v-if="isFrontendMainAccount" class="mobile-access-settings" type="button" @click="openAccessSettings">
          <Lock />
          <span>访问设置</span>
        </button>
        <button class="mobile-logout" type="button" @click="handleLogout">
          <SwitchButton />
          <span>退出登录</span>
        </button>
      </div>
    </el-drawer>

    <MobileSecondaryNav v-if="showSecondaryNav" :items="children" :active-path="activeChild?.path ?? route.path" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Lock,
  Menu,
  SwitchButton
} from '@element-plus/icons-vue'
import { useCustomerNavigation } from '@/composables/useCustomerNavigation'
import { useAccessGuardStore } from '@/stores/accessGuard'
import { useAuthStore } from '@/stores/auth'
import { useLabSheetStore } from '@/stores/labSheet'
import MobileSecondaryNav from './MobileSecondaryNav.vue'
import BrandLogo from '../../../shared/BrandLogo.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const accessGuard = useAccessGuardStore()
const labSheetStore = useLabSheetStore()
const menuVisible = ref(false)
const currentTitle = computed(() => String(route.meta.title || '工作台'))
const isFrontendMainAccount = computed(() => (
  authStore.user?.role === 'FRONTEND_USER' && authStore.user?.isFrontendMainAccount !== false
))
const { navigationItems, section, children, activeChild, showSecondaryNav } = useCustomerNavigation()

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
  color: var(--ui-text);
  background: var(--ui-surface);
  border-bottom: 1px solid var(--ui-line);
  box-shadow: var(--ui-shadow);
}

.mobile-menu-button,
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
  width: 32px;
  height: 32px;
}

.mobile-app-header__online {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--ui-text-muted);
  font-size: 12px;

  i {
    width: 7px;
    height: 7px;
    background: var(--ui-success);
    border-radius: 50%;
    box-shadow: 0 0 0 3px rgba(69, 212, 138, 0.14);
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
    color: var(--ui-text);
    font-size: 17px;
  }

  small {
    color: var(--ui-text-muted);
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
  color: var(--ui-text-secondary);
  background: var(--ui-surface-subtle);
  border: 1px solid #e1e9f2;
  border-radius: 10px;
  text-decoration: none;

  svg {
    flex: 0 0 auto;
    width: 19px;
  }
}

.mobile-drawer-nav a.router-link-active {
  color: var(--ui-danger);
  background: var(--ui-danger-soft);
  border-color: var(--ui-danger-line);
}

.mobile-drawer-actions {
  display: grid;
  gap: 9px;
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid var(--ui-line-soft);

  button {
    width: 100%;
    font: inherit;
    text-align: left;
  }
}

:deep(.mobile-menu-drawer .el-drawer__header) {
  margin: 0;
  padding: calc(18px + env(safe-area-inset-top)) 18px 16px;
  border-bottom: 1px solid var(--ui-line-soft);
}

:deep(.mobile-menu-drawer .el-drawer__body) {
  padding: 18px;
  padding-bottom: calc(18px + env(safe-area-inset-bottom));
}
</style>
