<template>
  <router-view />
  <AccessGuardDialog />
  <AccessGuardSettingsDialog />
  <PwaPrompts />
</template>

<script setup lang="ts">
import AccessGuardDialog from '@/components/access/AccessGuardDialog.vue'
import AccessGuardSettingsDialog from '@/components/access/AccessGuardSettingsDialog.vue'
import PwaPrompts from '@/components/pwa/PwaPrompts.vue'
</script>
