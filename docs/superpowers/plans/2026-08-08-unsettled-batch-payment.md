# 未结款样品批量确认已结款 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在“财务 → 未结款”页面增加带事务保障、二次确认和完整变更日志的批量结款功能，同时保留单条结款。

**Architecture:** 服务端增加一个接收 `blockIds` 的批量端点，在 Prisma 事务中统一校验、更新样品并写日志；前端 API 对正式环境调用该端点，对模拟环境先完整校验再保存。Pinia 仓库负责批量处理中状态、列表移除和数据表缓存同步，页面只负责选择、金额汇总和确认交互。

**Tech Stack:** Vue 3、TypeScript、Pinia、Element Plus、Axios、NestJS、Prisma、Vitest、Vue Test Utils

## Global Constraints

- 保留现有单条结款复选框和跳转功能。
- 表头全选只作用于当前客户筛选后的可见行；客户筛选变化时清空选择。
- 无选择时禁用批量按钮，确认框显示选中数量和合计金额。
- 任一目标无效时服务端整批回滚，不允许部分完成。
- 单条和批量结款互斥，操作过程中不得重复提交。
- 每个成功更新的样品必须各写一条 `paymentStatus` 变更日志。
- 不修改月结款、预存款和管理后台催款流程。
- 保留工作区现有未提交改动，只编辑本计划列出的文件。

---

## File Structure

- `server/src/finance/finance.service.ts`：批量结款事务、目标校验、更新和日志写入。
- `server/src/finance/finance.controller.ts`：暴露批量结款 HTTP 端点。
- `server/src/finance/finance.service.test.ts`：服务端批量成功、去重、回滚条件和单条回归测试。
- `src/api/financeBills.ts`：正式及模拟环境的批量结款请求。
- `src/api/financeBills.test.ts`：验证正式环境请求路径和负载。
- `src/stores/financeBills.ts`：批量状态、列表更新和当前化验表同步。
- `src/stores/financeBills.test.ts`：仓库成功、失败和互斥状态测试。
- `src/views/dashboard/FinanceUnsettledPage.vue`：批量选择列、按钮、确认框及筛选清空选择。
- `src/views/dashboard/FinanceUnsettledPage.test.ts`：页面选择、金额汇总、确认及筛选行为测试。

---

### Task 1: 服务端事务批量结款

**Files:**
- Modify: `server/src/finance/finance.service.test.ts`
- Modify: `server/src/finance/finance.service.ts:124-153`
- Modify: `server/src/finance/finance.controller.ts:40-53`

**Interfaces:**
- Consumes: `PrismaService.$transaction`, `calculateResults(inputs, parameters)`, `FinanceService.blockDto(block)`。
- Produces: `FinanceService.markFrontendSamplesPaid(frontendUserId: string, blockIds: string[])`，响应数组每项包含 `id`、`index`、`readonly`、`inputs`、`results` 和 `parameterSnapshot`；以及 `PUT /finance/unsettled-samples/paid`。

- [ ] **Step 1: Write the failing service tests**

在 `server/src/finance/finance.service.test.ts` 增加可执行的 Prisma 事务模拟，分别验证整批成功和失败不更新。核心断言如下：

```ts
it('marks unique unsettled samples as paid in one transaction and logs every block', async () => {
  const result = await service.markFrontendSamplesPaid('front-1', ['block-1', 'block-1', 'block-2'])

  expect(transaction.sampleBlock.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: { in: ['block-1', 'block-2'] } }
  }))
  expect(transaction.sampleBlock.update).toHaveBeenCalledTimes(2)
  expect(transaction.cellChangeLog.create).toHaveBeenCalledTimes(2)
  expect(result.map((block) => block.id)).toEqual(['block-1', 'block-2'])
})

it.each([
  { blockIds: [], message: '请选择需要结款的样品' },
  { blockIds: ['missing'], message: '部分样品不存在或无权操作' },
  { blockIds: ['already-paid'], message: '部分样品已不是未结款状态' }
])('rejects an invalid batch without updating any sample', async ({ blockIds, message }) => {
  await expect(service.markFrontendSamplesPaid('front-1', blockIds)).rejects.toThrow(message)
  expect(transaction.sampleBlock.update).not.toHaveBeenCalled()
  expect(transaction.cellChangeLog.create).not.toHaveBeenCalled()
})
```

