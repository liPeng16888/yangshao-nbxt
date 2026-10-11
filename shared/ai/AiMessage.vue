<template>
  <div v-if="role === 'assistant'" class="ys-ai-message ys-ai-markdown" v-html="formatted" />
  <p v-else class="ys-ai-message ys-ai-message--plain">{{ content }}</p>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { renderAiMarkdown } from './markdown'

const props = defineProps<{ role: string; content: string }>()
const formatted = computed(() => props.role === 'assistant' ? renderAiMarkdown(props.content) : '')
</script>

<style scoped>
.ys-ai-message {
  min-width: 0;
  max-width: 100%;
  margin: 0;
  color: var(--ui-text, #29343d);
  font-family: var(--ui-font, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif), "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji";
  font-size: 14px;
  line-height: 1.75;
  overflow-wrap: anywhere;
}
.ys-ai-message--plain { white-space: pre-wrap; }
.ys-ai-markdown { white-space: normal; }
.ys-ai-markdown :deep(p) { margin: 10px 0; }
.ys-ai-markdown :deep(h1), .ys-ai-markdown :deep(h2), .ys-ai-markdown :deep(h3),
.ys-ai-markdown :deep(h4), .ys-ai-markdown :deep(h5), .ys-ai-markdown :deep(h6) {
  margin: 18px 0 9px;
  color: var(--ui-text, #29343d);
  font-weight: 600;
  line-height: 1.55;
}
.ys-ai-markdown :deep(h1) { font-size: 18px; }
.ys-ai-markdown :deep(h2) { font-size: 16px; }
.ys-ai-markdown :deep(h3) { font-size: 15px; }
.ys-ai-markdown :deep(h4), .ys-ai-markdown :deep(h5), .ys-ai-markdown :deep(h6) { font-size: 14px; }
.ys-ai-markdown :deep(strong) { font-weight: 600; }
.ys-ai-markdown :deep(ul), .ys-ai-markdown :deep(ol) { margin: 10px 0; padding-left: 22px; }
.ys-ai-markdown :deep(ul) { list-style: disc; }
.ys-ai-markdown :deep(ol) { list-style: decimal; }
.ys-ai-markdown :deep(li) { margin: 5px 0; }
.ys-ai-markdown :deep(li > p), .ys-ai-markdown :deep(li > ul), .ys-ai-markdown :deep(li > ol) { margin: 6px 0; }
.ys-ai-markdown :deep(hr) { margin: 18px 0; border: 0; border-top: 1px solid var(--ui-line, #dce2e6); }
.ys-ai-markdown :deep(blockquote) {
  margin: 12px 0;
  padding: 1px 12px;
  border-left: 3px solid var(--ui-accent-line, #c4d1da);
  background: var(--ui-surface-subtle, #f7f8f9);
  color: var(--ui-text-secondary, #4d5963);
}
.ys-ai-markdown :deep(a) { color: var(--ui-accent-hover, #4a6273); text-decoration: underline; text-underline-offset: 3px; }
.ys-ai-markdown :deep(a:focus-visible), .ys-ai-markdown :deep(.ys-ai-markdown__table:focus-visible) { outline: 2px solid var(--ui-accent, #5e7687); outline-offset: 2px; }
.ys-ai-markdown :deep(code) {
  padding: 2px 4px;
  border-radius: 4px;
  background: var(--ui-surface-subtle, #f7f8f9);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji";
  font-size: 12px;
}
.ys-ai-markdown :deep(pre) {
  max-width: 100%;
  margin: 12px 0;
  padding: 10px 12px;
  overflow-x: auto;
  border: 1px solid var(--ui-line-soft, #e9edef);
  border-radius: 6px;
  background: var(--ui-surface-subtle, #f7f8f9);
  white-space: pre;
  overflow-wrap: normal;
}
.ys-ai-markdown :deep(pre code) { padding: 0; background: transparent; }
.ys-ai-markdown :deep(.ys-ai-markdown__table) { max-width: 100%; margin: 12px 0; overflow-x: auto; }
.ys-ai-markdown :deep(table) { width: 100%; min-width: 320px; border-collapse: collapse; font-size: 12px; }
.ys-ai-markdown :deep(th), .ys-ai-markdown :deep(td) { min-width: 80px; padding: 8px 10px; border: 1px solid var(--ui-line, #dce2e6); text-align: left; vertical-align: top; }
.ys-ai-markdown :deep(th) { background: var(--ui-surface-subtle, #f7f8f9); font-weight: 600; }
.ys-ai-markdown :deep(> :first-child) { margin-top: 0; }
.ys-ai-markdown :deep(> :last-child) { margin-bottom: 0; }
</style>
