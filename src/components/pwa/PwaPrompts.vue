<template>
  <aside v-if="showUpdatePrompt" class="pwa-prompt pwa-update-prompt" role="status">
    <div>
      <strong>发现新版本</strong>
      <span>更新后可继续使用最新的手机端功能。</span>
    </div>
    <button class="pwa-update-prompt__apply" type="button" @click="applyUpdate">立即更新</button>
    <button type="button" aria-label="暂不更新" @click="showUpdatePrompt = false">稍后</button>
  </aside>

  <aside v-else-if="showIosInstallGuide" class="pwa-prompt ios-install-guide" role="note">
    <div>
      <strong>安装到 iPhone 主屏幕</strong>
      <span>在 Safari 底部点“分享”，再选“添加到主屏幕”。</span>
    </div>
    <button class="ios-install-guide__dismiss" type="button" @click="dismissInstallGuide">知道了</button>
  </aside>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const INSTALL_GUIDE_STORAGE_KEY = 'ys_ios_install_guide_dismissed'
const showUpdatePrompt = ref(false)
const showIosInstallGuide = ref(false)

onMounted(() => {
  showIosInstallGuide.value = shouldShowIosInstallGuide()
  window.addEventListener('ys-pwa-update-available', handleUpdateAvailable)
})

onBeforeUnmount(() => {
  window.removeEventListener('ys-pwa-update-available', handleUpdateAvailable)
})

function handleUpdateAvailable() {
  showUpdatePrompt.value = true
}

function applyUpdate() {
  window.dispatchEvent(new Event('ys-pwa-apply-update'))
}

function dismissInstallGuide() {
  showIosInstallGuide.value = false
  try {
    window.localStorage.setItem(INSTALL_GUIDE_STORAGE_KEY, 'true')
  } catch {
    // The guide remains dismissible even when Safari storage is unavailable.
  }
}

function shouldShowIosInstallGuide() {
  if (!isIosDevice() || isStandaloneDisplay()) return false
  try {
    return window.localStorage.getItem(INSTALL_GUIDE_STORAGE_KEY) !== 'true'
  } catch {
    return true
  }
}

function isIosDevice() {
  const userAgent = navigator.userAgent || ''
  const iPadDesktopMode = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return /iPhone|iPad|iPod/i.test(userAgent) || iPadDesktopMode
}

function isStandaloneDisplay() {
  return Boolean(
    (navigator as Navigator & { standalone?: boolean }).standalone ||
      window.matchMedia?.('(display-mode: standalone)').matches
  )
}
</script>

<style scoped lang="scss">
.pwa-prompt {
  position: fixed;
  right: 12px;
  bottom: var(--mobile-page-action-bottom);
  left: 12px;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 560px;
  min-height: 58px;
  margin-inline: auto;
  padding: 11px 12px;
  color: #f8fafc;
  background: rgba(16, 35, 63, 0.97);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.24);

  div {
    display: grid;
    flex: 1;
    gap: 2px;
    min-width: 0;
  }

  strong {
    font-size: 14px;
  }

  span {
    color: #dbe8f5;
    font-size: 12px;
    line-height: 1.45;
  }

  button {
    min-height: 44px;
    padding: 0 11px;
    color: #ffffff;
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 9px;
  }
}

.pwa-update-prompt__apply {
  background: #bb3729 !important;
}

@media (min-width: 768px) {
  .pwa-prompt {
    right: 22px;
    bottom: 22px;
    left: auto;
    width: min(520px, calc(100vw - 44px));
  }
}
</style>
