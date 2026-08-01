# 月结款本月明细 PNG 导出实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在前台月结款页面实现单客户本月每日元素明细的临时定价、可编辑预览、自动汇总和动态 PNG 导出。

**Architecture:** 继续使用现有 `MonthlySettlementReport.dailyRows` 作为唯一数据源。新增纯账单计算模块生成独立内存草稿并按每行最多五个元素构造表格布局；新增 Canvas 导出模块按照同一布局绘制动态尺寸 PNG；新增独立 Vue 弹窗承载客户选择、单价输入、明细编辑和图片预览，月结款页面只负责传入报表和打开弹窗。

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Element Plus, Vitest, Vue Test Utils, 原生 Canvas 2D API。

## Global Constraints

- 单价只对本次导出有效；重新打开弹窗必须重新填写，不保存到浏览器、后端或数据库。
- 账单标题、日期、元素名称、数量和单价的修改只改变导出草稿，不回写月结款或数据计算原始数据。
- 每行最多显示五组 `元素 | 数量 | 价格`，超过五个元素时自动换行并纵向合并日期区域。
- “铝、硅、铝硅比”遵循现有归并统计口径，其他元素统计保持不变。
- 不修改 Prisma schema，不执行数据库迁移，不新增后端接口，不增加第三方图片导出依赖。

---

## 文件结构

- Create: `src/types/monthlySettlementBill.ts` — 账单草稿、元素汇总和表格布局类型。
- Create: `src/utils/monthlySettlementBill.ts` — 从日报构建草稿、临时定价、重算、校验、每五项分组和文件名清理的纯函数。
- Create: `src/utils/monthlySettlementBill.test.ts` — 纯计算和布局边界测试。
- Create: `src/utils/monthlySettlementBillPng.ts` — Canvas 测量、绘制和 PNG 下载。
- Create: `src/utils/monthlySettlementBillPng.test.ts` — 动态尺寸、绘制失败和下载超时测试。
- Create: `src/components/finance/MonthlySettlementBillExportDialog.vue` — 客户选择、临时定价、编辑区、静态图片预览和导出操作。
- Create: `src/components/finance/MonthlySettlementBillExportDialog.test.ts` — 弹窗交互和只读数据边界测试。
- Modify: `src/views/dashboard/FinanceMonthlySettlementPage.vue` — 增加入口并传入当前月份报表。
- Create: `src/views/dashboard/FinanceMonthlySettlementPage.test.ts` — 页面入口、报表参数和历史月份导出测试。

---

### Task 1: 账单草稿与五元素分组纯计算

**Files:**
- Create: `src/types/monthlySettlementBill.ts`
- Create: `src/utils/monthlySettlementBill.ts`
- Create: `src/utils/monthlySettlementBill.test.ts`

**Interfaces:**
- Consumes: `MonthlySettlementDailyRow[]` from `src/types/financeBills.ts`。
- Produces:
  - `createMonthlyBillDraft(rows, customer, customerDisplay, month): MonthlyBillDraft`
  - `applyMonthlyBillElementPrice(draft, elementKey, unitPrice): MonthlyBillDraft`
  - `updateMonthlyBillEntry(draft, entryId, patch): MonthlyBillDraft`
  - `recalculateMonthlyBillDraft(draft): MonthlyBillDraft`
  - `createMonthlyBillTableLayout(draft, maxGroups?): MonthlyBillTableLayout`
  - `validateMonthlyBillDraft(draft): MonthlyBillValidationError[]`
  - `createMonthlyBillFilename(draft): string`

- [ ] **Step 1: 定义账单类型并编写失败测试**

在 `src/types/monthlySettlementBill.ts` 定义以下结构：

```ts
export interface MonthlyBillEntry {
  id: string
  sourceElementKey: string
  date: string
  elementLabel: string
  quantity: number
  unitPrice: number | null
  subtotal: number
}

export interface MonthlyBillElementTotal {
  elementLabel: string
  quantity: number
  amount: number
}

export interface MonthlyBillDraft {
  title: string
  month: string
  customer: string
  customerDisplay: string
  entries: MonthlyBillEntry[]
  elementTotals: MonthlyBillElementTotal[]
  totalAmount: number
}

export interface MonthlyBillTableRow {
  id: string
  date: string
  dateRowSpan: number
  showDate: boolean
  entries: MonthlyBillEntry[]
}

export interface MonthlyBillTableLayout {
  groupCount: number
  detailRows: MonthlyBillTableRow[]
  summaryRows: MonthlyBillElementTotal[][]
}

export interface MonthlyBillValidationError {
  field: 'customer' | 'entries' | 'unitPrice' | 'quantity'
  entryId?: string
  message: string
}
```

