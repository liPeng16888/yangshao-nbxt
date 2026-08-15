<template>
  <CoefficientCalculationAccountController v-if="accountId" :key="accountId" :account-id="accountId" />
  <section v-else class="panel coefficient-account-pending" data-testid="coefficient-account-pending" role="status" aria-live="polite">正在确认登录账号…</section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import CoefficientCalculationAccountController from '@/components/coefficient/CoefficientCalculationAccountController.vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const accountId = computed(() => {
  const id = authStore.user?.id
  return typeof id === 'string' && id.length > 0 && id.trim() === id ? id : null
})
</script>
