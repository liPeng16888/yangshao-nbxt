<template>
  <router-view />
  <AccessGuardDialog />
  <AccessGuardSettingsDialog />
</template>

<script setup lang="ts">
import AccessGuardDialog from '@/components/access/AccessGuardDialog.vue'
import AccessGuardSettingsDialog from '@/components/access/AccessGuardSettingsDialog.vue'
</script>