在 `src/utils/monthlySettlementBill.test.ts` 写入这些核心断言：

```ts
function makeDailyRow(
  date: string,
  customer: string,
  elementCounts: MonthlySettlementElementCount[]
): MonthlySettlementDailyRow {
  return {
    id: `${date}__${customer}`,
    date,
    customer,
    customerDisplay: customer,
    sampleCount: 1,
    amount: 0,
    elementCounts
  }
}

function makeDraftWithEntries(): MonthlyBillDraft {
  return {
    title: '客户甲化验账单',
    month: '2026-08',
    customer: '客户甲',
    customerDisplay: '客户甲',
    entries: [{
      id: 'entry-1',
      sourceElementKey: 'sulfur',
      date: '2026-08-01',
      elementLabel: '硫',
      quantity: 1,
      unitPrice: null,
      subtotal: 0
    }],
    elementTotals: [],
    totalAmount: 0
  }
}

function makeDraftWithElementCount(count: number): MonthlyBillDraft {
  return recalculateMonthlyBillDraft({
    title: '客户甲化验账单',
    month: '2026-08',
    customer: '客户甲',
    customerDisplay: '客户甲',
    entries: Array.from({ length: count }, (_, index) => ({
      id: `entry-${index + 1}`,
      sourceElementKey: `element-${index + 1}`,
      date: '2026-08-01',
      elementLabel: `元素${index + 1}`,
      quantity: 1,
      unitPrice: 10,
      subtotal: 10
    })),
    elementTotals: [],
    totalAmount: 0
  })
}

it('builds a detached draft for one customer without mutating report rows', () => {
  const rows = [
    makeDailyRow('2026-08-01', '客户甲', [
      { key: 'aluminumSiliconRatio', label: '铝硅比', count: 2 },
      { key: 'sulfur', label: '硫', count: 1 }
    ]),
    makeDailyRow('2026-08-02', '客户乙', [{ key: 'calcium', label: '钙', count: 3 }])
  ]
  const snapshot = structuredClone(rows)
  const draft = createMonthlyBillDraft(rows, '客户甲', '客户甲 13800000000', '2026-08')

  expect(draft.title).toBe('客户甲 13800000000化验账单')
  expect(draft.entries.map((entry) => [entry.date, entry.elementLabel, entry.quantity])).toEqual([
    ['2026-08-01', '铝硅比', 2],
    ['2026-08-01', '硫', 1]
  ])
  expect(rows).toEqual(snapshot)
})

it('applies prices, recalculates totals and regroups an edited element label', () => {
  let draft = makeDraftWithEntries()
  draft = applyMonthlyBillElementPrice(draft, 'sulfur', 30)
  draft = updateMonthlyBillEntry(draft, 'entry-1', {
    elementLabel: '全硫',
    quantity: 2,
    unitPrice: 35
  })

  expect(draft.entries[0].subtotal).toBe(70)
  expect(draft.elementTotals).toContainEqual({ elementLabel: '全硫', quantity: 2, amount: 70 })
  expect(draft.totalAmount).toBe(70)
})

it('chunks each date and summary into at most five element groups', () => {
  const layout = createMonthlyBillTableLayout(makeDraftWithElementCount(7), 5)

  expect(layout.groupCount).toBe(5)
  expect(layout.detailRows.map((row) => row.entries.length)).toEqual([5, 2])
  expect(layout.detailRows.map((row) => [row.showDate, row.dateRowSpan])).toEqual([
    [true, 2],
    [false, 0]
  ])
  expect(layout.summaryRows.map((row) => row.length)).toEqual([5, 2])
})
```

- [ ] **Step 2: 运行测试并确认因函数尚未存在而失败**

Run:

```bash
pnpm exec vitest run src/utils/monthlySettlementBill.test.ts
```

Expected: FAIL，错误包含 `createMonthlyBillDraft is not a function` 或对应导出不存在。

- [ ] **Step 3: 实现最小纯计算逻辑**

在 `src/utils/monthlySettlementBill.ts` 实现：

