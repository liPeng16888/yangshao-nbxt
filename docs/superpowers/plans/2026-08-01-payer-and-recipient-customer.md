# 付款客户与数据发送客户拆分 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将数据计算样品的客户区域拆分为单选付款客户和多选数据发送客户，并确保所有财务与客户统计只归属付款客户。

**Architecture:** 保留现有 `customer*` JSON 字段作为付款客户，以零迁移方式兼容历史数据；新增 `recipientCustomer*` JSON 字段保存数据发送客户。客户编辑器通过角色参数生成对应字段 patch，财务服务继续只读取原字段，短信和报告通过集中客户解析工具优先读取数据发送客户并回退付款客户。

**Tech Stack:** Vue 3、TypeScript、Pinia、Element Plus、Vitest、NestJS、Prisma JSON 字段

## Global Constraints

- 付款客户只能选择一个；数据发送允许选择多个已保存客户或手动输入。
- 不修改 Prisma schema，不运行数据库迁移，不批量改写历史样品。
- 历史 `customer*` 数据必须继续作为付款客户显示和统计。
- `recipientCustomer*` 不得参与收入、未结款、月结款、预存款、报表收入或客户总览统计。
- 客户长文本必须自动换行并扩展样品格高度，不得覆盖相邻单元格。
- 继续使用现有字段级自动保存、草稿恢复、冲突保护和 SSE 同步。

---

### Task 1: 扩展样品输入保存协议

**Files:**
- Modify: `src/types/labSheet.ts`
- Modify: `src/mocks/db.ts`
- Modify: `src/stores/labSheet.test.ts`
- Modify: `server/src/common/lab.ts`
- Modify: `server/src/common/lab.test.ts`
- Modify: `server/src/lab-sheets/lab-sheets.service.test.ts`

**Interfaces:**
- Produces: `LabSampleInput.recipientCustomerId?: string`
- Produces: `LabSampleInput.recipientCustomerIds?: string[]`
- Produces: `LabSampleInput.recipientCustomers?: Customer[]`
- Produces: `LabSampleInput.recipientCustomerText?: string`
- Consumes: existing `SampleBlockSavePayload.changedFields` field-level save protocol

- [ ] **Step 1: Write failing frontend and backend tests for recipient fields**

Add a store fixture assertion in `src/stores/labSheet.test.ts` that patches and saves:

```ts
store.patchBlock('block-1', {
  recipientCustomerId: 'customer-2',
  recipientCustomerIds: ['customer-2'],
  recipientCustomers: [{ id: 'customer-2', name: '李总' } as Customer],
  recipientCustomerText: '李总'
})

expect(saveSampleBlock).toHaveBeenCalledWith(expect.objectContaining({
  changedFields: expect.objectContaining({ recipientCustomerText: '李总' })
}))
```

Add a service test in `server/src/lab-sheets/lab-sheets.service.test.ts` that submits all four fields and expects the Prisma JSON update and returned DTO to contain them. Add a default-input assertion in `server/src/common/lab.test.ts`:

```ts
expect(createEmptyInputs(1)).toMatchObject({
  recipientCustomerIds: [],
  recipientCustomers: [],
  recipientCustomerText: ''
})
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
pnpm test -- src/stores/labSheet.test.ts
pnpm --filter yangshao-server test -- src/common/lab.test.ts src/lab-sheets/lab-sheets.service.test.ts
```

Expected: FAIL because `LabSampleInput` and `editableInputFields` do not contain recipient fields.

- [ ] **Step 3: Add the four fields to types, defaults and editable field allowlist**

In `src/types/labSheet.ts` add:

```ts
recipientCustomerId?: string
recipientCustomerIds?: string[]
recipientCustomers?: Customer[]
recipientCustomerText?: string
```

In `server/src/common/lab.ts`, add the four keys to `editableInputFields`, and initialize arrays/text in `createEmptyInputs`:

```ts
recipientCustomerIds: [],
recipientCustomers: [],
recipientCustomerText: ''
```

