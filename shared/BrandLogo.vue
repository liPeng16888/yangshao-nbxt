<template>
  <img
    class="brand-logo"
    :src="logoUrl"
    alt="仰韶化验室标志"
    :width="size"
    :height="size"
    decoding="async"
  />
</template>

<script setup lang="ts">
import logoUrl from './assets/yangshao-logo-seal.png'

withDefaults(defineProps<{ size?: number }>(), { size: 32 })
</script>

<style scoped>
.brand-logo {
  display: block;
  flex: 0 0 auto;
  object-fit: contain;
}
</style>