```ts
export const MAX_MONTHLY_BILL_ELEMENT_GROUPS = 5

export function createMonthlyBillDraft(
  rows: MonthlySettlementDailyRow[],
  customer: string,
  customerDisplay: string,
  month: string
): MonthlyBillDraft {
  const entries = rows
    .filter((row) => row.customer === customer)
    .flatMap((row) => row.elementCounts.filter((item) => item.count > 0).map((item) => ({
      id: `${row.id}__${item.key}`,
      sourceElementKey: item.key,
      date: row.date,
      elementLabel: item.label,
      quantity: item.count,
      unitPrice: null,
      subtotal: 0
    })))
  return recalculateMonthlyBillDraft({
    title: `${customerDisplay || customer}化验账单`,
    month,
    customer,
    customerDisplay: customerDisplay || customer,
    entries,
    elementTotals: [],
    totalAmount: 0
  })
}

export function roundMonthlyBillMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
```

实现更新函数时必须复制 `draft` 和 `entries`，不能修改传入对象。`recalculateMonthlyBillDraft` 按编辑后的 `elementLabel` 汇总，并按条目顺序保留元素首次出现顺序。`createMonthlyBillTableLayout` 先按日期保持原顺序分组，再用 `slice(index, index + maxGroups)` 分块；第一块设置 `showDate: true` 和完整 `dateRowSpan`，续块设置 `showDate: false`、`dateRowSpan: 0`。

`validateMonthlyBillDraft` 必须返回以下确定性错误：没有客户、没有条目、`unitPrice === null` 或无效、数量无效或小于零。`createMonthlyBillFilename` 输出 `客户名称-YYYY-MM-化验账单.png`，并用 `-` 替换 `\\ / : * ? " < > |`。

- [ ] **Step 4: 运行纯计算测试并确认通过**

Run:

```bash
pnpm exec vitest run src/utils/monthlySettlementBill.test.ts
```

Expected: PASS，覆盖一至五组、七组续行、空明细、缺少单价、金额四舍五入和非法文件名字符。

- [ ] **Step 5: 提交纯计算任务**

```bash
git add src/types/monthlySettlementBill.ts src/utils/monthlySettlementBill.ts src/utils/monthlySettlementBill.test.ts
git commit -m "feat: add monthly bill draft calculations"
```

---

### Task 2: 动态 Canvas PNG 绘制与下载

**Files:**
- Create: `src/utils/monthlySettlementBillPng.ts`
- Create: `src/utils/monthlySettlementBillPng.test.ts`

**Interfaces:**
- Consumes: `MonthlyBillDraft`, `MonthlyBillTableLayout`, `createMonthlyBillTableLayout`, `createMonthlyBillFilename` from Task 1。
- Produces:
  - `createMonthlyBillCanvasLayout(draft): MonthlyBillCanvasLayout`
  - `downloadMonthlyBillAsPng(draft, filename?): Promise<boolean>`

- [ ] **Step 1: 编写动态宽高和失败恢复测试**

在 `src/utils/monthlySettlementBillPng.test.ts` 编写：

```ts
function makeReadyDraft(elementCount: number): MonthlyBillDraft {
  return recalculateMonthlyBillDraft({
    title: '客户甲化验账单',
    month: '2026-08',
    customer: '客户甲',
    customerDisplay: '客户甲',
    entries: Array.from({ length: elementCount }, (_, index) => ({
      id: `entry-${index + 1}`,
      sourceElementKey: `element-${index + 1}`,
      date: '2026-08-01',
      elementLabel: `元素${index + 1}`,
      quantity: 1,
      unitPrice: 10,
      subtotal: 10
    })),
    elementTotals: [],
    totalAmount: 0
  })
}

function mockCanvasContext() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'center',
    textBaseline: 'middle',
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    measureText: vi.fn(() => ({ width: 80 }))
  } as unknown as CanvasRenderingContext2D)
}

it('uses actual groups up to five and grows height for continuation rows', () => {
  const twoGroup = createMonthlyBillCanvasLayout(makeReadyDraft(2))
  const sevenGroup = createMonthlyBillCanvasLayout(makeReadyDraft(7))

  expect(twoGroup.groupCount).toBe(2)
  expect(sevenGroup.groupCount).toBe(5)
  expect(sevenGroup.width).toBeGreaterThan(twoGroup.width)
  expect(sevenGroup.height).toBeGreaterThan(twoGroup.height)
})

it('returns false when canvas context is unavailable', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  await expect(downloadMonthlyBillAsPng(makeReadyDraft(2))).resolves.toBe(false)
})

it('returns false when canvas blob callback does not resolve before timeout', async () => {
  vi.useFakeTimers()
  mockCanvasContext()
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(() => {})

  const result = downloadMonthlyBillAsPng(makeReadyDraft(2))
  await vi.advanceTimersByTimeAsync(5000)
  await expect(result).resolves.toBe(false)
})
```

