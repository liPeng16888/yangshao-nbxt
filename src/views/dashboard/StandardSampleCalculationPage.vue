<template>
  <StandardSampleAccountController
    v-if="accountId"
    :key="accountId"
    :account-id="accountId"
  />
  <section v-else class="panel standard-account-pending" data-testid="standard-account-pending" role="status" aria-live="polite">
    正在确认登录账号…
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import StandardSampleAccountController from '@/components/standard-sample/StandardSampleAccountController.vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

const accountId = computed(() => {
  const id = authStore.user?.id
  return typeof id === 'string' && id.length > 0 && id.trim() === id ? id : null
})
</script>

<style scoped lang="scss">
.standard-account-pending {
  color: var(--ui-text-muted);
}
</style>