事务模拟必须让 `$transaction` 调用回调并传入同一组 `transaction.sampleBlock`、`transaction.cellChangeLog` mock；失败测试为 `findMany` 返回缺失、其他账号或 `paymentStatus !== '未结款'` 的记录。

- [ ] **Step 2: Run the service tests and verify RED**

Run:

```bash
node '.worktrees/medicine-inventory/node_modules/.pnpm/vitest@2.1.9_@types+node@22.20.0_jsdom@25.0.1_sass@1.101.0_terser@5.48.0/node_modules/vitest/vitest.mjs' run --dir server/src server/src/finance/finance.service.test.ts
```

Expected: FAIL because `markFrontendSamplesPaid` does not exist.

- [ ] **Step 3: Implement the minimal transaction service**

在 `FinanceService` 中增加：

```ts
async markFrontendSamplesPaid(frontendUserId: string, rawBlockIds: string[]) {
  const blockIds = Array.from(new Set((Array.isArray(rawBlockIds) ? rawBlockIds : []).map((id) => String(id || '').trim()).filter(Boolean)))
  if (!blockIds.length) throw new BadRequestException('请选择需要结款的样品')

  return this.prisma.$transaction(async (transaction) => {
    const blocks = await transaction.sampleBlock.findMany({
      where: { id: { in: blockIds } },
      include: { sheet: true }
    })
    if (blocks.length !== blockIds.length || blocks.some((block) => block.sheet.frontendUserId !== frontendUserId)) {
      throw new NotFoundException('部分样品不存在或无权操作')
    }
    const blocksById = new Map(blocks.map((block) => [block.id, block]))
    const orderedBlocks = blockIds.map((id) => blocksById.get(id)!)
    if (orderedBlocks.some((block) => ((block.inputs || {}) as Record<string, unknown>).paymentStatus !== '未结款')) {
      throw new BadRequestException('部分样品已不是未结款状态，请刷新后重试')
    }

    const savedBlocks = []
    for (const block of orderedBlocks) {
      const oldInputs = (block.inputs || {}) as Record<string, unknown>
      const inputs = { ...oldInputs, paymentStatus: '已结款' }
      const parameters = (block.parameterSnapshot || block.sheet.parameters || defaultLabParameters) as typeof defaultLabParameters
      const saved = await transaction.sampleBlock.update({
        where: { id: block.id },
        data: { inputs, results: calculateResults(inputs, parameters) }
      })
      await transaction.cellChangeLog.create({
        data: {
          sheetId: block.sheetId,
          blockId: block.id,
          frontendUserId,
          changedById: frontendUserId,
          field: 'paymentStatus',
          oldValue: this.jsonValue(oldInputs.paymentStatus ?? null),
          newValue: '已结款'
        }
      })
      savedBlocks.push(saved)
    }
    return savedBlocks.map((block) => this.blockDto(block))
  })
}
```

把现有 `markFrontendSamplePaid` 改为调用批量方法并返回第一项：

```ts
async markFrontendSamplePaid(frontendUserId: string, blockId: string) {
  const [saved] = await this.markFrontendSamplesPaid(frontendUserId, [blockId])
  return saved
}
```

控制器在动态 `:blockId` 路由之前增加：

```ts
@Put('finance/unsettled-samples/paid')
@Roles(UserRole.FRONTEND_USER)
markSamplesPaid(@CurrentUserInfo() user: CurrentUser, @Body() body: { blockIds?: string[] }) {
  return this.finance.markFrontendSamplesPaid(user.id, body?.blockIds || [])
}
```