- [ ] **Step 2: 运行测试并确认缺少 Canvas 实现而失败**

Run:

```bash
pnpm exec vitest run src/utils/monthlySettlementBillPng.test.ts
```

Expected: FAIL，错误指向 `createMonthlyBillCanvasLayout` 或 `downloadMonthlyBillAsPng` 未实现。

- [ ] **Step 3: 实现 Canvas 布局、绘制和下载**

使用固定逻辑尺寸，导出时整体乘以 `PIXEL_RATIO = 2`：

```ts
const PIXEL_RATIO = 2
const DATE_WIDTH = 110
const ELEMENT_WIDTH = 120
const QUANTITY_WIDTH = 70
const PRICE_WIDTH = 110
const TITLE_HEIGHT = 68
const HEADER_HEIGHT = 42
const ROW_HEIGHT = 38
const TOTAL_HEIGHT = 46
const EXPORT_MARGIN = 24

export function createMonthlyBillCanvasLayout(draft: MonthlyBillDraft): MonthlyBillCanvasLayout {
  const table = createMonthlyBillTableLayout(draft, 5)
  const groupWidth = ELEMENT_WIDTH + QUANTITY_WIDTH + PRICE_WIDTH
  const width = DATE_WIDTH + table.groupCount * groupWidth
  const bodyRows = table.detailRows.length + table.summaryRows.length
  const height = TITLE_HEIGHT + HEADER_HEIGHT + bodyRows * ROW_HEIGHT + TOTAL_HEIGHT
  return { width, height, groupCount: table.groupCount, table }
}
```

绘制顺序必须固定为：白色背景、标题、列头、日期明细、元素汇总、总金额。日期续行使用一次 `strokeRect` 绘制覆盖 `dateRowSpan * ROW_HEIGHT` 的合并区域；元素空位补齐边框但不写文字。字体使用 `Arial, PingFang SC, Microsoft YaHei, sans-serif`，正文居中，总金额使用 `#e53935`。

`downloadMonthlyBillAsPng` 必须：

1. 校验 `validateMonthlyBillDraft(draft)` 为空。
2. 创建两倍像素 Canvas 并调用 `context.scale(2, 2)`。
3. 绘制完整布局。
4. 使用 `canvas.toBlob(..., 'image/png')` 下载。
5. 设置 5000ms 超时；任何异常、空 Blob 或超时返回 `false`。
6. 下载成功后延迟 1000ms 清理临时 URL 和 `<a>`。

- [ ] **Step 4: 运行 PNG 工具测试并确认通过**

Run:

```bash
pnpm exec vitest run src/utils/monthlySettlementBillPng.test.ts src/utils/monthlySettlementBill.test.ts
```

Expected: PASS，并确认 7 个元素的图片高度大于 5 个以内的图片、最后总计行包含在布局高度中。

- [ ] **Step 5: 提交 PNG 导出任务**

```bash
git add src/utils/monthlySettlementBillPng.ts src/utils/monthlySettlementBillPng.test.ts
git commit -m "feat: export monthly bills as png"
```

---

### Task 3: 可编辑月结账单导出弹窗

**Files:**
- Create: `src/components/finance/MonthlySettlementBillExportDialog.vue`
- Create: `src/components/finance/MonthlySettlementBillExportDialog.test.ts`

**Interfaces:**
- Props:
  - `visible: boolean`
  - `month: string`
  - `rows: MonthlySettlementDailyRow[]`
- Emits:
  - `close: []`
- Consumes Task 1 draft functions and Task 2 `downloadMonthlyBillAsPng`。

- [ ] **Step 1: 编写弹窗交互失败测试**

测试必须覆盖客户单选、每次打开重置、临时单价、编辑草稿和导出失败：

