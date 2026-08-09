# 系数计算两表独立增删 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让“标样含量”和“标样系数计算”分别独立新增、表内多选删除和持久化，同时在删除后只重排自动编号并保留用户自定义编号。

**Architecture:** 新建一个无界面依赖的行编号工具，集中负责旧数据自动编号推断、删除后重排和最少保留一行校验。页面继续持有两张表的响应式数据，但拆分新增数量、增加函数、删除模式和选中集合；Element Plus 只负责选择控件和二次确认，现有 `localStorage` 深度监听负责持久化。

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Element Plus, Vitest, Vue Test Utils, browser `localStorage`

## Global Constraints

- “标样含量”和“标样系数计算”的增删、选择状态、行数、内容与编号完全独立。
- 每张表至少保留 1 行。
- 删除后只重排 `autoCode: true` 的自动编号；用户编辑过的特殊编号保持原值。
- 旧存储中编号等于载入位置三位编号的行推断为自动编号，其他行推断为自定义编号。
- 旧 `addCount` 只用于初始化新的 `standardAddCount` 与 `calculationAddCount`，以后不再写入。
- 不新增服务端接口或数据库迁移，不改变公式、“应用系数”分段应用和当天数据计算样品块。
- 测试命令必须显式排除 `.pnpm-store/**`、`.worktrees/**` 和 `.superpowers/**`，避免 Vitest 扫描缓存副本。

---

## File Map

- Create: `src/utils/coefficientRows.ts` — 行编号格式化、旧数据标记推断、删除后自动编号重排和删除校验。
- Create: `src/utils/coefficientRows.test.ts` — 编号、自定义编号保留和最少一行规则的单元测试。
- Modify: `src/views/dashboard/CoefficientCalculationPage.vue` — 两张表的独立状态、新增控件、删除选择模式、二次确认和持久化迁移。
- Modify: `src/views/dashboard/CoefficientCalculationPage.test.ts` — 两表独立增删、旧存储迁移、删除限制和回归测试。

### Task 1: 行编号与删除规则工具

**Files:**
- Create: `src/utils/coefficientRows.ts`
- Create: `src/utils/coefficientRows.test.ts`

**Interfaces:**
- Consumes: 任何包含 `code: string` 与 `autoCode: boolean` 的行数组。
- Produces:
  - `formatCoefficientRowCode(index: number): string`
  - `inferCoefficientRowAutoCode(code: unknown, index: number, storedAutoCode?: unknown): boolean`
  - `renumberAutomaticCoefficientRows<T extends CoefficientRowIdentity>(rows: T[]): void`
  - `deleteCoefficientRows<T extends CoefficientRowIdentity>(rows: T[], selectedIds: ReadonlySet<string>): T[]`

- [ ] **Step 1: 写失败测试，覆盖自动编号、自定义编号和删除限制**

```ts
import { describe, expect, it } from 'vitest'
import {
  deleteCoefficientRows,
  inferCoefficientRowAutoCode,
  renumberAutomaticCoefficientRows
} from './coefficientRows'

describe('coefficient row identity', () => {
  it('infers legacy automatic codes only when code matches the loaded position', () => {
    expect(inferCoefficientRowAutoCode('003', 3)).toBe(true)
    expect(inferCoefficientRowAutoCode('A-03', 3)).toBe(false)
    expect(inferCoefficientRowAutoCode('010', 3)).toBe(false)
    expect(inferCoefficientRowAutoCode('CUSTOM', 3, true)).toBe(true)
  })

  it('renumbers only automatic rows in display order', () => {
    const rows = [
      { id: '1', code: '001', autoCode: true },
      { id: '2', code: 'A-02', autoCode: false },
      { id: '4', code: '004', autoCode: true }
    ]
    renumberAutomaticCoefficientRows(rows)
    expect(rows.map((row) => row.code)).toEqual(['001', 'A-02', '003'])
  })

  it('deletes multiple rows but rejects deleting every row', () => {
    const rows = [
      { id: '1', code: '001', autoCode: true },
      { id: '2', code: '002', autoCode: true },
      { id: '3', code: '003', autoCode: true }
    ]
    expect(deleteCoefficientRows(rows, new Set(['2']))).toHaveLength(2)
    expect(() => deleteCoefficientRows(rows, new Set(['1', '2', '3']))).toThrow('至少保留一个样品')
  })
})
```

