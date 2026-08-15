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
import { isOwnedImagePreview } from '@/utils/blacklistImages'

const props = defineProps<{
  images: string[]
}>()

const safeImages = computed(() => props.images.filter(isSafeImageUrl))

function isSafeImageUrl(value: string) {
  const source = value.trim()
  if (!source) return false
  if (source.startsWith('blob:')) return isOwnedImagePreview(source)
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(source)) return true
  try {
    const parsed = new URL(source, 'https://local.invalid')
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
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