```ts
const DialogStub = defineComponent({
  props: { modelValue: Boolean },
  template: '<section v-if="modelValue"><slot /><slot name="footer" /></section>'
})

function makeRowsForTwoCustomers(): MonthlySettlementDailyRow[] {
  return [
    {
      id: 'row-a',
      date: '2026-08-01',
      customer: '客户甲',
      customerDisplay: '客户甲',
      sampleCount: 2,
      amount: 120,
      elementCounts: [
        { key: 'aluminumSiliconRatio', label: '铝硅比', count: 2 },
        { key: 'sulfur', label: '硫', count: 1 }
      ]
    },
    {
      id: 'row-b',
      date: '2026-08-01',
      customer: '客户乙',
      customerDisplay: '客户乙',
      sampleCount: 1,
      amount: 50,
      elementCounts: [{ key: 'calcium', label: '钙', count: 1 }]
    }
  ]
}

function mountDialog(overrides: Partial<{
  visible: boolean
  month: string
  rows: MonthlySettlementDailyRow[]
}> = {}) {
  return mount(MonthlySettlementBillExportDialog, {
    props: {
      visible: true,
      month: '2026-08',
      rows: makeRowsForTwoCustomers(),
      ...overrides
    },
    global: {
      plugins: [ElementPlus],
      stubs: { ElDialog: DialogStub }
    }
  })
}

async function selectCustomer(wrapper: ReturnType<typeof mountDialog>, customer: string) {
  wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', customer)
  await nextTick()
}

async function setElementPrice(wrapper: ReturnType<typeof mountDialog>, elementKey: string, value: number) {
  wrapper.get(`[data-element-key="${elementKey}"]`).findComponent({ name: 'ElInputNumber' }).vm.$emit('update:modelValue', value)
  await nextTick()
}

it('builds a draft only after selecting one customer', async () => {
  const wrapper = mountDialog({ rows: makeRowsForTwoCustomers() })
  await selectCustomer(wrapper, '客户甲')

  expect(wrapper.text()).toContain('客户甲化验账单')
  expect(wrapper.findAll('[data-testid="bill-price-input"]')).toHaveLength(2)
  expect(wrapper.text()).not.toContain('客户乙')
})

it('applies a temporary element price and keeps source rows unchanged', async () => {
  const rows = makeRowsForTwoCustomers()
  const snapshot = structuredClone(rows)
  const wrapper = mountDialog({ rows })
  await selectCustomer(wrapper, '客户甲')
  await setElementPrice(wrapper, 'aluminumSiliconRatio', 60)

  expect(wrapper.text()).toContain('¥120.00')
  expect(rows).toEqual(snapshot)
})

it('resets customer and prices whenever the dialog is reopened', async () => {
  const wrapper = mountDialog({ visible: true })
  await selectCustomer(wrapper, '客户甲')
  await wrapper.setProps({ visible: false })
  await wrapper.setProps({ visible: true })

  expect(wrapper.text()).not.toContain('客户甲化验账单')
  expect(wrapper.findAll('[data-testid="bill-price-input"]')).toHaveLength(0)
})
```

- [ ] **Step 2: 运行组件测试并确认组件不存在而失败**

Run:

```bash
pnpm exec vitest run src/components/finance/MonthlySettlementBillExportDialog.test.ts
```

Expected: FAIL，错误包含无法解析 `MonthlySettlementBillExportDialog.vue`。

- [ ] **Step 3: 实现弹窗布局和交互**

组件结构固定为：