- [ ] **Step 2: 运行测试并确认因模块不存在而失败**

Run:

```bash
./node_modules/.bin/vitest run src/utils/coefficientRows.test.ts --exclude='.pnpm-store/**' --exclude='.worktrees/**' --exclude='.superpowers/**'
```

Expected: FAIL，提示无法解析 `./coefficientRows`。

- [ ] **Step 3: 实现最小工具函数**

```ts
export interface CoefficientRowIdentity {
  id: string
  code: string
  autoCode: boolean
}

export function formatCoefficientRowCode(index: number) {
  return String(index).padStart(3, '0')
}

export function inferCoefficientRowAutoCode(code: unknown, index: number, storedAutoCode?: unknown) {
  if (typeof storedAutoCode === 'boolean') return storedAutoCode
  return typeof code !== 'string' || code === formatCoefficientRowCode(index)
}

export function renumberAutomaticCoefficientRows<T extends CoefficientRowIdentity>(rows: T[]) {
  rows.forEach((row, index) => {
    if (row.autoCode) row.code = formatCoefficientRowCode(index + 1)
  })
}

export function deleteCoefficientRows<T extends CoefficientRowIdentity>(rows: T[], selectedIds: ReadonlySet<string>) {
  const remaining = rows.filter((row) => !selectedIds.has(row.id))
  if (!remaining.length) throw new Error('至少保留一个样品')
  renumberAutomaticCoefficientRows(remaining)
  return remaining
}
```

- [ ] **Step 4: 运行工具测试并确认通过**

Run: Task 1 Step 2 的同一命令。

Expected: `3 passed`。

- [ ] **Step 5: 提交工具和测试**

```bash
git add src/utils/coefficientRows.ts src/utils/coefficientRows.test.ts
git commit -m "feat: add coefficient row numbering rules"
```

### Task 2: 拆分两张表的状态、迁移和新增功能

**Files:**
- Modify: `src/views/dashboard/CoefficientCalculationPage.vue`
- Modify: `src/views/dashboard/CoefficientCalculationPage.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `formatCoefficientRowCode` 和 `inferCoefficientRowAutoCode`。
- Produces:
  - `standardAddCount: Ref<number>` 与 `calculationAddCount: Ref<number>`
  - `addStandardRows(): void`
  - `addCalculationRows(): void`
  - 含 `autoCode` 的 `StandardContentRow` 与 `CalculationRow`

- [ ] **Step 1: 写失败的页面测试，证明载入和新增互不补齐**

在测试挂载前写入不同长度的旧数据，并用稳定的 `data-testid` 统计行数：

```ts
it('keeps different stored row counts independent', () => {
  window.localStorage.setItem('ys_coefficient_calculation_inputs:guest', JSON.stringify({
    addCount: 2,
    standardRows: [{ code: '001' }, { code: '002' }],
    calculationRows: [{ code: '001', inputs: {} }]
  }))
  const { wrapper } = mountPage()
  expect(wrapper.findAll('[data-testid="standard-row"]')).toHaveLength(2)
  expect(wrapper.findAll('[data-testid="calculation-row"]')).toHaveLength(1)
})

it('migrates the legacy add count into two independent persisted counts', async () => {
  window.localStorage.setItem('ys_coefficient_calculation_inputs:guest', JSON.stringify({
    addCount: 2,
    standardRows: [{ code: '001' }],
    calculationRows: [{ code: '001', inputs: {} }]
  }))
  const { wrapper } = mountPage()
  await wrapper.get('[data-testid="add-standard-rows"]').trigger('click')
  await nextTick()
  const stored = JSON.parse(window.localStorage.getItem('ys_coefficient_calculation_inputs:guest')!)
  expect(stored.standardAddCount).toBe(2)
  expect(stored.calculationAddCount).toBe(2)
  expect(stored).not.toHaveProperty('addCount')
})