- [ ] **Step 4: Run service tests and verify GREEN**

Run the Task 1 test command.

Expected: all `server/src/finance/finance.service.test.ts` tests PASS, including the existing monthly element tests.

- [ ] **Step 5: Commit the server transaction**

```bash
git add server/src/finance/finance.service.ts server/src/finance/finance.controller.ts server/src/finance/finance.service.test.ts
git commit -m "feat: add transactional batch sample payment"
```

---

### Task 2: 前端批量 API

**Files:**
- Create: `src/api/financeBills.test.ts`
- Modify: `src/api/financeBills.ts:36-57`

**Interfaces:**
- Consumes: `UnsettledSampleRow`, `SampleBlock`, Axios `request.put`, mock `getLabSheetByDate` 和 `saveSampleBlock`。
- Produces: `markSamplesAsPaid(rows: UnsettledSampleRow[]): Promise<SampleBlock[]>`。

- [ ] **Step 1: Write the failing formal API test**

创建 `src/api/financeBills.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UnsettledSampleRow } from '@/types/financeBills'

const requestMock = vi.hoisted(() => ({ put: vi.fn() }))
vi.mock('@/utils/request', () => ({ default: requestMock, useMocks: false }))

import { markSamplesAsPaid } from './financeBills'

const rows: UnsettledSampleRow[] = [
  { date: '2026-08-08', sheetId: 'sheet-1', blockId: 'block-1', sequence: '001', sampleNumber: '样品1', customer: '客户甲', amount: 80 },
  { date: '2026-08-08', sheetId: 'sheet-1', blockId: 'block-2', sequence: '002', sampleNumber: '样品2', customer: '客户乙', amount: 120 }
]

describe('finance bills batch payment API', () => {
  beforeEach(() => requestMock.put.mockReset())

  it('sends unique block ids to the batch payment endpoint', async () => {
    requestMock.put.mockResolvedValue([{ id: 'block-1' }, { id: 'block-2' }])
    await markSamplesAsPaid([...rows, rows[0]])
    expect(requestMock.put).toHaveBeenCalledWith('/finance/unsettled-samples/paid', {
      blockIds: ['block-1', 'block-2']
    })
  })
})
```

- [ ] **Step 2: Run the API test and verify RED**

Run:

```bash
node '.worktrees/medicine-inventory/node_modules/.pnpm/vitest@2.1.9_@types+node@22.20.0_jsdom@25.0.1_sass@1.101.0_terser@5.48.0/node_modules/vitest/vitest.mjs' run --dir src src/api/financeBills.test.ts
```

Expected: FAIL because `markSamplesAsPaid` is not exported.

- [ ] **Step 3: Implement formal and mock batch requests**

在 `src/api/financeBills.ts` 增加：

```ts
export async function markSamplesAsPaid(rows: UnsettledSampleRow[]): Promise<SampleBlock[]> {
  const uniqueRows = Array.from(new Map(rows.map((row) => [row.blockId, row])).values())
  if (!uniqueRows.length) return []
  if (!useMocks) {
    return request.put('/finance/unsettled-samples/paid', { blockIds: uniqueRows.map((row) => row.blockId) })
  }

  const sheetsByDate = new Map<string, Awaited<ReturnType<typeof getLabSheetByDate>>>()
  for (const row of uniqueRows) {
    if (!sheetsByDate.has(row.date)) sheetsByDate.set(row.date, await getLabSheetByDate(row.date))
  }
  const targets = uniqueRows.map((row) => {
    const sheet = sheetsByDate.get(row.date)!
    const block = sheet.sampleBlocks.find((item) => item.id === row.blockId)
    if (!block || block.inputs.paymentStatus !== '未结款') throw new Error('部分样品已不是未结款状态，请刷新后重试')
    return { sheet, block }
  })
  const savedBlocks: SampleBlock[] = []
  for (const { sheet, block } of targets) {
    savedBlocks.push(await saveSampleBlock(sheet.id, {
      id: block.id,
      baseUpdatedAt: block.updatedAt,
      baseInputs: { paymentStatus: block.inputs.paymentStatus || '' },
      changedFields: { paymentStatus: '已结款' }
    }))
  }
  return savedBlocks
}
```