```vue
<el-dialog :model-value="visible" title="导出本月详细费用" width="1180px" @close="emit('close')">
  <section class="bill-export-settings">
    <el-select data-testid="bill-customer-select" :model-value="selectedCustomer" @update:model-value="selectCustomer" />
    <div v-if="draft" class="bill-price-grid">
      <label v-for="element in priceElements" :key="element.key">
        <span>{{ element.label }}单价</span>
        <el-input-number
          data-testid="bill-price-input"
          :data-element-key="element.key"
          :model-value="element.unitPrice"
          @update:model-value="updateElementPrice(element.key, $event)"
        />
      </label>
    </div>
  </section>
  <section v-if="draft" class="bill-entry-editor">
    <el-input v-model="draft.title" />
    <el-table :data="draft.entries" border>
      <el-table-column label="日期">
        <template #default="{ row }">
          <el-input :model-value="row.date" @update:model-value="updateEntry(row.id, { date: $event })" />
        </template>
      </el-table-column>
      <el-table-column label="元素">
        <template #default="{ row }">
          <el-input :model-value="row.elementLabel" @update:model-value="updateEntry(row.id, { elementLabel: $event })" />
        </template>
      </el-table-column>
      <el-table-column label="数量">
        <template #default="{ row }">
          <el-input-number :model-value="row.quantity" :min="0" @update:model-value="updateEntry(row.id, { quantity: $event })" />
        </template>
      </el-table-column>
      <el-table-column label="单价">
        <template #default="{ row }">
          <el-input-number :model-value="row.unitPrice" :min="0" :precision="2" @update:model-value="updateEntry(row.id, { unitPrice: $event })" />
        </template>
      </el-table-column>
      <el-table-column label="小计">
        <template #default="{ row }">{{ money(row.subtotal) }}</template>
      </el-table-column>
    </el-table>
  </section>
  <section v-if="draft && tableLayout" class="monthly-bill-preview">
    <h3>{{ draft.title }}</h3>
    <table>
      <thead>
        <tr>
          <th>日期</th>
          <template v-for="groupIndex in tableLayout.groupCount" :key="groupIndex">
            <th>元素</th>
            <th>数量</th>
            <th>价格</th>
          </template>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in tableLayout.detailRows" :key="row.id">
          <td v-if="row.showDate" :rowspan="row.dateRowSpan">{{ formatBillDate(row.date) }}</td>
          <template v-for="groupIndex in tableLayout.groupCount" :key="groupIndex">
            <td>{{ row.entries[groupIndex - 1]?.elementLabel || '' }}</td>
            <td>{{ row.entries[groupIndex - 1]?.quantity ?? '' }}</td>
            <td>{{ row.entries[groupIndex - 1] ? money(row.entries[groupIndex - 1].subtotal) : '' }}</td>
          </template>
        </tr>
        <tr v-for="(summaryRow, summaryIndex) in tableLayout.summaryRows" :key="`summary-${summaryIndex}`" class="summary-row">
          <td v-if="summaryIndex === 0" :rowspan="tableLayout.summaryRows.length">元素合计</td>
          <template v-for="groupIndex in tableLayout.groupCount" :key="groupIndex">
            <td>{{ summaryRow[groupIndex - 1]?.elementLabel || '' }}</td>
            <td>{{ summaryRow[groupIndex - 1]?.quantity ?? '' }}</td>
            <td>{{ summaryRow[groupIndex - 1] ? money(summaryRow[groupIndex - 1].amount) : '' }}</td>
          </template>
        </tr>
        <tr class="grand-total-row">
          <td :colspan="1 + tableLayout.groupCount * 3">合计：{{ money(draft.totalAmount) }}</td>
        </tr>
      </tbody>
    </table>
  </section>
  <template #footer>
    <el-button @click="emit('close')">取消</el-button>
    <el-button type="primary" :loading="exporting" @click="exportPng">保存为 PNG</el-button>
  </template>
</el-dialog>
```

实际静态预览必须使用 `createMonthlyBillTableLayout(draft)`，通过 HTML `<table>` 展示与 PNG 相同的动态列数。日期首行使用 `:rowspan="row.dateRowSpan"`，续行不渲染日期 `<td>`；列头按 `layout.groupCount` 重复输出“元素、数量、价格”。

脚本中的派生值和编辑函数使用以下签名：

```ts
const tableLayout = computed(() => draft.value ? createMonthlyBillTableLayout(draft.value, 5) : null)
const priceElements = computed(() => {
  if (!draft.value) return []
  const map = new Map<string, { key: string; label: string; unitPrice: number | null }>()
  draft.value.entries.forEach((entry) => {
    if (!map.has(entry.sourceElementKey)) {
      map.set(entry.sourceElementKey, {
        key: entry.sourceElementKey,
        label: entry.elementLabel,
        unitPrice: entry.unitPrice
      })
    }
  })
  return Array.from(map.values())
})

function updateEntry(entryId: string, patch: Partial<Pick<MonthlyBillEntry, 'date' | 'elementLabel' | 'quantity' | 'unitPrice'>>) {
  if (!draft.value) return
  draft.value = updateMonthlyBillEntry(draft.value, entryId, patch)
}

function formatBillDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${Number(match[2])}月${Number(match[3])}日` : value
}