it('adds rows to each table independently', async () => {
  const { wrapper } = mountPage()
  const calculationBefore = wrapper.findAll('[data-testid="calculation-row"]').length
  await wrapper.get('[data-testid="add-standard-rows"]').trigger('click')
  expect(wrapper.findAll('[data-testid="standard-row"]')).toHaveLength(4)
  expect(wrapper.findAll('[data-testid="calculation-row"]')).toHaveLength(calculationBefore)
  await wrapper.get('[data-testid="add-calculation-rows"]').trigger('click')
  expect(wrapper.findAll('[data-testid="calculation-row"]')).toHaveLength(calculationBefore + 1)
})
```

- [ ] **Step 2: 运行页面测试并确认因仍共用新增和强制补齐而失败**

Run:

```bash
./node_modules/.bin/vitest run src/views/dashboard/CoefficientCalculationPage.test.ts --exclude='.pnpm-store/**' --exclude='.worktrees/**' --exclude='.superpowers/**'
```

Expected: FAIL，独立行数或新 `data-testid` 断言失败。

- [ ] **Step 3: 修改数据类型和旧数据归一化**

将两类行都扩展为 `{ id, code, autoCode }`，并把计算行归一化改成完全独立：

```ts
type StoredRowIdentity = { id?: string; code?: string; autoCode?: boolean }

type StandardContentRow = Record<ContentElementKey, number | null> & {
  id: string
  code: string
  autoCode: boolean
}

interface CalculationRow {
  id: string
  code: string
  autoCode: boolean
  inputs: Record<CalculationInputKey, number | null>
}

interface CoefficientCalculationStorage {
  parameters?: Partial<LabParameter>
  addCount?: number // 只兼容读取旧数据
  standardAddCount?: number
  calculationAddCount?: number
  standardRows?: Array<Partial<Record<ContentElementKey, number | null>> & StoredRowIdentity>
  calculationRows?: Array<StoredRowIdentity & {
    inputs?: Partial<Record<CalculationInputKey, number | null>>
  }>
}

function createStandardRow(index: number): StandardContentRow {
  return {
    id: `standard-${Date.now()}-${index}`,
    code: formatCoefficientRowCode(index),
    autoCode: true,
    aluminum: null,
    silicon: null,
    iron: null,
    calcium: null,
    magnesium: null,
    titanium: null
  }
}

function createCalculationRow(index: number): CalculationRow {
  return {
    id: `calculation-${Date.now()}-${index}`,
    code: formatCoefficientRowCode(index),
    autoCode: true,
    inputs: {
      ironRaw: null,
      siliconRaw: null,
      aluminumRaw: null,
      calciumRaw: null,
      magnesiumRaw: null,
      titaniumRaw: null
    }
  }
}

const standardRows = reactive<StandardContentRow[]>(normalizeStandardRows(savedState.standardRows))
const calculationRows = reactive<CalculationRow[]>(normalizeCalculationRows(savedState.calculationRows))

