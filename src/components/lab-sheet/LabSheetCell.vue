<template>
  <div class="lab-sheet-cell" :class="[`lab-sheet-cell--${kind}`, section && `lab-sheet-cell--${section}`]">
    <slot />
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    kind?: 'input' | 'formula' | 'label' | 'readonly'
    section?: 'metal' | 'water' | 'remark' | 'default'
  }>(),
  {
    kind: 'readonly',
    section: 'default'
  }
)
</script>

<style scoped lang="scss">
.lab-sheet-cell {
  min-width: 0;
}
</style>
