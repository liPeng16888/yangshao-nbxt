# Admin Finance Customer Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add searchable single-customer and multi-customer filtering to seven customer-bearing tabs on the admin finance page.

**Architecture:** Keep existing finance APIs and raw response objects unchanged. Add a focused utility that derives unique customer options and filters rows by exact customer display text, then wire per-tab selection state and computed table data into `FinanceReportsPage.vue`.

**Tech Stack:** Vue 3 Composition API, TypeScript, Element Plus, Vitest, Vite.

## Global Constraints

- Target tabs: `unsettled`, `monthlyDaily`, `monthlyBills`, `monthlyCustomers`, `prepaidRecharges`, `prepaidCustomers`, and `prepaidDaily`.
- Combined customer text remains one customer option and is not split.
- Each target tab keeps an independent customer selection.
- No backend endpoint, Prisma schema, database record, GitHub repository, or VPS deployment changes.
- Existing account, month, reminder, remark, and deletion-review behavior must remain unchanged.

---

### Task 1: Customer filter utility

**Files:**
- Create: `admin/src/utils/financeCustomerFilter.ts`
- Create: `admin/src/utils/financeCustomerFilter.test.ts`

**Interfaces:**
- Produces: `normalizeFinanceCustomer(value: unknown): string`
- Produces: `financeCustomerOptions(rows: unknown[]): string[]`
- Produces: `filterFinanceRowsByCustomers<T>(rows: T[], selectedCustomers: string[]): T[]`

- [ ] **Step 1: Write failing utility tests**

```ts
import { describe, expect, it } from 'vitest'
import { filterFinanceRowsByCustomers, financeCustomerOptions } from './financeCustomerFilter'

describe('finance customer filter', () => {
  const rows = [
    { id: '1', customer: '客户甲' },
    { id: '2', customer: '客户乙' },
    { id: '3', customer: '客户甲' },
    { id: '4', customer: '' },
    { id: '5', customer: '客户甲、客户乙' }
  ]

  it('builds unique sorted options and keeps combined customer text intact', () => {
    expect(financeCustomerOptions(rows)).toEqual(['客户甲', '客户甲、客户乙', '客户乙'])
  })

  it('supports empty, single, and multiple selections', () => {
    expect(filterFinanceRowsByCustomers(rows, [])).toEqual(rows)
    expect(filterFinanceRowsByCustomers(rows, ['客户甲']).map((row) => row.id)).toEqual(['1', '3'])
    expect(filterFinanceRowsByCustomers(rows, ['客户甲', '客户乙']).map((row) => row.id)).toEqual(['1', '2', '3'])
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm exec vitest run admin/src/utils/financeCustomerFilter.test.ts`

Expected: FAIL because `financeCustomerFilter.ts` does not exist.

- [ ] **Step 3: Implement the utility**

```ts
export function normalizeFinanceCustomer(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function financeCustomerOptions(rows: unknown[]) {
  return Array.from(new Set(rows
    .map((row) => normalizeFinanceCustomer((row as { customer?: unknown })?.customer))
    .filter(Boolean)))
    .sort((left, right) => left.localeCompare(right, 'zh-CN'))
}

export function filterFinanceRowsByCustomers<T>(rows: T[], selectedCustomers: string[]) {
  const selected = new Set(selectedCustomers.map(normalizeFinanceCustomer).filter(Boolean))
  if (!selected.size) return rows
  return rows.filter((row) => selected.has(normalizeFinanceCustomer((row as { customer?: unknown })?.customer)))
}
```

- [ ] **Step 4: Run the utility test and verify it passes**

Run: `pnpm exec vitest run admin/src/utils/financeCustomerFilter.test.ts`

Expected: all finance customer filter tests pass.

- [ ] **Step 5: Commit the utility**

```bash
git add admin/src/utils/financeCustomerFilter.ts admin/src/utils/financeCustomerFilter.test.ts
git commit -m "test: add admin finance customer filtering"
```

---

### Task 2: Finance page filter state and tables

**Files:**
- Modify: `admin/src/views/FinanceReportsPage.vue`
- Test: `admin/src/utils/financeCustomerFilter.test.ts`

**Interfaces:**
- Consumes: `financeCustomerOptions(rows)` and `filterFinanceRowsByCustomers(rows, selectedCustomers)` from Task 1.
- Produces: `customerFilterRows`, `customerOptions`, `selectedCustomers`, and `filteredRows` computed values used by all seven target tables.

- [ ] **Step 1: Add a failing test for selection cleanup**