function normalizeCalculationRows(rows: CoefficientCalculationStorage['calculationRows']) {
  const source = rows?.length ? rows : [{}, {}, {}]
  return source.map((row, index) => {
    const next = createCalculationRow(index + 1)
    next.id = typeof row.id === 'string' && row.id.trim() ? row.id : next.id
    next.code = typeof row.code === 'string' ? row.code : next.code
    next.autoCode = inferCoefficientRowAutoCode(next.code, index + 1, row.autoCode)
    calculationElements.forEach((element) => {
      next.inputs[element.inputField] = normalizeNullableNumber(row.inputs?.[element.inputField])
    })
    return next
  })
}
```

`normalizeStandardRows` 同样在保留六项含量后执行：

```ts
next.autoCode = inferCoefficientRowAutoCode(next.code, index + 1, row.autoCode)
```

`readSavedState` 明确归一化新旧三个数量字段：

```ts
return {
  parameters: normalizeParameters(parsed.parameters),
  addCount: normalizePositiveInteger(parsed.addCount),
  standardAddCount: normalizePositiveInteger(parsed.standardAddCount),
  calculationAddCount: normalizePositiveInteger(parsed.calculationAddCount),
  standardRows: parsed.standardRows,
  calculationRows: parsed.calculationRows
}
```

删除原来的 `minCount` 参数和 `while (normalized.length < minCount)` 补齐循环。

- [ ] **Step 4: 拆分新增数量、函数和模板控件**

```ts
const legacyAddCount = normalizePositiveInteger(savedState.addCount) || 1
const standardAddCount = ref(savedState.standardAddCount || legacyAddCount)
const calculationAddCount = ref(savedState.calculationAddCount || legacyAddCount)

function addStandardRows() {
  for (let offset = 0; offset < standardAddCount.value; offset += 1) {
    standardRows.push(createStandardRow(standardRows.length + 1))
  }
}

function addCalculationRows() {
  for (let offset = 0; offset < calculationAddCount.value; offset += 1) {
    calculationRows.push(createCalculationRow(calculationRows.length + 1))
  }
}
```

在“标样含量”底部绑定 `standardAddCount` / `addStandardRows`，并在“标样系数计算”表格底部新增绑定 `calculationAddCount` / `addCalculationRows` 的独立控件。给两张表行和两个按钮加上测试标识。

- [ ] **Step 5: 更新持久化结构和监听**

```ts
const payload: CoefficientCalculationStorage = {
  parameters: { ...parameters },
  standardAddCount: standardAddCount.value,
  calculationAddCount: calculationAddCount.value,
  standardRows: standardRows.map((row) => ({ ...row })),
  calculationRows: calculationRows.map((row) => ({
    id: row.id,
    code: row.code,
    autoCode: row.autoCode,
    inputs: { ...row.inputs }
  }))
}

watch(
  [parameters, standardRows, calculationRows, standardAddCount, calculationAddCount],
  saveState,
  { deep: true }
)
```

- [ ] **Step 6: 运行页面测试和完整前端真实源码测试**

Run:

```bash
./node_modules/.bin/vitest run src/views/dashboard/CoefficientCalculationPage.test.ts --exclude='.pnpm-store/**' --exclude='.worktrees/**' --exclude='.superpowers/**'
./node_modules/.bin/vitest run --exclude='.pnpm-store/**' --exclude='.worktrees/**' --exclude='.superpowers/**'
```

Expected: 新增测试和既有前端测试全部 PASS。

- [ ] **Step 7: 提交独立状态与新增功能**

```bash
git add src/views/dashboard/CoefficientCalculationPage.vue src/views/dashboard/CoefficientCalculationPage.test.ts
git commit -m "feat: separate coefficient table additions"
```

### Task 3: 两张表独立批量删除界面

**Files:**
- Modify: `src/views/dashboard/CoefficientCalculationPage.vue`
- Modify: `src/views/dashboard/CoefficientCalculationPage.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `deleteCoefficientRows`，Task 2 的独立行数组和 `autoCode`。
- Produces:
  - `standardDeleteMode`, `calculationDeleteMode`
  - `selectedStandardRowIds`, `selectedCalculationRowIds`
  - `confirmStandardDeletion(): Promise<void>`
  - `confirmCalculationDeletion(): Promise<void>`

- [ ] **Step 1: 扩展 Element Plus 测试替身并写失败测试**

Mock `ElMessageBox.confirm`，并为复选框提供可触发 `change` 的替身：

