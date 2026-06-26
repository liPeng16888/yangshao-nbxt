<template>
  <div class="summary-cards">
    <div v-for="item in items" :key="item.label" class="summary-card">
      <span>{{ item.label }}</span>
      <strong>{{ item.value }}</strong>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  items: Array<{ label: string; value: string | number }>
}>()
</script>

<style scoped lang="scss">
.summary-cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(160px, 1fr));
  gap: 12px;
}

.summary-card {
  padding: 16px;
  background: #ffffff;
  border: 1px solid #dce5ef;
  border-radius: 8px;

  span {
    display: block;
    color: #64748b;
    font-size: 13px;
  }

  strong {
    display: block;
    margin-top: 8px;
    color: #10233f;
    font-size: 24px;
  }
}

@media (max-width: 900px) {
  .summary-cards {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
