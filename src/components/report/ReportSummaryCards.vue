<template>
  <div class="summary-cards" :class="{ 'summary-cards--mobile': mobile }">
    <div v-for="item in items" :key="item.label" class="summary-card">
      <span>{{ item.label }}</span>
      <strong>{{ item.value }}</strong>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  items: Array<{ label: string; value: string | number }>
  mobile?: boolean
}>()
</script>

<style scoped lang="scss">
.summary-cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(160px, 1fr));
  gap: 12px;
}

.summary-cards--mobile {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.summary-card {
  min-width: 0;
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
    overflow-wrap: anywhere;
  }
}

@media (max-width: 900px) {
  .summary-cards {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 767px) {
  .summary-card {
    padding: 14px;

    strong {
      font-size: clamp(18px, 5.8vw, 24px);
    }
  }
}
</style>