```ts
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

const messageBoxMocks = vi.hoisted(() => ({ confirm: vi.fn() }))

vi.mock('element-plus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('element-plus')>()),
  ElMessage: messageMocks,
  ElMessageBox: messageBoxMocks
}))

const ElCheckboxStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: Boolean },
  emits: ['change'],
  setup(props, { attrs, emit }) {
    return () => h('button', {
      ...attrs,
      type: 'button',
      'aria-pressed': String(props.modelValue),
      onClick: () => emit('change', !props.modelValue)
    })
  }
})

function seedIndependentRows(options: {
  standardRows?: Array<{ id: string; code: string; autoCode: boolean }>
  calculationRows?: Array<{ id: string; code: string; autoCode: boolean; inputs?: Record<string, null> }>
}) {
  window.localStorage.setItem('ys_coefficient_calculation_inputs:guest', JSON.stringify({
    parameters: { ironBlank: 0.123, ironFactor: 29.1 },
    standardRows: options.standardRows,
    calculationRows: options.calculationRows
  }))
}

function rowCodes(wrapper: VueWrapper, kind: 'standard' | 'calculation') {
  return wrapper.findAll(`[data-testid="${kind}-row"]`).map((row) => row.attributes('data-code'))
}

async function selectRow(wrapper: VueWrapper, kind: 'standard' | 'calculation', id: string) {
  await wrapper.get(`[data-testid="select-${kind}-row-${id}"]`).trigger('click')
  await nextTick()
}

it('deletes selected standard rows without touching calculation rows', async () => {
  seedIndependentRows({
    standardRows: [
      { id: 'standard-1', code: '001', autoCode: true },
      { id: 'standard-2', code: '002', autoCode: true },
      { id: 'standard-3', code: '003', autoCode: true }
    ],
    calculationRows: [
      { id: 'calculation-1', code: '001', autoCode: true, inputs: {} },
      { id: 'calculation-2', code: '002', autoCode: true, inputs: {} }
    ]
  })
  messageBoxMocks.confirm.mockResolvedValueOnce('confirm')
  const { wrapper } = mountPage()
  const calculationCodesBefore = rowCodes(wrapper, 'calculation')
  await wrapper.get('[data-testid="delete-standard-rows"]').trigger('click')
  await selectRow(wrapper, 'standard', 'standard-2')
  await wrapper.get('[data-testid="confirm-delete-standard-rows"]').trigger('click')
  await flushPromises()
  expect(rowCodes(wrapper, 'standard')).toEqual(['001', '002'])
  expect(rowCodes(wrapper, 'calculation')).toEqual(calculationCodesBefore)
  expect(messageBoxMocks.confirm).toHaveBeenCalledWith(
    expect.stringContaining('002'),
    expect.stringContaining('标样含量'),
    expect.any(Object)
  )
})

it('keeps a custom calculation code when another calculation row is deleted', async () => {
  seedIndependentRows({
    calculationRows: [
      { id: 'calculation-1', code: '001', autoCode: true, inputs: {} },
      { id: 'calculation-2', code: 'CUSTOM', autoCode: false, inputs: {} },
      { id: 'calculation-3', code: '003', autoCode: true, inputs: {} }
    ]
  })
  messageBoxMocks.confirm.mockResolvedValueOnce('confirm')
  const { wrapper } = mountPage()
  const standardBefore = rowCodes(wrapper, 'standard')
  await wrapper.get('[data-testid="delete-calculation-rows"]').trigger('click')
  await selectRow(wrapper, 'calculation', 'calculation-1')
  await wrapper.get('[data-testid="confirm-delete-calculation-rows"]').trigger('click')
  await flushPromises()
  expect(rowCodes(wrapper, 'calculation')).toEqual(['CUSTOM', '002'])
  expect(rowCodes(wrapper, 'standard')).toEqual(standardBefore)
})

it('refuses to delete every row and keeps at least one sample', async () => {
  seedIndependentRows({
    standardRows: [
      { id: 'standard-1', code: '001', autoCode: true },
      { id: 'standard-2', code: '002', autoCode: true }
    ]
  })
  const { wrapper } = mountPage()
  await wrapper.get('[data-testid="delete-standard-rows"]').trigger('click')
  await selectRow(wrapper, 'standard', 'standard-1')
  await selectRow(wrapper, 'standard', 'standard-2')
  expect(wrapper.get('[data-testid="confirm-delete-standard-rows"]').attributes('disabled')).toBeDefined()
  expect(wrapper.text()).toContain('至少保留一个样品')
  expect(messageBoxMocks.confirm).not.toHaveBeenCalled()
})

it('keeps rows and selections when the confirmation is cancelled', async () => {
  seedIndependentRows({
    standardRows: [
      { id: 'standard-1', code: '001', autoCode: true },
      { id: 'standard-2', code: '002', autoCode: true }
    ]
  })
  messageBoxMocks.confirm.mockRejectedValueOnce('cancel')
  const { wrapper } = mountPage()
  await wrapper.get('[data-testid="delete-standard-rows"]').trigger('click')
  await selectRow(wrapper, 'standard', 'standard-2')
  await wrapper.get('[data-testid="confirm-delete-standard-rows"]').trigger('click')
  await flushPromises()
  expect(rowCodes(wrapper, 'standard')).toEqual(['001', '002'])
  expect(wrapper.get('[data-testid="standard-selection-count"]').text()).toContain('1')
})
```

