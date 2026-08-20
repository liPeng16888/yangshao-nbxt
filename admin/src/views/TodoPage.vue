<template>
  <div class="page">
    <section class="panel todo-tabs">
      <div class="panel__header"><strong>待办事项</strong></div>
      <el-tabs v-model="activeTodoType">
        <el-tab-pane label="样品修改申请" name="sampleChanges">
          <LabSampleChangeRequestsPanel v-if="activeTodoType === 'sampleChanges'" />
        </el-tab-pane>
        <el-tab-pane label="删除申请" name="deletions">
          <FinanceDeletionRequestsPanel v-if="activeTodoType === 'deletions'" />
        </el-tab-pane>
      </el-tabs>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import FinanceDeletionRequestsPanel from '../components/todos/FinanceDeletionRequestsPanel.vue'
import LabSampleChangeRequestsPanel from '../components/todos/LabSampleChangeRequestsPanel.vue'

const activeTodoType = ref<'sampleChanges' | 'deletions'>('sampleChanges')
</script>

<style scoped>
.todo-tabs { overflow: visible; }
.todo-tabs :deep(.el-tabs__header) { padding: 0 18px; }
.todo-tabs :deep(.el-tabs__content) { overflow: visible; }
.todo-tabs :deep(.page) { padding: 0; }
.todo-tabs :deep(.panel) { box-shadow: none; }
</style>
