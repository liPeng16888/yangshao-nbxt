<script setup lang="ts">
const props = withDefaults(defineProps<{
  title: string
  subtitle?: string
  status?: string
  selected?: boolean
  selectable?: boolean
  expanded?: boolean
}>(), {
  subtitle: '',
  status: '',
  selected: false,
  selectable: false,
  expanded: false
})

const emit = defineEmits<{
  select: []
  'update:expanded': [value: boolean]
}>()

function select() {
  if (props.selectable) {
    emit('select')
  }
}
</script>

<template>
  <article
    class="mobile-record-card"
    :class="{ 'mobile-record-card--selected': selected, 'mobile-record-card--expanded': expanded }"
    :role="selectable || selected ? 'option' : undefined"
    :aria-selected="selected ? true : undefined"
  >
    <header class="mobile-record-card__header">
      <button
        class="mobile-record-card__summary mobile-touch-target"
        type="button"
        :aria-label="selectable ? `选择${title}` : title"
        @click="select"
      >
        <span class="mobile-record-card__copy">
          <strong>{{ title }}</strong>
          <small v-if="subtitle">{{ subtitle }}</small>
        </span>
        <span v-if="status" class="mobile-record-card__status">{{ status }}</span>
        <slot name="summary" />
      </button>
      <button
        class="mobile-record-card__toggle mobile-touch-target"
        type="button"
        :aria-expanded="expanded"
        :aria-label="`${expanded ? '收起' : '展开'}${title}详情`"
        @click.stop="emit('update:expanded', !expanded)"
      >
        <span aria-hidden="true">{{ expanded ? '⌃' : '⌄' }}</span>
      </button>
    </header>

    <section v-if="expanded" class="mobile-record-card__details">
      <slot name="details" />
    </section>

    <footer v-if="$slots.actions" class="mobile-record-card__actions">
      <slot name="actions" />
    </footer>
  </article>
</template>