保留 `markSampleAsPaid` 供单条流程使用。

- [ ] **Step 4: Run the API test and verify GREEN**

Run the Task 2 test command.

Expected: `src/api/financeBills.test.ts` PASS.

- [ ] **Step 5: Commit the frontend API**

```bash
git add src/api/financeBills.ts src/api/financeBills.test.ts
git commit -m "feat: add frontend batch payment API"
```

---

### Task 3: Pinia 批量结款状态和缓存同步

**Files:**
- Modify: `src/stores/financeBills.test.ts`
- Modify: `src/stores/financeBills.ts:1-95,170-195`

**Interfaces:**
- Consumes: `markSamplesAsPaid(rows)` from Task 2 and existing `syncLoadedLabSheet(row, savedBlock)`。
- Produces: `settlingBatch: Ref<boolean>`, `settleRows(rows: UnsettledSampleRow[]): Promise<void>`, `isSettling: ComputedRef<boolean>`。

- [ ] **Step 1: Write failing store tests**

把 `markSamplesAsPaid: vi.fn()` 加到现有 API mock，并增加两个测试：

```ts
it('removes every paid row and syncs matching blocks after a successful batch', async () => {
  const secondRow = { ...row, blockId: '2026-06-25-2', sequence: '002', sampleNumber: '块矿', amount: 120 }
  const store = useFinanceBillsStore()
  store.unsettledRows = [row, secondRow]
  apiMocks.markSamplesAsPaid.mockResolvedValue([
    makeBlockWithId(row.blockId, '已结款'),
    makeBlockWithId(secondRow.blockId, '已结款')
  ])

  await store.settleRows([row, secondRow])

  expect(store.unsettledRows).toEqual([])
  expect(store.settlingBatch).toBe(false)
})

it('keeps all rows and restores batch state when the batch request fails', async () => {
  const store = useFinanceBillsStore()
  store.unsettledRows = [row]
  apiMocks.markSamplesAsPaid.mockRejectedValue(new Error('批量失败'))

  await expect(store.settleRows([row])).rejects.toThrow('批量失败')

  expect(store.unsettledRows).toEqual([row])
  expect(store.settlingBatch).toBe(false)
})
```

将测试 helper 改为以下实现，确保返回块能按 `blockId` 与行匹配：

```ts
function makeBlockWithId(id: string, paymentStatus: SampleBlock['inputs']['paymentStatus']): SampleBlock {
  return { ...makeBlock(paymentStatus), id }
}
```

- [ ] **Step 2: Run store tests and verify RED**

Run:

```bash
node '.worktrees/medicine-inventory/node_modules/.pnpm/vitest@2.1.9_@types+node@22.20.0_jsdom@25.0.1_sass@1.101.0_terser@5.48.0/node_modules/vitest/vitest.mjs' run --dir src src/stores/financeBills.test.ts
```

Expected: FAIL because `settleRows` and `settlingBatch` do not exist.

- [ ] **Step 3: Implement batch store behavior**

导入 `computed` 和 `markSamplesAsPaid`，然后增加：

```ts
const settlingBatch = ref(false)
const isSettling = computed(() => Boolean(settlingId.value) || settlingBatch.value)

async function settleRows(rows: UnsettledSampleRow[]) {
  if (!rows.length) return
  settlingBatch.value = true
  try {
    const savedBlocks = await markSamplesAsPaid(rows)
    const savedById = new Map(savedBlocks.map((block) => [block.id, block]))
    rows.forEach((row) => {
      const saved = savedById.get(row.blockId)
      if (saved) syncLoadedLabSheet(row, saved)
    })
    const paidIds = new Set(rows.map((row) => row.blockId))
    unsettledRows.value = unsettledRows.value.filter((item) => !paidIds.has(item.blockId))
  } finally {
    settlingBatch.value = false
  }
}
```