function money(value: number) {
  return `¥${value.toFixed(2)}`
}
```

客户选项从 `rows` 按 `customer` 去重，标签优先使用 `customerDisplay`。切换客户时创建全新草稿和空单价。编辑明细通过 `updateMonthlyBillEntry` 替换整个草稿，不能直接修改 props。导出前调用 `validateMonthlyBillDraft`；第一条错误通过 `ElMessage.warning` 显示。导出返回 `false` 时提示“账单图片生成失败，请重试”，成功时提示“账单图片已保存”。

- [ ] **Step 4: 运行组件和计算测试并确认通过**

Run:

```bash
pnpm exec vitest run src/components/finance/MonthlySettlementBillExportDialog.test.ts src/utils/monthlySettlementBill.test.ts src/utils/monthlySettlementBillPng.test.ts
```

Expected: PASS，弹窗没有跨客户数据、没有持久化单价、编辑后总额即时更新、导出按钮防止重复触发。

- [ ] **Step 5: 提交导出弹窗任务**

```bash
git add src/components/finance/MonthlySettlementBillExportDialog.vue src/components/finance/MonthlySettlementBillExportDialog.test.ts
git commit -m "feat: add editable monthly bill export dialog"
```

---

### Task 4: 接入月结款每日客户明细页面

**Files:**
- Modify: `src/views/dashboard/FinanceMonthlySettlementPage.vue`
- Create: `src/views/dashboard/FinanceMonthlySettlementPage.test.ts`

**Interfaces:**
- Consumes: `MonthlySettlementBillExportDialog` from Task 3。
- Produces: “导出本月明细”页面入口，向弹窗传入当前月份和完整 `dailyRows`。

- [ ] **Step 1: 编写页面入口失败测试**

```ts
const store = reactive({
  loading: false,
  monthlySavingId: '',
  monthlySettlementMonth: '2026-08',
  monthlySettlementReport: null as MonthlySettlementReport | null,
  loadMonthlySettlementReport: vi.fn(),
  saveMonthlySettlementRow: vi.fn()
})

vi.mock('@/stores/financeBills', () => ({
  useFinanceBillsStore: () => store
}))

const BillDialogStub = defineComponent({
  name: 'MonthlySettlementBillExportDialog',
  props: {
    visible: Boolean,
    month: String,
    rows: Array
  },
  emits: ['close'],
  template: '<section v-if="visible" data-testid="monthly-bill-dialog" />'
})

function makePageRows(): MonthlySettlementDailyRow[] {
  return [
    {
      id: 'row-a',
      date: '2026-08-01',
      customer: '客户甲',
      customerDisplay: '客户甲',
      sampleCount: 1,
      amount: 60,
      elementCounts: [{ key: 'aluminumSiliconRatio', label: '铝硅比', count: 1 }]
    },
    {
      id: 'row-b',
      date: '2026-08-01',
      customer: '客户乙',
      customerDisplay: '客户乙',
      sampleCount: 1,
      amount: 50,
      elementCounts: [{ key: 'calcium', label: '钙', count: 1 }]
    }
  ]
}