- [ ] **Step 2: 运行页面测试并确认缺少删除控件而失败**

Run: Task 2 Step 2 的页面测试命令。

Expected: FAIL，找不到删除按钮或选择控件。

- [ ] **Step 3: 实现两套临时选择状态**

```ts
const standardDeleteMode = ref(false)
const calculationDeleteMode = ref(false)
const selectedStandardRowIds = ref<string[]>([])
const selectedCalculationRowIds = ref<string[]>([])

function cancelStandardDeletion() {
  standardDeleteMode.value = false
  selectedStandardRowIds.value = []
}

function cancelCalculationDeletion() {
  calculationDeleteMode.value = false
  selectedCalculationRowIds.value = []
}
```

编号输入框在用户输入时执行 `row.autoCode = false`。程序重编号直接修改 `row.code`，不会触发输入事件，因此保留自动标记。

- [ ] **Step 4: 实现表内复选框、全选和操作区**

两张表分别在删除模式中添加复选框列；表头复选框由该表的选中 ID 和行 ID 计算，不读取另一张表。每张表操作区显示：

```vue
<template v-if="standardDeleteMode">
  <span>已选择 {{ selectedStandardRowIds.length }} 个</span>
  <el-button @click="cancelStandardDeletion">取消</el-button>
  <el-button
    type="danger"
    :disabled="!selectedStandardRowIds.length || selectedStandardRowIds.length >= standardRows.length"
    @click="confirmStandardDeletion"
  >确认删除</el-button>
  <span v-if="selectedStandardRowIds.length >= standardRows.length">至少保留一个样品</span>
</template>
```

系数计算表使用 `calculationDeleteMode`、`selectedCalculationRowIds`、`calculationRows`、`cancelCalculationDeletion` 和 `confirmCalculationDeletion`，并使用 `data-testid="confirm-delete-calculation-rows"`。文案为“标样系数计算”，不得读取标样含量的状态。

- [ ] **Step 5: 实现带编号清单的二次确认和独立删除**

```ts
async function confirmStandardDeletion() {
  if (!selectedStandardRowIds.value.length) return
  if (selectedStandardRowIds.value.length >= standardRows.length) {
    ElMessage.warning('标样含量至少保留一个样品')
    return
  }
  const selected = new Set(selectedStandardRowIds.value)
  const codes = standardRows.filter((row) => selected.has(row.id)).map((row) => row.code)
  try {
    await ElMessageBox.confirm(
      `将删除 ${codes.join('、')}，共 ${codes.length} 个样品。删除后无法撤销，是否继续？`,
      '确认删除标样含量',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  const remaining = deleteCoefficientRows(standardRows, selected)
  standardRows.splice(0, standardRows.length, ...remaining)
  cancelStandardDeletion()
  ElMessage.success(`已删除 ${codes.length} 个标样含量样品`)
}
```