从 store return 暴露 `settlingBatch`、`isSettling` 和 `settleRows`。单条 `settleRow` 保持不变，页面统一使用 `isSettling` 禁用操作。

- [ ] **Step 4: Run store tests and verify GREEN**

Run the Task 3 test command.

Expected: all `src/stores/financeBills.test.ts` tests PASS.

- [ ] **Step 5: Commit the store behavior**

```bash
git add src/stores/financeBills.ts src/stores/financeBills.test.ts
git commit -m "feat: manage batch payment state"
```

---

### Task 4: 未结款页面批量选择与确认

**Files:**
- Create: `src/views/dashboard/FinanceUnsettledPage.test.ts`
- Modify: `src/views/dashboard/FinanceUnsettledPage.vue`

**Interfaces:**
- Consumes: `store.settleRows(rows)`, `store.isSettling`, `UnsettledSampleRow`。
- Produces: 可见批量选择列、`.batch-settle-button` 和确认交互。

- [ ] **Step 1: Write failing component tests**

创建页面测试，通过 Pinia store mock 提供两条记录，并使用 Element Plus 真实组件挂载。覆盖：

```ts
it('keeps the batch button disabled until rows are selected', async () => {
  const wrapper = mountPage()
  const button = wrapper.find('.batch-settle-button')
  expect(button.attributes('disabled')).toBeDefined()

  wrapper.findComponent(ElTable).vm.$emit('selection-change', [rows[0], rows[1]])
  await nextTick()

  expect(button.text()).toContain('批量确认已结款（2）')
  expect(button.attributes('disabled')).toBeUndefined()
})

it('confirms the selected count and total before settling the batch', async () => {
  const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
  const wrapper = mountPage()
  wrapper.findComponent(ElTable).vm.$emit('selection-change', rows)
  await nextTick()
  await wrapper.find('.batch-settle-button').trigger('click')

  expect(confirm).toHaveBeenCalledWith(
    '确认将选中的 2 个样品标记为已结款？合计金额 ¥200.00。',
    '批量确认结款',
    expect.objectContaining({ type: 'warning' })
  )
  expect(storeMock.settleRows).toHaveBeenCalledWith(rows)
})

it('clears selected rows when the customer filter changes', async () => {
  const wrapper = mountPage()
  const table = wrapper.findComponent(ElTable)
  const clearSelection = vi.spyOn(table.vm as never, 'clearSelection')
  wrapper.findComponent(ElSelect).vm.$emit('update:modelValue', ['客户甲'])
  await nextTick()
  expect(clearSelection).toHaveBeenCalled()
})
```

测试还要断言单行 checkbox 继续调用 `settleRow`，防止回归。

- [ ] **Step 2: Run component tests and verify RED**

Run:

```bash
node '.worktrees/medicine-inventory/node_modules/.pnpm/vitest@2.1.9_@types+node@22.20.0_jsdom@25.0.1_sass@1.101.0_terser@5.48.0/node_modules/vitest/vitest.mjs' run --dir src src/views/dashboard/FinanceUnsettledPage.test.ts
```

Expected: FAIL because the batch button, selection handler and `settleRows` call do not exist.

- [ ] **Step 3: Implement the page interaction**

模板改动：

```vue
<el-button
  class="batch-settle-button"
  type="primary"
  :disabled="!selectedRows.length || store.isSettling"
  :loading="store.settlingBatch"
  @click="handleBatchSettle"
>
  批量确认已结款<span v-if="selectedRows.length">（{{ selectedRows.length }}）</span>
</el-button>

<el-table
  ref="tableRef"
  :data="filteredRows"
  row-key="blockId"
  border
  v-loading="store.loading"
  empty-text="暂无未结款样品"
  @selection-change="handleSelectionChange"
>
  <el-table-column type="selection" width="52" />
```

