<template>
  <div class="image-list">
    <template v-if="safeImages.length">
      <el-image
        v-for="image in safeImages"
        :key="image"
        :src="image"
        :preview-src-list="safeImages"
        fit="cover"
        class="image-thumb"
      />
    </template>
    <span v-else class="empty-text">无信息</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { isSafeBlacklistImageUrl } from '@/utils/blacklistImages'

const props = defineProps<{
  images: string[]
}>()

const safeImages = computed(() => props.images.filter(isSafeBlacklistImageUrl))
</script>

<style scoped lang="scss">
.image-list {
  display: flex;
  gap: 6px;
}

.image-thumb {
  width: 44px;
  height: 44px;
  border-radius: 6px;
}
</style>
