# Monthly Settlement Summary Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add mutually exclusive ascending, descending, and cleared sorting for amount, sample count, and settlement status in the monthly settlement summary table.

**Architecture:** Keep amount and sample-count sorting local to Element Plus using their numeric row fields. Put the fixed three-state business order in a small pure utility and pass its row comparator to the status column; the table component retains ownership of the single active sort state and no sort state is persisted.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Element Plus `el-table`, Vitest, Vue Test Utils, pnpm.

## Global Constraints

- Modify only the “月结款信息收录” summary table; do not add sorting to “月结款每日客户明细”.
- Amount sorts numerically from small to large or large to small.
- Sample count sorts numerically from few to many or many to few.
- Status ascending order is exactly `已结款 → 部分结款 → 未结款`; descending is the reverse.
- At most one column is actively sorted; choosing another column replaces the previous sort.
- Each sortable header cycles through ascending, descending, and cleared; cleared restores the report row order.
- Sorting is display-only and must not change persistence, editing, filtering, aggregation, or export behavior.
- Add no dependency, API, database, browser-storage, or server change.

---

### Task 1: Settlement status row comparator

**Files:**
- Create: `src/utils/monthlySettlementSorting.ts`
- Create: `src/utils/monthlySettlementSorting.test.ts`

**Interfaces:**
- Consumes: `MonthlySettlementSummaryRow` and `MonthlySettlementStatus` from `@/types/financeBills`.
- Produces: `compareMonthlySettlementStatusRows(left, right): number`, compatible with Element Plus table-column `sort-method`.

- [ ] **Step 1: Write the failing comparator test**

Create `src/utils/monthlySettlementSorting.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { MonthlySettlementStatus, MonthlySettlementSummaryRow } from '@/types/financeBills'
import { compareMonthlySettlementStatusRows } from './monthlySettlementSorting'

function row(settlementStatus: MonthlySettlementStatus): MonthlySettlementSummaryRow {
  return {
    id: settlementStatus,
    month: '2026-08',
    customer: settlementStatus,
    sampleCount: 1,
    amount: 100,
    settlementStatus,
    paidAmount: null,
    remark: ''
  }
}

describe('monthly settlement sorting', () => {
  it('orders paid before partial before unpaid', () => {
    const rows = [row('未结款'), row('已结款'), row('部分结款')]

    expect(rows.sort(compareMonthlySettlementStatusRows).map((item) => item.settlementStatus)).toEqual([
      '已结款',
      '部分结款',
      '未结款'
    ])
  })

  it('places an unknown runtime status after the supported statuses', () => {
    const unknown = row('未结款')
    unknown.settlementStatus = '异常状态' as MonthlySettlementStatus

    expect(compareMonthlySettlementStatusRows(unknown, row('未结款'))).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run the comparator test and verify the missing implementation failure**

Run:

```bash
pnpm exec vitest run src/utils/monthlySettlementSorting.test.ts
```

Expected: FAIL because `./monthlySettlementSorting` does not exist or does not export `compareMonthlySettlementStatusRows`.

- [ ] **Step 3: Implement the minimal fixed-rank comparator**

Create `src/utils/monthlySettlementSorting.ts`:

```ts
import type { MonthlySettlementStatus, MonthlySettlementSummaryRow } from '@/types/financeBills'

const statusRanks: Record<MonthlySettlementStatus, number> = {
  已结款: 0,
  部分结款: 1,
  未结款: 2
}

function getStatusRank(status: string) {
  return statusRanks[status as MonthlySettlementStatus] ?? Number.MAX_SAFE_INTEGER
}

export function compareMonthlySettlementStatusRows(
  left: Pick<MonthlySettlementSummaryRow, 'settlementStatus'>,
  right: Pick<MonthlySettlementSummaryRow, 'settlementStatus'>
) {
  return getStatusRank(left.settlementStatus) - getStatusRank(right.settlementStatus)
}
```

- [ ] **Step 4: Run the comparator tests and verify they pass**

Run:

```bash
pnpm exec vitest run src/utils/monthlySettlementSorting.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit the tested comparator**

