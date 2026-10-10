<template>
  <nav
    class="mobile-secondary-nav"
    :class="`mobile-secondary-nav--${items.length >= 4 ? 'scrollable' : items.length === 2 ? 'two' : 'three'}`"
    aria-label="当前模块二级菜单"
  >
    <RouterLink
      v-for="item in items"
      :key="item.path"
      :ref="(element) => setItemRef(item.path, element)"
      :to="item.path"
      class="mobile-secondary-nav__item"
      :class="{ 'router-link-active': item.path === activePath }"
    >{{ item.label }}</RouterLink>
  </nav>
</template>

<script setup lang="ts">
import { nextTick, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import type { CustomerNavChild } from '@/config/customerNavigation'

const props = defineProps<{
  items: readonly CustomerNavChild[]
  activePath: string
}>()

const itemElements = new Map<string, Element>()

function setItemRef(path: string, element: Element | ComponentPublicInstance | null) {
  if (element instanceof Element) {
    itemElements.set(path, element)
    return
  }

  if (element) {
    itemElements.set(path, (element as ComponentPublicInstance).$el as Element)
    return
  }

  itemElements.delete(path)
}

watch(
  () => props.activePath,
  async (activePath) => {
    await nextTick()
    itemElements.get(activePath)?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
  },
  { immediate: true, flush: 'post' }
)
</script>

<style scoped lang="scss">
.mobile-secondary-nav {
  position: fixed;
  inset: auto 0 0;
  z-index: 18;
  display: flex;
  min-height: calc(58px + env(safe-area-inset-bottom));
  padding: 4px 8px env(safe-area-inset-bottom);
  overflow-x: auto;
  overflow-y: hidden;
  background: rgba(255, 255, 255, 0.96);
  border-top: 1px solid var(--ui-line);
  box-shadow: 0 -2px 8px rgba(41, 52, 61, 0.04);
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  backdrop-filter: blur(14px);
}

.mobile-secondary-nav__item {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1 0 0;
  min-width: 0;
  min-height: 44px;
  padding: 3px 8px;
  overflow: hidden;
  color: var(--ui-text-muted);
  border-radius: 10px;
  font-size: 12px;
  text-align: center;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
  scroll-snap-align: center;

  &.router-link-active {
    color: var(--ui-accent-hover);
    background: var(--ui-accent-soft);
  }
}

.mobile-secondary-nav--two .mobile-secondary-nav__item {
  flex-basis: 50%;
}

.mobile-secondary-nav--three .mobile-secondary-nav__item {
  flex-basis: 33.333%;
}

.mobile-secondary-nav--scrollable .mobile-secondary-nav__item {
  flex: 0 0 auto;
  min-width: 108px;
}
</style>