Mirror the empty shape in `src/mocks/db.ts`. Do not add a Prisma migration because `inputs` remains JSON.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the commands from Step 2. Expected: PASS.

- [ ] **Step 5: Commit the save protocol change**

```bash
git add src/types/labSheet.ts src/mocks/db.ts src/stores/labSheet.test.ts server/src/common/lab.ts server/src/common/lab.test.ts server/src/lab-sheets/lab-sheets.service.test.ts
git commit -m "feat: save recipient customer fields"
```

### Task 2: Centralize payer and recipient customer resolution

**Files:**
- Create: `src/utils/sampleCustomers.ts`
- Create: `src/utils/sampleCustomers.test.ts`
- Modify: `src/utils/labReport.ts`
- Modify: `src/utils/labReport.test.ts`

**Interfaces:**
- Produces: `type SampleCustomerRole = 'payer' | 'recipient'`
- Produces: `buildSampleCustomerPatch(role, names, customers): Partial<LabSampleInput>`
- Produces: `getPayerCustomerName(inputs): string`
- Produces: `getPayerCustomerDisplayText(inputs): string`
- Produces: `getRecipientCustomerName(inputs): string`
- Produces: `getRecipientCustomerDisplayText(inputs): string`
- Consumes: `LabSampleInput` and `Customer`

- [ ] **Step 1: Write failing role-mapping and report fallback tests**

Create `src/utils/sampleCustomers.test.ts` with these cases:

```ts
expect(buildSampleCustomerPatch('payer', ['王总'], [wang])).toMatchObject({
  customerId: wang.id,
  customerIds: [wang.id],
  customers: [wang],
  customerText: '王总'
})

expect(buildSampleCustomerPatch('recipient', ['李总'], [li])).toMatchObject({
  recipientCustomerId: li.id,
  recipientCustomerIds: [li.id],
  recipientCustomers: [li],
  recipientCustomerText: '李总'
})

expect(getRecipientCustomerName({ customerText: '王总', recipientCustomerText: '李总' })).toBe('李总')
expect(getRecipientCustomerName({ customerText: '王总' })).toBe('王总')
```

Extend `src/utils/labReport.test.ts` so report `sampleUnit` uses `recipientCustomerText` when present and falls back to `customerText` when absent.

- [ ] **Step 2: Run tests and verify RED**

```bash
pnpm test -- src/utils/sampleCustomers.test.ts src/utils/labReport.test.ts
```

Expected: FAIL because the new helper and recipient-first report behavior do not exist.

- [ ] **Step 3: Implement the customer role helper and route reports through it**

Implement role-specific patch construction without dynamic untyped string mutation:

```ts
export function buildSampleCustomerPatch(role: SampleCustomerRole, names: string[], customers: Customer[]) {
  const ids = customers.map((customer) => customer.id)
  const text = names.join('、')
  return role === 'recipient'
    ? { recipientCustomerId: ids[0], recipientCustomerIds: ids, recipientCustomers: customers, recipientCustomerText: text }
    : { customerId: ids[0], customerIds: ids, customers, customerText: text }
}
```

Move full customer formatting into this helper. Update `getBlockCustomerName` and `getBlockCustomerDisplayText` in `src/utils/labReport.ts` to call the recipient-first functions. Do not change finance helpers.

- [ ] **Step 4: Run tests and verify GREEN**