function mountPageWithReport(input: { month: string; dailyRows: MonthlySettlementDailyRow[] }) {
  store.monthlySettlementMonth = input.month
  store.monthlySettlementReport = {
    month: input.month,
    totalSamples: input.dailyRows.reduce((sum, row) => sum + row.sampleCount, 0),
    totalAmount: input.dailyRows.reduce((sum, row) => sum + row.amount, 0),
    dailyRows: input.dailyRows,
    summaryRows: []
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

it('opens the bill export dialog with the current month and unfiltered daily rows', async () => {
  const wrapper = mountPageWithReport({
    month: '2026-08',
    dailyRows: makePageRows()
  })
  await wrapper.get('[data-testid="open-monthly-bill-export"]').trigger('click')

  const dialog = wrapper.getComponent({ name: 'MonthlySettlementBillExportDialog' })
  expect(dialog.props('visible')).toBe(true)
  expect(dialog.props('month')).toBe('2026-08')
  expect(dialog.props('rows')).toHaveLength(2)
})

it('keeps export available when viewing a historical month', async () => {
  const wrapper = mountPageWithReport({ month: '2026-06', dailyRows: makePageRows() })
  expect(wrapper.get('[data-testid="open-monthly-bill-export"]').attributes('disabled')).toBeUndefined()
})
```

- [ ] **Step 2: 运行页面测试并确认按钮不存在而失败**

Run:

```bash
pnpm exec vitest run src/views/dashboard/FinanceMonthlySettlementPage.test.ts
```

Expected: FAIL，错误包含找不到 `[data-testid="open-monthly-bill-export"]`。

- [ ] **Step 3: 增加按钮、弹窗状态和传参**

将第三个面板标题改为操作组：

```vue
<div class="panel__header">
  <h2>月结款每日客户明细</h2>
  <div class="daily-detail-actions">
    <el-button data-testid="open-monthly-bill-export" @click="billExportVisible = true">导出本月明细</el-button>
    <el-select v-model="selectedDailyCustomers" class="customer-filter" multiple />
  </div>
</div>

<MonthlySettlementBillExportDialog
  :visible="billExportVisible"
  :month="report?.month || store.monthlySettlementMonth"
  :rows="report?.dailyRows || []"
  @close="billExportVisible = false"
/>
```

在脚本中导入组件并增加 `const billExportVisible = ref(false)`。导出弹窗必须接收完整 `report.dailyRows`，不能传 `filteredDailyRows`，因为导出弹窗自行执行单客户选择；页面现有多客户筛选只影响下方明细表。

新增响应式样式：桌面端按钮和客户筛选右对齐；窄屏时操作区换行，按钮保持可点击，客户选择框宽度使用 `min(360px, 100%)`。

- [ ] **Step 4: 运行页面及全部新功能测试**

Run:

```bash
pnpm exec vitest run \
  src/views/dashboard/FinanceMonthlySettlementPage.test.ts \
  src/components/finance/MonthlySettlementBillExportDialog.test.ts \
  src/utils/monthlySettlementBill.test.ts \
  src/utils/monthlySettlementBillPng.test.ts
```

Expected: PASS。

- [ ] **Step 5: 提交页面接入任务**

```bash
git add src/views/dashboard/FinanceMonthlySettlementPage.vue src/views/dashboard/FinanceMonthlySettlementPage.test.ts
git commit -m "feat: add monthly settlement bill export entry"
```

---

### Task 5: 完整验证与真实图片检查

**Files:**
- Modify only when verification exposes a defect in files created or changed by Tasks 1-4。

**Interfaces:**
- Consumes all feature interfaces from Tasks 1-4。
- Produces a locally verified PNG export without GitHub or VPS deployment。

- [ ] **Step 1: 运行前端相关回归测试**

Run:

```bash
pnpm exec vitest run \
  src/utils/monthlySettlementBill.test.ts \
  src/utils/monthlySettlementBillPng.test.ts \
  src/components/finance/MonthlySettlementBillExportDialog.test.ts \
  src/views/dashboard/FinanceMonthlySettlementPage.test.ts \
  src/utils/financeBills.test.ts \
  src/stores/financeBills.test.ts
```

Expected: PASS，无未处理 Promise 错误。

- [ ] **Step 2: 运行类型检查、生产构建和差异检查**

Run:

```bash
pnpm build
git diff --check
```

Expected: `vue-tsc --noEmit` 与 Vite build 成功，`git diff --check` 无输出。

- [ ] **Step 3: 在内置浏览器验证单客户账单流程**

使用本地 `http://127.0.0.1:5173/finance/monthly-settlement`：

1. 打开“导出本月明细”。
2. 选择一个存在日报的客户。
3. 确认单价区只出现该客户实际元素。
4. 填写单价并修改一条日期、元素名称、数量和单价。
5. 确认静态预览和总金额立即更新。
6. 导出 PNG，确认文件下载成功。

- [ ] **Step 4: 验证五组和续行图片像素结果**

分别使用包含五个元素和至少六个元素的本地测试数据导出 PNG，使用图片查看工具检查：

- 五个元素全部位于同一行。
- 第六个元素位于续行。
- 日期区域覆盖对应续行且文字居中。
- 元素汇总和红色本月总金额完整显示。
- 图片底部没有裁切，文字没有重叠。

- [ ] **Step 5: 检查浏览器错误并提交最终验证修复**

确认浏览器控制台没有新增错误，然后执行：

```bash
git status --short
git diff --stat
```

如果 Tasks 1-4 的提交后没有额外修复，不创建空提交；如有验证修复，仅暂存本功能文件并提交：

```bash
git add src/types/monthlySettlementBill.ts src/utils/monthlySettlementBill.ts src/utils/monthlySettlementBill.test.ts src/utils/monthlySettlementBillPng.ts src/utils/monthlySettlementBillPng.test.ts src/components/finance/MonthlySettlementBillExportDialog.vue src/components/finance/MonthlySettlementBillExportDialog.test.ts src/views/dashboard/FinanceMonthlySettlementPage.vue src/views/dashboard/FinanceMonthlySettlementPage.test.ts
git commit -m "fix: finalize monthly bill png export"
```

不要推送 GitHub，不要部署 VPS，不要执行数据库迁移。