Extend `admin/src/utils/financeCustomerFilter.test.ts` with:

```ts
import { retainAvailableFinanceCustomers } from './financeCustomerFilter'

it('removes selected customers that no longer exist after a query', () => {
  expect(retainAvailableFinanceCustomers(['客户甲', '客户丙'], ['客户甲', '客户乙'])).toEqual(['客户甲'])
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm exec vitest run admin/src/utils/financeCustomerFilter.test.ts`

Expected: FAIL because `retainAvailableFinanceCustomers` is not exported.

- [ ] **Step 3: Implement selection cleanup**

Add to `admin/src/utils/financeCustomerFilter.ts`:

```ts
export function retainAvailableFinanceCustomers(selected: string[], available: string[]) {
  const valid = new Set(available)
  return selected.filter((customer) => valid.has(customer))
}
```

- [ ] **Step 4: Add per-tab state and computed data to the finance page**

In `FinanceReportsPage.vue`:

```ts
import { computed, onMounted, reactive, ref } from 'vue'
import {
  filterFinanceRowsByCustomers,
  financeCustomerOptions,
  retainAvailableFinanceCustomers
} from '../utils/financeCustomerFilter'

const customerFilterTabs = new Set([
  'unsettled', 'monthlyDaily', 'monthlyBills', 'monthlyCustomers',
  'prepaidRecharges', 'prepaidCustomers', 'prepaidDaily'
])
const customerSelections = reactive<Record<string, string[]>>({
  unsettled: [], monthlyDaily: [], monthlyBills: [], monthlyCustomers: [],
  prepaidRecharges: [], prepaidCustomers: [], prepaidDaily: []
})
const customerFilterRows = computed<any[]>(() => {
  if (active.value === 'monthlyBills') return report.value.summaryRows || []
  if (active.value === 'prepaidCustomers') return report.value.customerRows || []
  if (active.value === 'prepaidDaily') return report.value.dailyRows || []
  return rows.value
})
const customerOptions = computed(() => financeCustomerOptions(customerFilterRows.value))
const selectedCustomers = computed({
  get: () => customerSelections[active.value] || [],
  set: (value: string[]) => { customerSelections[active.value] = value }
})
const filteredRows = computed(() => filterFinanceRowsByCustomers(customerFilterRows.value, selectedCustomers.value))
```

After each successful `loadActive()`, run:

```ts
if (customerFilterTabs.has(active.value)) {
  customerSelections[active.value] = retainAvailableFinanceCustomers(
    customerSelections[active.value] || [],
    customerOptions.value
  )
}
```

- [ ] **Step 5: Add the shared filter control**

Place a compact toolbar above the target table section:

```vue
<div v-if="customerFilterTabs.has(active)" class="customer-filter-bar">
  <span>筛选客户</span>
  <el-select
    v-model="selectedCustomers"
    multiple
    filterable
    clearable
    collapse-tags
    collapse-tags-tooltip
    :max-collapse-tags="2"
    :disabled="!customerOptions.length"
    placeholder="选择一个或多个客户"
  >
    <el-option v-for="customer in customerOptions" :key="customer" :label="customer" :value="customer" />
  </el-select>
</div>
```

Use `filteredRows` as the `:data` source in the seven target tables. Keep the three non-target tables on their original sources.

- [ ] **Step 6: Add restrained responsive styling**

```css
.customer-filter-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid #e5edf7;
}

.customer-filter-bar > span {
  color: #64748b;
  font-size: 13px;
}

.customer-filter-bar .el-select {
  width: min(360px, 100%);
}
```

- [ ] **Step 7: Run tests and type/build verification**

Run:

```bash
pnpm exec vitest run admin/src/utils/financeCustomerFilter.test.ts
pnpm build:admin
git diff --check
```

Expected: tests pass, admin build exits 0, and diff check reports no whitespace errors.

- [ ] **Step 8: Verify in the in-app browser**

Open `http://127.0.0.1:5174/admin/finance` and verify:

- Each of the seven target tabs shows the customer filter.
- Selecting one customer leaves only that customer's rows.
- Selecting multiple customers shows the union of their rows.
- Clearing the selection restores all rows.
- Income, expenses, and deletion request tabs do not show the filter.
- Existing reminders and editable remarks remain available.

- [ ] **Step 9: Commit the page integration**

```bash
git add admin/src/views/FinanceReportsPage.vue admin/src/utils/financeCustomerFilter.ts admin/src/utils/financeCustomerFilter.test.ts
git commit -m "feat: filter admin finance rows by customer"
```