```bash
pnpm test -- src/utils/sampleCustomers.test.ts src/utils/labReport.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit customer resolution**

```bash
git add src/utils/sampleCustomers.ts src/utils/sampleCustomers.test.ts src/utils/labReport.ts src/utils/labReport.test.ts
git commit -m "feat: resolve payer and recipient customers"
```

### Task 3: Render the two customer rows and enforce selection limits

**Files:**
- Create: `src/components/lab-sheet/CustomerCellEditor.test.ts`
- Modify: `src/components/lab-sheet/CustomerCellEditor.vue`
- Modify: `src/components/lab-sheet/LabSheetGrid.test.ts`
- Modify: `src/components/lab-sheet/LabSheetGrid.vue`
- Modify: `src/components/lab-sheet/BulkSampleFillDialog.vue`

**Interfaces:**
- Consumes: `SampleCustomerRole` and `buildSampleCustomerPatch`
- Adds prop: `CustomerCellEditor.customerRole?: SampleCustomerRole` with default `payer`
- Adds prop: `CustomerCellEditor.selectionLimit?: number` with default `0` (unlimited)
- Emits: existing `update(patch)` event with role-specific fields

- [ ] **Step 1: Write failing component and grid tests**

In `CustomerCellEditor.test.ts`, mount the component with `customerRole="recipient"`, invoke selection through the Element Plus select, and assert the update patch contains only `recipientCustomer*` fields. Mount with `selectionLimit=1` and assert the rendered select receives `multiple-limit="1"`.

In `LabSheetGrid.test.ts`, stub `CustomerCellEditor` with declared `customerRole`, `selectionLimit`, `modelValue`, and `selectedCustomers` props. Assert each sample renders two editors:

```ts
expect(editors[0].props()).toMatchObject({ customerRole: 'payer', selectionLimit: 1, modelValue: '王总' })
expect(editors[1].props()).toMatchObject({ customerRole: 'recipient', selectionLimit: 0, modelValue: '李总、张总' })
```

Emit a recipient update from the second stub and assert `LabSheetGrid` forwards the `recipientCustomer*` patch unchanged.

- [ ] **Step 2: Run tests and verify RED**

```bash
pnpm test -- src/components/lab-sheet/CustomerCellEditor.test.ts src/components/lab-sheet/LabSheetGrid.test.ts
```

Expected: FAIL because only one customer editor exists and it always emits payer fields.

- [ ] **Step 3: Add role-aware editor behavior**

Update `CustomerCellEditor.vue`:

```vue
<el-select
  v-model="selectedNames"
  multiple
  :multiple-limit="selectionLimit || 0"
/>
```

Define the complete props shape and defaults:

```ts
const props = withDefaults(defineProps<{
  modelValue?: string
  selectedCustomers?: Customer[]
  disabled?: boolean
  placeholder?: string
  customerRole?: SampleCustomerRole
  selectionLimit?: number
}>(), {
  customerRole: 'payer',
  selectionLimit: 0
})
```

Replace the fixed `emitSelectedCustomers` patch with `buildSampleCustomerPatch(props.customerRole, selectedNames.value, customers)`. When adding a customer in payer mode, replace the current selection instead of appending if one name is already selected.

- [ ] **Step 4: Split the grid customer region and implement adaptive wrapping**

Render the existing fields as the payer row and new fields as the recipient row:

```vue
<div class="customer-role-row" data-field="customerText">
  <span class="customer-role-label">付款客户</span>
  <CustomerCellEditor
    customer-role="payer"
    :selection-limit="1"
    :model-value="block.inputs.customerText"
    :selected-customers="block.inputs.customers"
    @update="(patch) => emitUpdate(block.id, patch)"
  />
</div>
<div class="customer-role-row" data-field="recipientCustomerText">
  <span class="customer-role-label">数据发送</span>
  <CustomerCellEditor
    customer-role="recipient"
    :model-value="block.inputs.recipientCustomerText"
    :selected-customers="block.inputs.recipientCustomers"
    @update="(patch) => emitUpdate(block.id, patch)"
  />
</div>
```

Change `.sample-customer-stack` to `grid-template-rows: 36px auto auto`. Give each role row `min-height: 64px`, `align-items: flex-start`, and a separating top border. Apply `white-space: normal`, `overflow-wrap: anywhere`, and `word-break: break-word` to selected text. Keep `.customer-actions` at 30px and the editor text track at `minmax(0, 1fr)`.

Call `refreshScrollState()` after customer updates so the zoom stage height follows content expansion.

- [ ] **Step 5: Clarify batch fill as payer-only**

In `BulkSampleFillDialog.vue`, change visible copy from `客户选择` to `付款客户`, pass `customer-role="payer"` and `:selection-limit="1"`, and keep its patch fields as `customer*`. Do not add recipient fields to bulk fill.

- [ ] **Step 6: Run component tests and verify GREEN**

```bash
pnpm test -- src/components/lab-sheet/CustomerCellEditor.test.ts src/components/lab-sheet/LabSheetGrid.test.ts src/views/dashboard/LabDataPage.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the UI split**

