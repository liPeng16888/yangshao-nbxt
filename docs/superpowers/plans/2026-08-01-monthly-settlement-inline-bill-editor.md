# 月结款账单底部直接编辑 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除月结款导出弹窗中间编辑表，在底部紧凑账单直接编辑标题、日期、元素和数量，并正确归并同一样品的铝、硅、铝硅比。

**Architecture:** 元素归并放在单个样品转换为月结每日统计的边界；账单草稿继续负责临时编辑和重算。导出弹窗只保留顶部批量单价区和底部可编辑预览，PNG 渲染继续消费同一草稿。

**Tech Stack:** Vue 3、TypeScript、Element Plus、Vitest、Canvas PNG renderer。

## Global Constraints

- 每行最多五组元素，超过后换行。
- 底部列固定为 `日期 | 元素 | 数量 | 价格`；价格为只读小计。
- 顶部单价和所有草稿编辑只对本次导出生效。
- 不修改数据库结构，不提交、不推送、不部署。

---

### Task 1: 统一前后端铝硅比单样品归并

**Files:**
- Modify: `src/utils/financeBills.ts`
- Test: `src/utils/financeBills.test.ts`

**Interfaces:**
- Consumes: `SampleBlock.inputs.elementNote` 与 `parseLabElementKeys`。
- Produces: `getMonthlySettlementDailyRowsFromSheet(sheet)` 中归并后的 `elementCounts`。

- [ ] 添加失败测试：同一样品选择铝、硅、铝硅比时只产生铝硅比计数。
- [ ] 添加失败测试：只选择铝和硅时仍分别统计。
- [ ] 在前端 `getMonthlyElementCounts` 中复制后端现有三选归并规则。
- [ ] 运行 `pnpm exec vitest run src/utils/financeBills.test.ts`。

### Task 2: 将编辑能力移动到底部紧凑账单

**Files:**
- Modify: `src/components/finance/MonthlySettlementBillExportDialog.vue`
- Test: `src/components/finance/MonthlySettlementBillExportDialog.test.ts`

**Interfaces:**
- Consumes: `updateMonthlyBillEntry(draft, entryId, patch)` 与 `createMonthlyBillTableLayout(draft, 5)`。
- Produces: 底部标题、日期、元素和数量的直接编辑事件；价格继续读取 `entry.subtotal`。

- [ ] 修改组件测试，先确认原中间编辑表不再存在。
- [ ] 添加失败测试：底部日期、元素、数量控件调用后更新草稿和价格。
- [ ] 删除 `.bill-entry-editor`，将标题和明细单元格替换为紧凑输入控件。
- [ ] 保持汇总、总金额、账期和 PNG 导出逻辑不变。
- [ ] 运行弹窗和账单工具专项测试。

### Task 3: 回归与视觉验证

**Files:**
- Verify: `src/utils/monthlySettlementBillPng.ts`
- Verify: `src/views/dashboard/FinanceMonthlySettlementPage.vue`

**Interfaces:**
- Consumes: 完整月结明细和最终 `MonthlyBillDraft`。
- Produces: 与底部预览一致的 PNG。

- [ ] 运行月结账单、财务统计和页面相关 Vitest。
- [ ] 运行 `pnpm exec vue-tsc --noEmit`、`pnpm build` 和 `git diff --check`。
- [ ] 在内置浏览器检查桌面与 390px 窄屏弹窗，确认无溢出和控制台错误。