单行 checkbox 的禁用条件改为 `store.isSettling`。脚本增加：

```ts
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { TableInstance } from 'element-plus'

const tableRef = ref<TableInstance>()
const selectedRows = ref<UnsettledSampleRow[]>([])

function handleSelectionChange(rows: UnsettledSampleRow[]) {
  selectedRows.value = rows
}

watch(selectedCustomers, async () => {
  selectedRows.value = []
  await nextTick()
  tableRef.value?.clearSelection()
})

async function handleBatchSettle() {
  if (!selectedRows.value.length) return
  const rows = [...selectedRows.value]
  const total = rows.reduce((sum, row) => sum + row.amount, 0)
  await ElMessageBox.confirm(
    `确认将选中的 ${rows.length} 个样品标记为已结款？合计金额 ¥${total.toFixed(2)}。`,
    '批量确认结款',
    { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' }
  )
  await store.settleRows(rows)
  selectedRows.value = []
  tableRef.value?.clearSelection()
  ElMessage.success(`已将 ${rows.length} 个样品同步为已结款`)
}
```

- [ ] **Step 4: Run component tests and verify GREEN**

Run the Task 4 test command.

Expected: all `FinanceUnsettledPage.test.ts` tests PASS.

- [ ] **Step 5: Commit the page interaction**

```bash
git add src/views/dashboard/FinanceUnsettledPage.vue src/views/dashboard/FinanceUnsettledPage.test.ts
git commit -m "feat: add unsettled batch payment controls"
```

---

### Task 5: 全量验证和本地页面复核

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: Tasks 1-4 complete implementation.
- Produces: test, build and browser evidence for the accepted design.

- [ ] **Step 1: Run all frontend tests**

```bash
node '.worktrees/medicine-inventory/node_modules/.pnpm/vitest@2.1.9_@types+node@22.20.0_jsdom@25.0.1_sass@1.101.0_terser@5.48.0/node_modules/vitest/vitest.mjs' run --dir src --reporter=dot --silent
```

Expected: all frontend test files PASS with zero failed tests.

- [ ] **Step 2: Run all server tests**

```bash
node '.worktrees/medicine-inventory/node_modules/.pnpm/vitest@2.1.9_@types+node@22.20.0_jsdom@25.0.1_sass@1.101.0_terser@5.48.0/node_modules/vitest/vitest.mjs' run --dir server/src --reporter=dot --silent
```

Expected: all server test files PASS with zero failed tests.

- [ ] **Step 3: Build all three applications**

```bash
pnpm build:all
```

Expected: frontend, admin, and server builds exit with code 0.

- [ ] **Step 4: Verify diff integrity**

```bash
git diff --check
git status --short
```

Expected: `git diff --check` prints nothing; status contains only intended feature files plus pre-existing unrelated modifications.

- [ ] **Step 5: Verify the local UI**

在内置浏览器打开 `http://127.0.0.1:5173/finance/unsettled`，确认：

1. 无选择时批量按钮禁用。
2. 选择两行后按钮显示“（2）”。
3. 确认框显示正确数量与金额。
4. 取消不修改列表。
5. 确认后两行同时移除。
6. 改变客户筛选会清空选择。
7. 单行结款仍可使用。

- [ ] **Step 6: Final commit if verification required fixes**

仅当验证阶段产生与本功能直接相关的修复时执行：

```bash
git add server/src/finance/finance.service.ts server/src/finance/finance.controller.ts server/src/finance/finance.service.test.ts src/api/financeBills.ts src/api/financeBills.test.ts src/stores/financeBills.ts src/stores/financeBills.test.ts src/views/dashboard/FinanceUnsettledPage.vue src/views/dashboard/FinanceUnsettledPage.test.ts
git commit -m "fix: harden unsettled batch payment"
```