```bash
git add src/components/lab-sheet/CustomerCellEditor.test.ts src/components/lab-sheet/CustomerCellEditor.vue src/components/lab-sheet/LabSheetGrid.test.ts src/components/lab-sheet/LabSheetGrid.vue src/components/lab-sheet/BulkSampleFillDialog.vue
git commit -m "feat: split payer and recipient customer rows"
```

### Task 4: Lock financial ownership to payer customer

**Files:**
- Modify: `src/utils/financeBills.test.ts`
- Modify: `server/src/customer-overview/customer-overview.service.test.ts`
- Inspect: `server/src/finance/finance.service.ts`
- Inspect: `server/src/customer-overview/customer-overview.service.ts`

**Interfaces:**
- Consumes: existing `customer*` payer fields
- Explicitly ignores: all `recipientCustomer*` fields

- [ ] **Step 1: Add regression tests proving recipient fields never own money or counts**

In `src/utils/financeBills.test.ts`, build a sample with payer `王总`, recipient `李总`, amount `100`, and `paymentStatus: '未结款'`. Assert the unsettled and monthly rows use `王总`, filtering by `王总` includes it, and filtering only by `李总` excludes it.

In `server/src/customer-overview/customer-overview.service.test.ts`, add two detected samples with payer `王总` and different recipients. Assert one overview row is grouped under `王总`, sample count is 2, and no `李总`/recipient row is created.

- [ ] **Step 2: Run regression tests**

```bash
pnpm test -- src/utils/financeBills.test.ts
pnpm --filter yangshao-server test -- src/customer-overview/customer-overview.service.test.ts
```

Expected: PASS because production finance and overview code already reads only `customer*`. If either test fails, change only the resolver that consumed `recipientCustomer*`; never add recipient fallback to finance.

- [ ] **Step 3: Commit the finance ownership regression coverage**

```bash
git add src/utils/financeBills.test.ts server/src/customer-overview/customer-overview.service.test.ts
git commit -m "test: lock finance ownership to payer customer"
```

### Task 5: Full verification and browser checks

**Files:**
- Review: all files changed in Tasks 1-4

**Interfaces:**
- Produces: verified local implementation only

- [ ] **Step 1: Run all focused tests**

```bash
pnpm test -- src/utils/sampleCustomers.test.ts src/utils/labReport.test.ts src/utils/financeBills.test.ts src/components/lab-sheet/CustomerCellEditor.test.ts src/components/lab-sheet/LabSheetGrid.test.ts src/views/dashboard/LabDataPage.test.ts src/stores/labSheet.test.ts
pnpm --filter yangshao-server test -- src/common/lab.test.ts src/lab-sheets/lab-sheets.service.test.ts src/customer-overview/customer-overview.service.test.ts
```

Expected: all tests PASS without unhandled warnings.

- [ ] **Step 2: Run type checks and builds**

```bash
pnpm build
pnpm --filter yangshao-server build
```

Expected: both commands exit 0.

- [ ] **Step 3: Verify behavior in the local browser**

At `http://127.0.0.1:5173/data` verify:

1. Existing customer appears under 付款客户.
2. 付款客户 accepts only one selection.
3. 数据发送 accepts multiple customers and manual text.
4. Long complete customer information wraps and increases the sample row height.
5. Editing both rows reaches the saved state and survives page navigation.
6. Generated SMS/report uses 数据发送, then falls back to 付款客户 when 数据发送 is empty.
7. 未结款 and 月结款 list the sample under 付款客户 only.

- [ ] **Step 4: Inspect the final diff for unrelated changes**

```bash
git diff --check
git status --short
```

Do not revert pre-existing user changes. Report any unrelated dirty files separately and do not stage them.