```bash
git add src/utils/monthlySettlementSorting.ts src/utils/monthlySettlementSorting.test.ts
git commit -m "feat: define monthly settlement status sorting"
```

---

### Task 2: Sortable monthly settlement summary columns

**Files:**
- Modify: `src/views/dashboard/FinanceMonthlySettlementPage.vue:38-52,141-151`
- Modify: `src/views/dashboard/FinanceMonthlySettlementPage.test.ts:1-82,84-111`
- Reuse: `src/utils/monthlySettlementSorting.ts`

**Interfaces:**
- Consumes: `compareMonthlySettlementStatusRows(left, right): number` from Task 1.
- Produces: three sortable `ElTableColumn` instances with row props `amount`, `sampleCount`, and `settlementStatus`, all using the direction cycle `['ascending', 'descending', null]`.

- [ ] **Step 1: Extend the page fixture with summary rows**

In `FinanceMonthlySettlementPage.test.ts`, import `MonthlySettlementSummaryRow`, add this fixture, and allow `mountPageWithReport` to receive it:

```ts
import type { MonthlySettlementDailyRow, MonthlySettlementReport, MonthlySettlementSummaryRow } from '@/types/financeBills'

function makeSummaryRows(): MonthlySettlementSummaryRow[] {
  return [
    {
      id: 'summary-a',
      month: '2026-08',
      customer: '客户甲',
      sampleCount: 3,
      amount: 300,
      settlementStatus: '未结款',
      paidAmount: null,
      remark: ''
    },
    {
      id: 'summary-b',
      month: '2026-08',
      customer: '客户乙',
      sampleCount: 1,
      amount: 100,
      settlementStatus: '已结款',
      paidAmount: 100,
      remark: ''
    },
    {
      id: 'summary-c',
      month: '2026-08',
      customer: '客户丙',
      sampleCount: 2,
      amount: 200,
      settlementStatus: '部分结款',
      paidAmount: 80,
      remark: ''
    }
  ]
}

function mountPageWithReport(input: {
  month: string
  dailyRows: MonthlySettlementDailyRow[]
  summaryRows?: MonthlySettlementSummaryRow[]
}) {
  store.monthlySettlementMonth = input.month
  store.monthlySettlementReport = {
    month: input.month,
    totalSamples: input.dailyRows.reduce((sum, row) => sum + row.sampleCount, 0),
    totalAmount: input.dailyRows.reduce((sum, row) => sum + row.amount, 0),
    dailyRows: input.dailyRows,
    summaryRows: input.summaryRows || []
  }
  return mount(FinanceMonthlySettlementPage, {
    global: {
      plugins: [ElementPlus],
      stubs: {
        MonthlySettlementBillExportDialog: BillDialogStub
      }
    }
  })
}
```

- [ ] **Step 2: Write the failing column-configuration test**

Append this test inside the existing page `describe` block:

```ts
it('configures one-cycle sorting for amount, sample count, and settlement status', () => {
  const wrapper = mountPageWithReport({
    month: '2026-08',
    dailyRows: makePageRows(),
    summaryRows: makeSummaryRows()
  })
  const summaryTable = wrapper.findAllComponents({ name: 'ElTable' })[0]
  const columns = summaryTable.findAllComponents({ name: 'ElTableColumn' })
  const findColumn = (label: string) => columns.find((column) => column.props('label') === label)
  const amountColumn = findColumn('金额')
  const sampleCountColumn = findColumn('样品数量')
  const statusColumn = findColumn('结款状态')

  expect(amountColumn?.props()).toMatchObject({
    prop: 'amount',
    sortable: true,
    sortOrders: ['ascending', 'descending', null]
  })
  expect(sampleCountColumn?.props()).toMatchObject({
    prop: 'sampleCount',
    sortable: true,
    sortOrders: ['ascending', 'descending', null]
  })
  expect(statusColumn?.props()).toMatchObject({
    prop: 'settlementStatus',
    sortable: true,
    sortOrders: ['ascending', 'descending', null]
  })
  expect(statusColumn?.props('sortMethod')).toEqual(expect.any(Function))
})
```

