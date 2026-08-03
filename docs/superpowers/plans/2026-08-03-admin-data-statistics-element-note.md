# 后台数据统计化验元素列 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在后台“数据统计”表的费用状态与铁之间显示前端同步的化验元素，并可查看其修改历史。

**Architecture:** 数据统计接口已经将每个样品的 `inputs.elementNote` 返回给后台。页面在费用状态列后增加一个固定的只读表格列，直接展示该字段并复用现有 `openHistory` 调用；不改变接口、数据库或前端录入。

**Tech Stack:** Vue 3、TypeScript、Element Plus、Vitest、Vue Test Utils。

## Global Constraints

- 只修改后台数据统计页面及其专属测试。
- 化验元素列固定在费用状态和铁之间。
- 非空值原样显示；空值显示“未选择”。
- 历史查询必须请求 `fields=elementNote`。
- 不修改前端样品保存、后端接口或数据库。

---

### Task 1: 数据统计化验元素列

**Files:**
- Create: `admin/src/views/DataStatisticsPage.test.ts`
- Modify: `admin/src/views/DataStatisticsPage.vue:55-64`

**Interfaces:**
- Consumes: `sheet.sampleBlocks[].inputs.elementNote: string | undefined`，以及现有 `request.get(url, { params })`。
- Produces: 一个固定的“化验元素”表格列；开启历史查看时调用 `openHistory(row.id, 'elementNote', '化验元素')`。

- [ ] **Step 1: 写出失败的组件测试**

建立包含一条 `elementNote: '铝、硅、铝硅比'` 样品和一条缺失 `elementNote` 样品的页面测试。表格桩组件必须渲染列顺序、单元格插槽与按钮，断言：

```ts
expect(columnLabels).toEqual(expect.arrayContaining(['费用状态', '化验元素', '铁']))
expect(columnLabels.indexOf('化验元素')).toBe(columnLabels.indexOf('费用状态') + 1)
expect(wrapper.text()).toContain('铝、硅、铝硅比')
expect(wrapper.text()).toContain('未选择')
```

新增历史测试：开启 `historyLookupEnabled` 后，点击化验元素单元格的历史按钮，断言实际请求为：

```ts
expect(api.request.get).toHaveBeenCalledWith('/admin/data-statistics/cell-history', {
  params: { blockId: 'block-with-elements', fields: 'elementNote' }
})
```

该测试会在实现前失败，因为页面尚未渲染“化验元素”列，也不存在对应的历史操作。

- [ ] **Step 2: 运行失败测试**

运行：

```bash
pnpm exec vitest run admin/src/views/DataStatisticsPage.test.ts
```

预期：测试失败，原因是找不到“化验元素”列或相应历史按钮，而不是测试装配错误。

- [ ] **Step 3: 最小化实现固定列**

在费用状态列结束后、`v-for="column in elementColumns"` 前加入：

```vue
<el-table-column label="化验元素" min-width="160">
  <template #default="{ row }">
    <div class="history-cell">
      <span>{{ row.inputs.elementNote || '未选择' }}</span>
      <el-button v-if="historyLookupEnabled" link type="primary" @click="openHistory(row.id, 'elementNote', '化验元素')">历史</el-button>
    </div>
  </template>
</el-table-column>
```

不引入新状态、接口或类型；沿用现有的 `fieldLabels.elementNote` 显示历史记录字段名。

- [ ] **Step 4: 运行测试验证通过**

运行：

```bash
pnpm exec vitest run admin/src/views/DataStatisticsPage.test.ts
```

预期：所有该文件测试通过，且两个行为断言都生效。

- [ ] **Step 5: 构建与浏览器核验**

运行：

```bash
pnpm build:admin
```

然后重新加载 `http://127.0.0.1:5174/admin/data`，确认“化验元素”位于费用状态与铁之间，现有示例样品显示其同步值。

- [ ] **Step 6: 提交已验证变更**

```bash
git add admin/src/views/DataStatisticsPage.vue admin/src/views/DataStatisticsPage.test.ts docs/superpowers/plans/2026-08-03-admin-data-statistics-element-note.md
git commit -m "feat: show lab elements in admin statistics"
```
