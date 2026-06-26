<template>
  <div class="image-list">
    <template v-if="images.length">
      <el-image
        v-for="image in images"
        :key="image"
        :src="image"
        :preview-src-list="images"
        fit="cover"
        class="image-thumb"
      />
    </template>
    <span v-else class="empty-text">无信息</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  images: string[]
}>()
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