This test scopes the duplicate “金额” and “样品数量” labels to the first table, so it cannot accidentally inspect the daily-detail table.

- [ ] **Step 3: Run the page test and verify the sortable-prop failure**

Run:

```bash
pnpm exec vitest run src/views/dashboard/FinanceMonthlySettlementPage.test.ts
```

Expected: the new test FAILS because the amount and status columns lack row props and all three columns lack the requested sortable configuration.

- [ ] **Step 4: Wire the three columns to native single-column sorting**

In `FinanceMonthlySettlementPage.vue`, import the Task 1 comparator and define the common direction cycle:

```ts
import { compareMonthlySettlementStatusRows } from '@/utils/monthlySettlementSorting'

const settlementSortOrders: Array<'ascending' | 'descending' | null> = ['ascending', 'descending', null]
```

Replace only the three summary-table column declarations with:

```vue
<el-table-column
  prop="amount"
  label="金额"
  width="130"
  sortable
  :sort-orders="settlementSortOrders"
>
  <template #default="{ row }">¥{{ money(row.amount) }}</template>
</el-table-column>
<el-table-column
  prop="sampleCount"
  label="样品数量"
  width="110"
  sortable
  :sort-orders="settlementSortOrders"
/>
<el-table-column
  prop="settlementStatus"
  label="结款状态"
  width="150"
  sortable
  :sort-orders="settlementSortOrders"
  :sort-method="compareMonthlySettlementStatusRows"
>
  <template #default="{ row }">
    <el-select
      :model-value="row.settlementStatus"
      size="small"
      :loading="store.monthlySavingId === row.id"
      @update:model-value="(value: MonthlySettlementStatus) => handleStatusChange(row, value)"
    >
      <el-option
        v-for="status in settlementStatusOptions"
        :key="status"
        :label="status"
        :value="status"
      />
    </el-select>
  </template>
</el-table-column>
```

Do not add `sort-change`, `default-sort`, remote sorting, a copied/sorted computed array, or any sort props to the second table. Element Plus table state then guarantees one active column and applies descending by reversing the comparator result.

- [ ] **Step 5: Run the page and comparator tests**

Run:

```bash
pnpm exec vitest run src/views/dashboard/FinanceMonthlySettlementPage.test.ts src/utils/monthlySettlementSorting.test.ts
```

Expected: all tests in both files PASS, including the two existing export tests.

- [ ] **Step 6: Commit the page integration**

```bash
git add src/views/dashboard/FinanceMonthlySettlementPage.vue src/views/dashboard/FinanceMonthlySettlementPage.test.ts
git commit -m "feat: sort monthly settlement summary columns"
```

---

### Task 3: Regression and browser verification

**Files:**
- Verify only; no source file should change.

**Interfaces:**
- Consumes: the comparator and sortable column configuration from Tasks 1 and 2.
- Produces: evidence that existing frontend behavior, all packages, and the visible table interaction remain healthy.

- [ ] **Step 1: Run the complete frontend test suite**

Run:

```bash
pnpm test
```

Expected: all frontend Vitest files PASS with zero failures.

- [ ] **Step 2: Run the complete production build**

Run:

```bash
pnpm build:all
```

Expected: the frontend, admin frontend, and server builds finish successfully with no TypeScript error.

- [ ] **Step 3: Verify the summary table in the local browser**

Open `http://127.0.0.1:5173/finance/monthly-settlement` and use a month containing at least three customer rows with distinct amounts, counts, and statuses. Verify:

1. Amount cycles numeric ascending, numeric descending, and original order.
2. Sample count cycles few-to-many, many-to-few, and original order.
3. Status ascending is `已结款、部分结款、未结款`; descending is the reverse; clearing restores original order.
4. Activating a new sort column clears the arrow on the previous column.
5. Status editing, paid-amount editing, remarks, month selection, customer filtering, and “导出本月明细” remain usable.
6. The browser console contains no new error.

- [ ] **Step 4: Confirm the working tree contains no verification artifacts**

Run:

```bash
git status --short
```

Expected: no uncommitted files. If a test or build produces a tracked change, inspect it and remove only the generated artifact before reporting completion.