```ts
async function confirmCalculationDeletion() {
  if (!selectedCalculationRowIds.value.length) return
  if (selectedCalculationRowIds.value.length >= calculationRows.length) {
    ElMessage.warning('标样系数计算至少保留一个样品')
    return
  }
  const selected = new Set(selectedCalculationRowIds.value)
  const codes = calculationRows.filter((row) => selected.has(row.id)).map((row) => row.code)
  try {
    await ElMessageBox.confirm(
      `将删除 ${codes.join('、')}，共 ${codes.length} 个样品。删除后无法撤销，是否继续？`,
      '确认删除标样系数计算',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  const remaining = deleteCoefficientRows(calculationRows, selected)
  calculationRows.splice(0, calculationRows.length, ...remaining)
  cancelCalculationDeletion()
  ElMessage.success(`已删除 ${codes.length} 个标样系数计算样品`)
}
```

- [ ] **Step 6: 运行页面测试、工具测试和完整前端测试**

Run:

```bash
./node_modules/.bin/vitest run src/utils/coefficientRows.test.ts src/views/dashboard/CoefficientCalculationPage.test.ts --exclude='.pnpm-store/**' --exclude='.worktrees/**' --exclude='.superpowers/**'
./node_modules/.bin/vitest run --exclude='.pnpm-store/**' --exclude='.worktrees/**' --exclude='.superpowers/**'
```

Expected: 所有测试 PASS；现有“应用系数”测试继续通过。

- [ ] **Step 7: 提交独立批量删除功能**

```bash
git add src/views/dashboard/CoefficientCalculationPage.vue src/views/dashboard/CoefficientCalculationPage.test.ts
git commit -m "feat: delete coefficient rows independently"
```

### Task 4: 集成验证与本地浏览器检查

**Files:**
- Modify only if verification reveals an in-scope defect: files already listed in Tasks 1–3.

**Interfaces:**
- Consumes: Tasks 1–3 的完整页面功能。
- Produces: 可在本地主目录安全集成的已验证分支。

- [ ] **Step 1: 运行真实源码前端测试与后端测试**

Run:

```bash
./node_modules/.bin/vitest run --exclude='.pnpm-store/**' --exclude='.worktrees/**' --exclude='.superpowers/**'
pnpm --filter yangshao-server test
```

Expected: 前端和后端测试全部 PASS。Element Plus 的既有废弃警告可以记录，但不得出现测试失败。

- [ ] **Step 2: 运行三个生产构建目标**

Run:

```bash
pnpm build:all
```

Expected: 客户前端、后台管理端和 NestJS 服务端构建全部退出码 0。

- [ ] **Step 3: 在内置浏览器验证两表独立新增**

打开并刷新 `http://127.0.0.1:5173/data/coefficient`：

1. 记录两表当前行数。
2. 在标样含量新增一行，确认系数计算行数不变。
3. 在标样系数计算新增一行，确认标样含量行数不变。

这些操作只修改当前用户的系数计算本地存储，不调用“应用系数”。

- [ ] **Step 4: 在内置浏览器验证删除、编号和取消流程**

1. 分别进入两张表的删除模式，确认只有当前表出现复选框。
2. 在测试新增的行中验证多选、取消二次确认和成功删除。
3. 验证删除后自动编号补位，另一张表内容不变。
4. 验证全选时不能删除全部样品。
5. 检查浏览器错误日志为空，并把系数计算页保留为 deliverable 标签页。

- [ ] **Step 5: 检查 Git 状态并提交验证中必要修复**

```bash
git status --short
git diff --check
```

若无修复，不创建空提交；若发现范围内问题，先补失败测试，再修复、重跑 Tasks 4 Step 1–2，并提交：

```bash
git add src/utils/coefficientRows.ts src/utils/coefficientRows.test.ts src/views/dashboard/CoefficientCalculationPage.vue src/views/dashboard/CoefficientCalculationPage.test.ts
git commit -m "fix: finalize independent coefficient row controls"
```
