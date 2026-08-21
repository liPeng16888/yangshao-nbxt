# 样品复样 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在客户电脑端和手机端为原始样品创建、录入和留存多组独立复样，并在后台严格只读查看，同时完全隔离收费、财务、预付款、客户统计、短信和报告。

**Architecture:** 复样使用独立 Prisma `SampleRetest` 模型，从属于 `SampleBlock`，父样品用单向 `nextRetestSequence` 分配不回收序号；服务端固化创建时参数快照并权威计算结果。客户 GET 把复样嵌入 `SampleBlock.retests`，写操作使用独立幂等请求、乐观并发和无敏感数据的 SSE 信号；前端复用现有化验表自动保存语义，电脑端渲染紧凑计算带，手机端渲染折叠卡片，后台仅消费 GET DTO。

**Tech Stack:** Vue 3、Pinia、Element Plus、TypeScript、Vite/Vitest、NestJS、Prisma/PostgreSQL、RxJS SSE、pnpm 11.7 兼容安装模式。

**Spec:** `docs/superpowers/specs/2026-08-20-sample-retests-design.md`

## Global Constraints

- 同一原始样品允许多组复样，稳定显示“复样1、复样2……”，删除或作废后序号不回收。
- 复样只保存检测输入、服务端计算结果、创建时最新参数快照、状态和审计；继承父样品资料但不复制收费字段。
- 任一有效检测输入一旦持久化，`everFilled` 永久为 `true`；此后即使清空也只能作废，不能物理删除。
- 复样使用现有 `calculateResults`/`calculateSampleResults` 公式；客户端结果不可信，服务端保存时重新计算。
- 当天工作表可写、历史日期只读；当天已完成父样品可复样，但必须遵守 `COMPLETED_SAMPLE_DATA` 访问授权。
- 前端主账号及拥有 `DATA_MAIN` 的子账号可操作；所有读写使用 `dataOwnerId` 隔离租户，并用实际账号 ID 审计。
- 后台只允许 GET 查看有效和作废复样，禁止后台新增、编辑、删除、作废或恢复。
- 复样不进入财务、预付款、客户总览、短信、报告、样品数量或完成数量计算，不显示差值或合格判定。
- 电脑端复样计算带必须位于原始计算区和“样品金额”行之间；手机端必须完成同一创建、编辑、删除/作废和查看流程。
- 所有功能步骤遵循 RED → 最小 GREEN；不得在测试失败时继续堆叠下一任务。
- 当前隔离工作树安装依赖时必须使用 `pnpm install --frozen-lockfile --config.enable-global-virtual-store=false`；pnpm 11.19 默认全局虚拟仓库会生成不完整链接。若受限网络阻止安装，按工具审批流程重跑，不得借用正在运行的生产预览依赖并执行 Prisma generate。
- 完整基线在功能代码前已有考勤日期、桌面打包等失败；实现时必须保存基线输出，只把新失败判定为本功能回归。
- 未获得用户单独授权前只完成本地代码、测试和浏览器验收，不发布 VPS。

---

## File Map

### New server files

- `server/prisma/migrations/20260820000000_add_sample_retests/migration.sql`：新增复样、幂等请求和父样品序号计数器。
- `server/src/lab-sheets/sample-retest.dto.ts`：复样 DTO、重新计算、只读和完成数据脱敏。
- `server/src/lab-sheets/sample-retest.dto.test.ts`：DTO、公式和脱敏测试。
- `server/src/lab-sheets/sample-retests.service.ts`：复样创建、保存、删除、作废、并发与幂等领域逻辑。
- `server/src/lab-sheets/sample-retests.service.test.ts`：复样领域规则测试。
- `server/src/lab-sheets/sample-retests.schema.test.ts`：Prisma 与迁移契约测试。
- `server/src/admin/data.service.test.ts`：后台授权范围和内嵌复样只读 DTO 测试。

### New customer files

- `src/utils/sampleRetest.ts`：复样检测字段、元素到输入列映射、显示辅助函数。
- `src/utils/sampleRetest.test.ts`：元素映射与空值规则测试。
- `src/components/lab-sheet/SampleRetestDialog.vue`：批量选择父样品并创建复样。
- `src/components/lab-sheet/SampleRetestDialog.test.ts`：选择、完成数据授权和重复提交测试。
- `src/components/lab-sheet/SampleRetestBand.vue`：电脑端紧凑复样计算带。
- `src/components/lab-sheet/SampleRetestBand.test.ts`：位置所需 DOM、输入/结果、只读和动作测试。
- `src/components/lab-sheet/MobileSampleRetests.vue`：手机端复样折叠区和复样卡片。
- `src/components/lab-sheet/MobileSampleRetests.test.ts`：手机完整操作测试。

### New admin files

- `admin/src/components/SampleRetestReadOnlyPanel.vue`：后台复样只读展开内容。
- `admin/src/components/SampleRetestReadOnlyPanel.test.ts`：后台无输入和无写事件测试。
- `admin/src/views/DataStatisticsPage.test.ts`：后台数据页复样展开与 GET-only 测试。

### Existing files to modify

- `server/prisma/schema.prisma`：`SampleBlock.nextRetestSequence`、`SampleRetest`、`SampleRetestWriteRequest`。
- `server/src/common/lab.ts`：复样空输入、检测字段规范化和参数规范化公用函数。
- `server/src/lab-sheets/lab-sheets.service.ts`、`lab-sheets.service.test.ts`：读取时嵌套复样，参数应用不追溯复样。
- `server/src/lab-sheets/lab-sheets.controller.ts`、`lab-sheets.controller.test.ts`：客户复样写路由和访问授权。
- `server/src/lab-sheets/lab-sheet-realtime.service.ts`、`lab-sheet-realtime.service.test.ts`：`retests-changed` 无敏感数据事件。
- `server/src/lab-sheets/lab-sheets.module.ts`：注册复样服务。
- `server/src/admin/data.service.ts`：后台允许租户内嵌有效和作废复样。
- `src/types/labSheet.ts`：复样 DTO 和写载荷类型。
- `src/api/labSheet.ts`、`src/api/labSheet.test.ts`：客户复样 API 与授权头。
- `src/mocks/db.ts`、`src/mocks/db.test.ts`：真实 API 同构 Mock。
- `src/stores/labSheet.ts`、`src/stores/labSheet.test.ts`：复样创建、自动保存、草稿、冲突、删除/作废与实时合并。
- `src/views/dashboard/LabDataPage.vue`、`LabDataPage.test.ts`：工具栏入口、确认动作和新复样定位。
- `src/components/lab-sheet/LabSheetGrid.vue`、`LabSheetGrid.test.ts`：电脑端插入复样计算带。
- `src/components/lab-sheet/MobileLabSampleList.vue`、`MobileLabSampleList.test.ts`：手机样品卡片接入复样区。
- `admin/src/types.ts`、`admin/src/api.ts`：后台只读 DTO 和 Mock GET 数据。
- `admin/src/views/DataStatisticsPage.vue`：后台只读展开。
- `server/src/reports/reports.service.test.ts`、`server/src/finance/finance.service.test.ts`、`server/src/customer-overview/customer-overview.service.test.ts`、`src/utils/sampleReport.test.ts`：业务隔离回归。

---

### Task 1: Prisma 模型、迁移与检测输入公共契约

**Files:**
- Create: `server/prisma/migrations/20260820000000_add_sample_retests/migration.sql`
- Create: `server/src/lab-sheets/sample-retests.schema.test.ts`
- Modify: `server/prisma/schema.prisma`
- Modify: `server/src/common/lab.ts`
- Test: `server/src/common/lab.test.ts`

**Interfaces:**
- Produces: `SampleRetestStatus = ACTIVE | VOID`。
- Produces: `SampleBlock.nextRetestSequence: Int`，默认 1，只递增。
- Produces: `SampleRetest` 和 `SampleRetestWriteRequest` Prisma client。
- Produces: `createEmptyRetestInputs(): Record<string, null>`、`normalizeLabDetectionInputs(value)`、`normalizeLabParameters(value)`。

- [ ] **Step 1: 写失败的 schema 与公共函数测试**

```ts
// server/src/lab-sheets/sample-retests.schema.test.ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('sample retest persistence contract', () => {
  const schema = readFileSync('server/prisma/schema.prisma', 'utf8')
  const migration = readFileSync(
    'server/prisma/migrations/20260820000000_add_sample_retests/migration.sql',
    'utf8'
  )

  it('uses a non-reusable parent sequence counter and independent retest records', () => {
    expect(schema).toContain('nextRetestSequence Int            @default(1)')
    expect(schema).toContain('model SampleRetest {')
    expect(schema).toContain('@@unique([sampleBlockId, sequence])')
    expect(schema).toContain('everFilled        Boolean            @default(false)')
    expect(schema).toContain('model SampleRetestWriteRequest {')
    expect(migration).toContain('ADD COLUMN "nextRetestSequence" INTEGER NOT NULL DEFAULT 1')
  })
})
```

在 `server/src/common/lab.test.ts` 增加：

```ts
it('normalizes only finite retest detection inputs and treats zero as data', () => {
  expect(normalizeLabDetectionInputs({ ironRaw: 0, sampleNumber: '禁止复制', sulfur: '', carbon: Infinity }))
    .toEqual({ ironRaw: 0, sulfur: null, carbon: null })
  expect(hasLabDetectionInput(createEmptyRetestInputs())).toBe(false)
})
```

- [ ] **Step 2: 运行测试确认 RED**

Run:

```bash
./node_modules/.bin/vitest run server/src/lab-sheets/sample-retests.schema.test.ts server/src/common/lab.test.ts --cache=false
```

Expected: FAIL，原因是迁移、模型和三个公共函数尚不存在。

- [ ] **Step 3: 写最小 Prisma 和公共函数实现**

在 `SampleBlock` 增加：

```prisma
nextRetestSequence Int            @default(1)
retests            SampleRetest[]
```

新增：

```prisma
enum SampleRetestStatus {
  ACTIVE
  VOID
}

model SampleRetest {
  id                String             @id @default(uuid())
  sampleBlockId     String
  sequence          Int
  inputs            Json
  results           Json
  parameterSnapshot Json
  everFilled        Boolean            @default(false)
  status            SampleRetestStatus @default(ACTIVE)
  voidReason        String?
  createdById       String
  updatedById       String
  voidedById        String?
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt
  voidedAt          DateTime?

  sampleBlock SampleBlock @relation(fields: [sampleBlockId], references: [id], onDelete: Cascade)

  @@unique([sampleBlockId, sequence])
  @@index([sampleBlockId, status, sequence])
}

model SampleRetestWriteRequest {
  idempotencyKey     String   @id
  requestFingerprint String
  operation          String
  sheetId            String
  sampleBlockId      String?
  sampleRetestId     String?
  responseSnapshot   Json
  createdAt          DateTime @default(now())

  @@index([sheetId, sampleBlockId])
  @@index([sampleRetestId])
  @@index([createdAt])
}
```

迁移 SQL 必须包含对应 enum、两张表、唯一索引、查询索引、`SampleRetest_sampleBlockId_fkey`，以及：

```sql
ALTER TABLE "SampleBlock"
ADD COLUMN "nextRetestSequence" INTEGER NOT NULL DEFAULT 1;
```

在 `server/src/common/lab.ts` 导出：

```ts
export function createEmptyRetestInputs() {
  return Object.fromEntries(labDetectionInputFields.map((field) => [field, null]))
}

export function normalizeLabDetectionInputs(value: unknown) {
  const row = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  return Object.fromEntries(labDetectionInputFields
    .filter((field) => Object.prototype.hasOwnProperty.call(row, field))
    .map((field) => {
      const raw = row[field]
      return [field, typeof raw === 'number' && Number.isFinite(raw) ? raw : null]
    }))
}

export function normalizeLabParameters(value: unknown) {
  const row = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  return Object.fromEntries(Object.entries(defaultLabParameters).map(([key, fallback]) => [
    key,
    typeof row[key] === 'number' && Number.isFinite(row[key]) ? row[key] : fallback
  ])) as typeof defaultLabParameters
}
```

- [ ] **Step 4: 验证 Prisma、生成 client 并确认 GREEN**

Run:

```bash
pnpm --filter yangshao-server exec prisma validate --schema prisma/schema.prisma
pnpm --filter yangshao-server prisma:generate
./node_modules/.bin/vitest run server/src/lab-sheets/sample-retests.schema.test.ts server/src/common/lab.test.ts --cache=false
```

Expected: Prisma valid；测试全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20260820000000_add_sample_retests/migration.sql server/src/common/lab.ts server/src/common/lab.test.ts server/src/lab-sheets/sample-retests.schema.test.ts
git commit -m "feat: add sample retest persistence model"
```

---

### Task 2: 客户读取 DTO、公式重算与完成数据脱敏

**Files:**
- Create: `server/src/lab-sheets/sample-retest.dto.ts`
- Create: `server/src/lab-sheets/sample-retest.dto.test.ts`
- Modify: `server/src/lab-sheets/lab-sheets.service.ts`
- Modify: `server/src/lab-sheets/lab-sheets.service.test.ts`

**Interfaces:**
- Consumes: `normalizeLabParameters`、`calculateResults`、`SampleRetest` 字段。
- Produces: `toSampleRetestDto(row, options): SampleRetestDto`。
- Produces: 每个客户 `SampleBlock` DTO 固定包含按 `sequence asc` 排序的 `retests`。

- [ ] **Step 1: 写 DTO 和工作表读取失败测试**

```ts
it('recalculates a retest from its own snapshot and redacts it with a completed parent', () => {
  const row = makeRetest({
    inputs: { ironRaw: 1 },
    results: { iron: 999 },
    parameterSnapshot: { ...defaultLabParameters, ironFactor: 10 }
  })

  const visible = toSampleRetestDto(row, {
    parentCompleted: true, sheetReadonly: false, canViewCompletedSensitiveData: true
  })
  expect(visible.results.iron).toBe(9.6)

  const hidden = toSampleRetestDto(row, {
    parentCompleted: true, sheetReadonly: false, canViewCompletedSensitiveData: false
  })
  expect(hidden.sensitiveFieldsHidden).toBe(true)
  expect(hidden.inputs.ironRaw).toBeNull()
  expect(hidden.results.iron).toBeNull()
})
```

在 `lab-sheets.service.test.ts` 增加读取断言：父样品的两条复样顺序为 1、2；历史表所有复样 `readonly=true`；参数分段应用后既有复样快照不变。

- [ ] **Step 2: 运行测试确认 RED**

```bash
./node_modules/.bin/vitest run server/src/lab-sheets/sample-retest.dto.test.ts server/src/lab-sheets/lab-sheets.service.test.ts --cache=false
```

Expected: FAIL，原因是 DTO mapper 和嵌套读取尚不存在。

- [ ] **Step 3: 实现同步 DTO mapper 与嵌套读取**

`sample-retest.dto.ts` 导出：

```ts
export type SampleRetestDtoOptions = {
  parentCompleted: boolean
  sheetReadonly: boolean
  canViewCompletedSensitiveData: boolean
}

export function toSampleRetestDto(row: SampleRetestRow, options: SampleRetestDtoOptions) {
  const inputs = normalizeLabDetectionInputs(row.inputs)
  const results = calculateResults(inputs, normalizeLabParameters(row.parameterSnapshot))
  const hidden = options.parentCompleted && !options.canViewCompletedSensitiveData
  return {
    id: row.id,
    sampleBlockId: row.sampleBlockId,
    sequence: row.sequence,
    status: row.status,
    everFilled: row.everFilled,
    readonly: options.sheetReadonly || row.status === 'VOID',
    sensitiveFieldsHidden: hidden,
    inputs: hidden ? redactInputs(inputs) : inputs,
    results: hidden ? redactResults(results) : results,
    parameterSnapshot: row.parameterSnapshot,
    voidReason: row.voidReason,
    createdById: row.createdById,
    updatedById: row.updatedById,
    voidedById: row.voidedById,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    voidedAt: row.voidedAt ? toIso(row.voidedAt) : null
  }
}
```

将 `lab-sheets.service.ts` 中所有 `sampleBlocks` include 改成同一嵌套形状：

```ts
sampleBlocks: {
  orderBy: { index: 'asc' },
  include: { retests: { orderBy: { sequence: 'asc' } } }
}
```

`toBlockDto` 返回：

```ts
retests: (block.retests || []).map((retest) => toSampleRetestDto(retest, {
  parentCompleted: completed,
  sheetReadonly,
  canViewCompletedSensitiveData
}))
```

参数应用只更新 `SampleBlock.parameterSnapshot/results`，不得更新任何 `SampleRetest`。

- [ ] **Step 4: 运行定向测试确认 GREEN**

```bash
./node_modules/.bin/vitest run server/src/lab-sheets/sample-retest.dto.test.ts server/src/lab-sheets/lab-sheets.service.test.ts --cache=false
```

Expected: PASS；完成父样品的复样随同脱敏，历史复样只读，既有快照不被参数应用改写。

- [ ] **Step 5: 提交**

```bash
git add server/src/lab-sheets/sample-retest.dto.ts server/src/lab-sheets/sample-retest.dto.test.ts server/src/lab-sheets/lab-sheets.service.ts server/src/lab-sheets/lab-sheets.service.test.ts
git commit -m "feat: include protected retests in lab sheet reads"
```

---

### Task 3: 批量创建、最新参数快照、不回收序号与幂等

**Files:**
- Create: `server/src/lab-sheets/sample-retests.service.ts`
- Create: `server/src/lab-sheets/sample-retests.service.test.ts`
- Modify: `server/src/lab-sheets/lab-sheets.module.ts`

**Interfaces:**
- Produces: `CreateSampleRetestsPayload = { sampleBlockIds: string[]; idempotencyKey: string }`。
- Produces: `SampleRetestsService.createRetests(user, sheetId, payload, sourceClientId, canViewCompletedSensitiveData)`。
- Produces: 创建响应为 `SampleRetestDto[]`，每项包含 `sampleBlockId` 供客户端合并。

- [ ] **Step 1: 写创建领域失败测试**

至少覆盖以下测试，并使用事务 mock 验证写入顺序：

```ts
it('creates one blank retest per selected parent from the latest sheet parameters', async () => {
  const result = await service.createRetests(frontendUser, 'sheet-1', {
    sampleBlockIds: ['block-1', 'block-2'],
    idempotencyKey: 'create-batch-1'
  }, 'client-1', true)

  expect(result.map((row) => [row.sampleBlockId, row.sequence])).toEqual([
    ['block-1', 3], ['block-2', 1]
  ])
  expect(createdRows.every((row) => row.parameterSnapshot.ironFactor === 31.2)).toBe(true)
  expect(parentUpdates).toEqual([
    { id: 'block-1', nextRetestSequence: 4 },
    { id: 'block-2', nextRetestSequence: 2 }
  ])
})

it('returns the original response for the same idempotency key and rejects a different fingerprint', async () => {
  const payload = { sampleBlockIds: ['block-1'], idempotencyKey: 'same-key' }
  expect(await service.createRetests(frontendUser, 'sheet-1', payload, 'client-1', true))
    .toEqual(await service.createRetests(frontendUser, 'sheet-1', payload, 'client-1', true))
  await expect(service.createRetests(frontendUser, 'sheet-1', {
    sampleBlockIds: ['block-2'], idempotencyKey: 'same-key'
  }, 'client-1', true)).rejects.toMatchObject({ status: 409 })
})
```

另写：重复 `sampleBlockIds` 400、空数组 400、跨租户 404、历史日期 403、批量中一个父样品无效则零创建、已完成父样品在有授权时可创建、删除最高旧复样后仍使用 `nextRetestSequence`。

- [ ] **Step 2: 运行测试确认 RED**

```bash
./node_modules/.bin/vitest run server/src/lab-sheets/sample-retests.service.test.ts --cache=false
```

Expected: FAIL，`SampleRetestsService` 尚不存在。

- [ ] **Step 3: 实现创建与通用幂等基础**

服务类公开签名：

```ts
async createRetests(
  user: CurrentUser,
  sheetId: string,
  payload: CreateSampleRetestsPayload,
  sourceClientId?: string,
  canViewCompletedSensitiveData = false
): Promise<SampleRetestDto[]>
```

实现顺序固定为：

1. `requireIdempotencyKey` 校验非空且不超过 200 字符。
2. `normalizeSampleBlockIds` 校验 1–100 个唯一非空 ID。
3. `writeFingerprint('CREATE', user, sheetId, payload)` 计算稳定 SHA-256。
4. 在 `$transaction` 内用 `SELECT "id" FROM "LabSheet" ... FOR UPDATE` 锁工作表。
5. 读取工作表和全部父样品，校验 `frontendUserId === user.dataOwnerId`、当天可写、选中数量完整。
6. 先解析同幂等键；同指纹返回响应快照，不同指纹抛 `SAMPLE_RETEST_IDEMPOTENCY_CONFLICT`。
7. 对每个父样品使用其 `nextRetestSequence` 创建空白复样，再把计数器更新为 `sequence + 1`。
8. 所有新复样使用同一次读取的 `normalizeLabParameters(sheet.parameters)`；`inputs=createEmptyRetestInputs()`，`results=calculateResults(...)`，`everFilled=false`，三个 actor ID 使用 `user.id`。
9. 在事务内保存 `SampleRetestWriteRequest` 响应快照；事务成功后只发布无输入内容的 `retests-changed` 信号。

核心创建数据必须是：

```ts
const inputs = createEmptyRetestInputs()
const created = await tx.sampleRetest.create({
  data: {
    sampleBlockId: block.id,
    sequence: block.nextRetestSequence,
    inputs,
    results: calculateResults(inputs, parameters),
    parameterSnapshot: parameters,
    everFilled: false,
    status: 'ACTIVE',
    createdById: user.id,
    updatedById: user.id
  }
})
await tx.sampleBlock.update({
  where: { id: block.id },
  data: { nextRetestSequence: block.nextRetestSequence + 1 }
})
```

在 `lab-sheets.module.ts` 注册并导出 `SampleRetestsService`。

- [ ] **Step 4: 运行创建测试确认 GREEN**

```bash
./node_modules/.bin/vitest run server/src/lab-sheets/sample-retests.service.test.ts --cache=false
```

Expected: 创建、事务、租户、历史日期、完成样品、幂等和不回收序号全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add server/src/lab-sheets/sample-retests.service.ts server/src/lab-sheets/sample-retests.service.test.ts server/src/lab-sheets/lab-sheets.module.ts
git commit -m "feat: create idempotent sample retests"
```

---

### Task 4: 复样保存、乐观并发、空白删除与单向作废

**Files:**
- Modify: `server/src/lab-sheets/sample-retests.service.ts`
- Modify: `server/src/lab-sheets/sample-retests.service.test.ts`

**Interfaces:**
- Produces: `SaveSampleRetestPayload = { idempotencyKey; baseUpdatedAt?; baseInputs?; changedFields }`。
- Produces: `DeleteSampleRetestPayload = { idempotencyKey; baseUpdatedAt }`。
- Produces: `VoidSampleRetestPayload = { idempotencyKey; baseUpdatedAt; reason? }`。
- Produces: `saveRetest`、`deleteRetest`、`voidRetest`。

- [ ] **Step 1: 写生命周期失败测试**

```ts
it('persists only detection fields, recalculates from the frozen snapshot, and latches everFilled', async () => {
  const saved = await service.saveRetest(frontendUser, 'sheet-1', 'retest-1', {
    idempotencyKey: 'save-1',
    baseUpdatedAt: '2026-08-20T09:00:00.000Z',
    baseInputs: { ironRaw: null },
    changedFields: { ironRaw: 1, sampleNumber: '不得写入' } as never
  }, 'client-1', true)

  expect(saved.inputs).toMatchObject({ ironRaw: 1 })
  expect(saved.inputs).not.toHaveProperty('sampleNumber')
  expect(saved.results.iron).toBe(9.6)
  expect(saved.everFilled).toBe(true)
})

it('never clears everFilled and rejects physical deletion after data was once saved', async () => {
  await service.saveRetest(frontendUser, 'sheet-1', 'retest-1', {
    idempotencyKey: 'clear-1', changedFields: { ironRaw: null }
  }, 'client-1', true)
  expect(lastUpdate.everFilled).toBe(true)
  await expect(service.deleteRetest(frontendUser, 'sheet-1', 'retest-1', {
    idempotencyKey: 'delete-1', baseUpdatedAt: lastUpdate.updatedAt.toISOString()
  }, 'client-1', true)).rejects.toThrow('已录入数据的复样只能作废')
})
```

另写：`0` 触发 `everFilled`、不同字段并发合并、同字段 409 返回最新安全复样、作废后保存/删除/再次作废拒绝、从未填写的有效复样可删、已填写复样可作废且保留输入/结果/原因/actor/time、历史日期拒绝、完成父样品无授权拒绝、有授权允许、跨租户 404、网络重试同幂等键不重复写。

- [ ] **Step 2: 运行测试确认 RED**

```bash
./node_modules/.bin/vitest run server/src/lab-sheets/sample-retests.service.test.ts --cache=false
```

Expected: 新生命周期测试 FAIL。

- [ ] **Step 3: 实现三种写操作**

公开签名：

```ts
saveRetest(user, sheetId, retestId, payload, sourceClientId, canViewCompletedSensitiveData)
deleteRetest(user, sheetId, retestId, payload, sourceClientId, canViewCompletedSensitiveData)
voidRetest(user, sheetId, retestId, payload, sourceClientId, canViewCompletedSensitiveData)
```

三者共用 `loadWritableRetest`，在事务内校验工作表租户和日期、父样品归属、父 `inputs.completed` 的访问授权、复样状态和 `baseUpdatedAt`。保存只接受 `labDetectionInputFields`：

```ts
const changedFields = normalizeLabDetectionInputs(payload.changedFields)
const nextInputs = { ...normalizeLabDetectionInputs(retest.inputs), ...changedFields }
const everFilled = retest.everFilled || hasLabDetectionInput(nextInputs)
const saved = await tx.sampleRetest.update({
  where: { id: retest.id },
  data: {
    inputs: nextInputs,
    results: calculateResults(nextInputs, normalizeLabParameters(retest.parameterSnapshot)),
    everFilled,
    updatedById: user.id
  }
})
```

删除条件必须同时为 `status=ACTIVE`、`everFilled=false`、当前输入无检测值；作废条件必须为 `status=ACTIVE` 且 `everFilled=true`：

```ts
await tx.sampleRetest.update({
  where: { id: retest.id },
  data: {
    status: 'VOID',
    voidReason: normalizeVoidReason(payload.reason),
    voidedAt: new Date(),
    voidedById: user.id,
    updatedById: user.id
  }
})
```

每个操作使用操作类型参与幂等指纹，并在事务成功后发布一次 `retests-changed`。

- [ ] **Step 4: 运行生命周期测试确认 GREEN**

```bash
./node_modules/.bin/vitest run server/src/lab-sheets/sample-retests.service.test.ts --cache=false
```

Expected: 所有复样服务测试 PASS，且测试明确证明没有调用共享预付款服务。

- [ ] **Step 5: 提交**

```bash
git add server/src/lab-sheets/sample-retests.service.ts server/src/lab-sheets/sample-retests.service.test.ts
git commit -m "feat: manage sample retest lifecycle"
```

---

### Task 5: 客户路由、访问授权与 SSE 信号

**Files:**
- Modify: `server/src/lab-sheets/lab-sheets.controller.ts`
- Modify: `server/src/lab-sheets/lab-sheets.controller.test.ts`
- Modify: `server/src/lab-sheets/lab-sheet-realtime.service.ts`
- Modify: `server/src/lab-sheets/lab-sheet-realtime.service.test.ts`

**Interfaces:**
- Consumes: Task 3–4 的四个服务方法。
- Produces: 四个客户复样写路由。
- Produces: `LabSheetRealtimeEvent.type` 增加 `retests-changed`，事件只含租户、日期、工作表、父样品/复样 ID、来源客户端、actor 和时间。

- [ ] **Step 1: 写控制器和 SSE 失败测试**

```ts
it('passes the parent data owner, actual actor and completed-data grant to retest creation', async () => {
  auth.isFeatureProtected.mockResolvedValue(true)
  auth.hasAccessGrant.mockResolvedValue(true)
  await controller.createRetests(frontendSubUser, 'sheet-1', {
    sampleBlockIds: ['block-1'], idempotencyKey: 'create-1'
  }, 'client-1', 'grant-1')
  expect(retests.createRetests).toHaveBeenCalledWith(
    frontendSubUser, 'sheet-1',
    { sampleBlockIds: ['block-1'], idempotencyKey: 'create-1' },
    'client-1', true
  )
})

it('publishes a refetch-only retest signal without inputs or results', () => {
  realtime.stream('front-1', '2026-08-20').subscribe(listener)
  realtime.publish({
    type: 'retests-changed', frontendUserId: 'front-1', date: '2026-08-20',
    sheetId: 'sheet-1', sampleBlockId: 'block-1', sampleRetestId: 'retest-1',
    updatedAt: '2026-08-20T10:00:00.000Z'
  })
  expect(lastEvent.data).not.toHaveProperty('inputs')
  expect(lastEvent.data).not.toHaveProperty('results')
})
```

另写无授权布尔值传递、主账号与 `DATA_MAIN` 子账号、四种方法对应服务调用以及类级权限装饰器仍覆盖新路由的测试。

- [ ] **Step 2: 运行测试确认 RED**

```bash
./node_modules/.bin/vitest run server/src/lab-sheets/lab-sheets.controller.test.ts server/src/lab-sheets/lab-sheet-realtime.service.test.ts --cache=false
```

Expected: 新路由与事件类型不存在。

- [ ] **Step 3: 实现路由和事件契约**

控制器构造函数注入 `SampleRetestsService`，并增加：

```ts
@Post(':sheetId/sample-retests')
createRetests(...)

@Put(':sheetId/sample-retests/:retestId')
saveRetest(...)

@Delete(':sheetId/sample-retests/:retestId')
deleteRetest(...)

@Patch(':sheetId/sample-retests/:retestId/void')
voidRetest(...)
```

将 Nest import 补齐 `Delete` 和 `Patch`。四个方法都读取：

```ts
@Headers('x-ys-client-id') sourceClientId?: string
@Headers('x-ys-access-grant') grant?: string
```

并用与现有完成数据读取完全相同的逻辑计算：

```ts
const protectedFeature = await this.auth.isFeatureProtected(user, 'COMPLETED_SAMPLE_DATA')
const canView = !protectedFeature || await this.auth.hasAccessGrant(user, grant, 'COMPLETED_SAMPLE_DATA')
```

扩展服务端 SSE interface：

```ts
type: 'connected' | 'block-saved' | 'parameters-updated' | 'sheet-reloaded' | 'retests-changed'
sampleBlockId?: string
sampleRetestId?: string
```

- [ ] **Step 4: 运行控制器和 SSE 测试确认 GREEN**

```bash
./node_modules/.bin/vitest run server/src/lab-sheets/lab-sheets.controller.test.ts server/src/lab-sheets/lab-sheet-realtime.service.test.ts --cache=false
```

Expected: PASS，且 SSE 事件中没有检测数据。

- [ ] **Step 5: 提交**

```bash
git add server/src/lab-sheets/lab-sheets.controller.ts server/src/lab-sheets/lab-sheets.controller.test.ts server/src/lab-sheets/lab-sheet-realtime.service.ts server/src/lab-sheets/lab-sheet-realtime.service.test.ts
git commit -m "feat: expose protected sample retest routes"
```

---

### Task 6: 客户类型、API、元素映射与 Mock 同构

**Files:**
- Create: `src/utils/sampleRetest.ts`
- Create: `src/utils/sampleRetest.test.ts`
- Modify: `src/types/labSheet.ts`
- Modify: `src/api/labSheet.ts`
- Modify: `src/api/labSheet.test.ts`
- Modify: `src/mocks/db.ts`
- Modify: `src/mocks/db.test.ts`
- Modify: customer test fixture helpers that construct typed `SampleBlock`

**Interfaces:**
- Produces: `SampleRetestStatus`、`SampleRetestInputField`、`SampleRetestInput`、`SampleRetest`、四种写 payload。
- Produces: `SampleBlock.retests: SampleRetest[]`。
- Produces: `createSampleRetests`、`saveSampleRetest`、`deleteSampleRetest`、`voidSampleRetest`。
- Produces: `retestGridColumns` 和 `isRetestColumnEnabled(elementNote, column)`，电脑和手机共用。

- [ ] **Step 1: 写类型使用、API 授权头、元素映射和 Mock 失败测试**

在 `src/utils/sampleRetest.test.ts` 写：

```ts
it('maps parent element selection to every required retest input', () => {
  expect(enabledRetestFields('铁、硅、铝硅比、镁、水份、灼减')).toEqual(expect.arrayContaining([
    'ironRaw', 'siliconRaw', 'siliconAdjust', 'aluminumRaw', 'aluminumAdjust',
    'calciumRaw', 'magnesiumRaw', 'waterSample', 'bottleWater', 'bottleWaterSample',
    'moisture', 'crucible', 'sampleWeight', 'burnedCrucibleSample'
  ]))
  expect(enabledRetestFields('铁')).not.toContain('titaniumRaw')
})

it('treats zero as entered data and never exposes difference columns', () => {
  expect(hasRetestInput({ ironRaw: 0 })).toBe(true)
  expect(retestGridColumns.some((column) => /差值|偏差|合格/.test(column.label))).toBe(false)
})
```

在 `src/api/labSheet.test.ts` 验证四个真实请求均携带 `X-YS-Client-Id` 和当前 `X-YS-Access-Grant`，DELETE 把 `baseUpdatedAt/idempotencyKey` 放在 Axios `data`。

在 `src/mocks/db.test.ts` 写完整状态流：创建两次得到序号 1、2；参数在两次创建间改变时快照不同；保存由 Mock 重算；第一次填 `0` 后清空仍 `everFilled=true`；物理删除被拒绝；作废成功且只读。

- [ ] **Step 2: 运行测试确认 RED**

```bash
./node_modules/.bin/vitest run src/utils/sampleRetest.test.ts src/api/labSheet.test.ts src/mocks/db.test.ts --cache=false
```

Expected: FAIL，复样客户契约不存在。

- [ ] **Step 3: 定义类型和共享列映射**

在 `src/types/labSheet.ts` 增加：

```ts
export const sampleRetestInputFields = [
  'ironRaw', 'siliconRaw', 'siliconAdjust', 'aluminumRaw', 'aluminumAdjust',
  'sulfur', 'densityRaw', 'whiteness', 'calciumRaw', 'magnesiumRaw', 'carbon',
  'titaniumRaw', 'waterSample', 'bottleWater', 'bottleWaterSample', 'moisture',
  'crucible', 'sampleWeight', 'burnedCrucibleSample'
] as const

export type SampleRetestInputField = typeof sampleRetestInputFields[number]
export type SampleRetestInput = Partial<Pick<LabSampleInput, SampleRetestInputField>>
export type SampleRetestStatus = 'ACTIVE' | 'VOID'

export interface SampleRetest {
  id: string
  sampleBlockId: string
  sequence: number
  status: SampleRetestStatus
  everFilled: boolean
  readonly: boolean
  sensitiveFieldsHidden?: boolean
  inputs: SampleRetestInput
  results: LabFormulaResult
  parameterSnapshot: LabParameterSnapshot
  voidReason?: string | null
  createdById: string
  updatedById: string
  voidedById?: string | null
  createdAt: string
  updatedAt: string
  voidedAt?: string | null
}
```

`SampleBlock` 增加必需的 `retests: SampleRetest[]`；所有工厂函数和固定 fixture 明确补 `retests: []`，不把它改成可选字段掩盖服务端契约错误。

`src/utils/sampleRetest.ts` 使用 `parseLabElementKeys` 定义 21 个计算列；镁同时启用 `calciumRaw`，铝硅比同时启用铝/硅原始值和调整数，水份启用四个水份/瓶法字段，灼减启用三个灼烧字段。导出：

```ts
export function enabledRetestFields(elementNote: string): SampleRetestInputField[]
export function hasRetestInput(inputs: SampleRetestInput): boolean
export function isRetestColumnEnabled(elementNote: string, column: RetestGridColumn): boolean
export const retestGridColumns: RetestGridColumn[]
```

- [ ] **Step 4: 实现真实 API 和同构 Mock**

API 签名固定为：

```ts
createSampleRetests(sheetId: string, payload: CreateSampleRetestsPayload): Promise<SampleRetest[]>
saveSampleRetest(sheetId: string, retestId: string, payload: SaveSampleRetestPayload): Promise<SampleRetest>
deleteSampleRetest(sheetId: string, retestId: string, payload: DeleteSampleRetestPayload): Promise<{ id: string; sampleBlockId: string; deleted: true }>
voidSampleRetest(sheetId: string, retestId: string, payload: VoidSampleRetestPayload): Promise<SampleRetest>
```

四个真实请求统一 headers：

```ts
{ headers: { ...clientHeaders().headers, ...(accessGrantHeaders()?.headers || {}) } }
```

Mock 在 `LabSheet.sampleBlocks[].retests` 内执行与服务端相同规则；使用父块内部不可回退的 `mockNextRetestSequenceByBlockId` Map，不能用 `retests.length + 1`。

- [ ] **Step 5: 运行定向测试和类型检查确认 GREEN**

```bash
./node_modules/.bin/vitest run src/utils/sampleRetest.test.ts src/api/labSheet.test.ts src/mocks/db.test.ts --cache=false
pnpm exec vue-tsc --noEmit
```

Expected: 测试 PASS，类型检查不再存在缺少 `retests` 的 fixture。

- [ ] **Step 6: 提交**

```bash
git add \
  src/types/labSheet.ts \
  src/utils/sampleRetest.ts \
  src/utils/sampleRetest.test.ts \
  src/api/labSheet.ts \
  src/api/labSheet.test.ts \
  src/mocks/db.ts \
  src/mocks/db.test.ts \
  src/api/financeBills.mock.test.ts \
  src/components/lab-report/LabElementDialogDefaults.test.ts \
  src/components/lab-report/LabReportDialog.mobile.test.ts \
  src/components/lab-report/LabReportDialog.test.ts \
  src/components/lab-report/LabSmsDialog.test.ts \
  src/components/lab-sheet/LabSheetGrid.test.ts \
  src/components/lab-sheet/MobileLabSampleList.test.ts \
  src/stores/financeBills.test.ts \
  src/stores/labSheet.test.ts \
  src/utils/financeBills.test.ts \
  src/utils/labReport.test.ts \
  src/utils/labSampleRules.test.ts \
  src/views/dashboard/CoefficientCalculationPage.test.ts
git commit -m "feat: add customer retest contracts and mock parity"
```

提交前用 `git diff --cached --name-only` 确认 `src` 下只有类型、API、Mock、复样工具和为 `retests: []` 做的 fixture 机械更新，没有提前实现 UI。

---

### Task 7: Pinia 复样创建、自动保存、草稿恢复、冲突与实时合并

**Files:**
- Modify: `src/stores/labSheet.ts`
- Modify: `src/stores/labSheet.test.ts`

**Interfaces:**
- Consumes: Task 6 的四个 API。
- Produces: `createRetests`、`patchRetest`、`persistRetest`、`deleteRetestRecord`、`voidRetestRecord`。
- Produces: 现有 `persistAllBlocks` 同时冲刷原始样品和复样，不改变调用方签名。
- Produces: 本地草稿 v2；兼容读取 v1 原始样品草稿。

- [ ] **Step 1: 扩展 API mocks 并写自动保存失败测试**

在 hoisted `apiMocks` 增加四个复样方法，并写：

```ts
it('creates retests, auto-saves each retest independently, and keeps its frozen snapshot', async () => {
  const store = useLabSheetStore()
  await store.loadCurrentSheet()
  const [created] = await store.createRetests(['block-1'])

  store.patchRetest('block-1', created.id, { ironRaw: 1 })
  await vi.advanceTimersByTimeAsync(900)

  expect(apiMocks.saveSampleRetest).toHaveBeenCalledWith('sheet-1', created.id, expect.objectContaining({
    baseUpdatedAt: created.updatedAt,
    baseInputs: { ironRaw: null },
    changedFields: { ironRaw: 1 },
    idempotencyKey: expect.any(String)
  }))
  expect(store.sampleBlocks[0].retests[0].parameterSnapshot).toEqual(created.parameterSnapshot)
})
```

另写：同一复样 debounce、不同复样并行、瞬时错误复用同 payload/idempotency key、409 保留本机值和草稿、重新加载恢复草稿、原始样品和复样一起阻止日期切换、删除空白后清理队列/草稿、作废替换为只读、`retests-changed` 触发 GET 补拉、补拉时保留本机脏字段、旧页面请求不能写入新日期。

- [ ] **Step 2: 运行 store 测试确认 RED**

```bash
./node_modules/.bin/vitest run src/stores/labSheet.test.ts --cache=false
```

Expected: 新公开方法和复样队列不存在。

- [ ] **Step 3: 增加独立复样脏字段与保存队列**

在 store 内增加按 `retestId` 隔离的状态：

```ts
const retestAutoSaveTimers = new Map<string, number>()
const pendingRetestDirtyFields = new Map<string, Map<SampleRetestInputField, DirtyRetestField>>()
const retestSaveChains = new Map<string, Promise<RetestSaveResult>>()
const preparedRetestSaves = new Map<string, PreparedRetestSaveState>()
const conflictFieldsByRetest = new Map<string, Set<SampleRetestInputField>>()
```

实现：

```ts
async function createRetests(sampleBlockIds: string[]) {
  if (!sheet.value || sheet.value.readonly) throw new Error('历史日期表格仅支持查看，不能创建复样')
  const flushed = await persistAllBlocks({ silent: true })
  if (!flushed.success) throw new Error('仍有数据未保存，请先重试保存')
  const created = await createSampleRetestsApi(sheet.value.id, {
    sampleBlockIds,
    idempotencyKey: crypto.randomUUID()
  })
  mergeCreatedRetests(created, sheet.value.id)
  return created
}

function patchRetest(sampleBlockId: string, retestId: string, patch: Partial<SampleRetestInput>) {
  const target = findRetest(sampleBlockId, retestId)
  if (!target || target.readonly || target.status === 'VOID' || target.sensitiveFieldsHidden) return
  trackRetestDirtyFields(target, patch)
  target.inputs = { ...target.inputs, ...patch }
  target.results = calculateSampleResults(target.inputs, target.parameterSnapshot)
  persistLocalDraft()
  scheduleRetestAutoSave(retestId)
}
```

`prepareRetestSave` 生成 `baseUpdatedAt/baseInputs/changedFields/idempotencyKey`；瞬时错误重试相同对象，内容改变后生成新 key。`mergeSavedRetest` 只清理已发送且 revision 未变化的字段，并用本机仍脏字段重新计算显示结果。

- [ ] **Step 4: 把复样纳入冲刷、草稿和实时补拉**

将当前原始样品冲刷主体提取为私有 `persistAllSampleBlocks`；公开 `persistAllBlocks` 同时等待原始样品与复样：

```ts
const [blockResult, retestResult] = await Promise.all([
  persistAllSampleBlocks({ silent: true }),
  persistAllRetests()
])
return combinePersistResults(blockResult, retestResult)
```

`StoredLabDraft` 写 version 2，并增加：

```ts
retests: Record<string, {
  sampleBlockId: string
  updatedAt: string
  fields: Partial<Record<SampleRetestInputField, { baseValue: unknown; value: unknown; revision: number }>>
  preparedSave?: { signature: string; idempotencyKey: string }
}>
```

读取时接受 `version === 1 || version === 2`；v1 只恢复 `blocks`，v2 同时恢复 `retests`。`applyRemoteSheet` 对每条远端复样调用 `mergeRemoteRetest`，远端干净字段更新、本机脏字段保留、同字段变化进入 `conflictFieldsByRetest`。`handleRealtimeMessage` 把 `retests-changed` 与 `block-saved` 一样视为不可信信号，只执行带当前访问授权的 GET 补拉。

删除和作废在发送前冲刷目标复样；删除成功从父 `retests` 移除并清理全部 Map，作废成功用服务端 DTO 替换并清理草稿。

- [ ] **Step 5: 运行 store 测试确认 GREEN**

```bash
./node_modules/.bin/vitest run src/stores/labSheet.test.ts --cache=false
```

Expected: 现有原始样品自动保存测试与新增复样测试全部 PASS。

- [ ] **Step 6: 提交**

```bash
git add src/stores/labSheet.ts src/stores/labSheet.test.ts
git commit -m "feat: autosave and synchronize sample retests"
```

---

### Task 8: “样品复样”入口、批量选择与创建后定位

**Files:**
- Create: `src/components/lab-sheet/SampleRetestDialog.vue`
- Create: `src/components/lab-sheet/SampleRetestDialog.test.ts`
- Modify: `src/views/dashboard/LabDataPage.vue`
- Modify: `src/views/dashboard/LabDataPage.test.ts`

**Interfaces:**
- Consumes: `labStore.createRetests(sampleBlockIds)`。
- Produces: `SampleRetestDialog` emit `create: [{ sampleBlockIds: string[] }]`。
- Produces: `highlightRetestId` 传给电脑和手机列表。

- [ ] **Step 1: 写对话框和页面失败测试**

```ts
it('places 样品复样 immediately before 标记样品完成 and creates the selected parents', async () => {
  const wrapper = mountPage()
  const labels = wrapper.findAll('.toolbar-right button').map((button) => button.text())
  expect(labels.indexOf('样品复样')).toBe(labels.indexOf('标记样品完成') - 1)

  await findButtonByText(wrapper, '样品复样').trigger('click')
  wrapper.getComponent(SampleRetestDialogStub).vm.$emit('create', { sampleBlockIds: ['block-1'] })
  await flushPromises()
  expect(labStore.createRetests).toHaveBeenCalledWith(['block-1'])
})
```

对话框测试必须断言：显示编号、样品名称、完成状态和复样数量；打开时清空旧选择；`sensitiveFieldsHidden` 的完成样品禁用并显示“验证后可复样”；保存中和空选择不能提交；手机宽度类可用。

- [ ] **Step 2: 运行测试确认 RED**

```bash
./node_modules/.bin/vitest run src/components/lab-sheet/SampleRetestDialog.test.ts src/views/dashboard/LabDataPage.test.ts --cache=false
```

Expected: 按钮、对话框和创建流程不存在。

- [ ] **Step 3: 实现选择对话框**

对话框 props/emits：

```ts
const props = defineProps<{ visible: boolean; blocks: SampleBlock[]; saving?: boolean }>()
const emit = defineEmits<{
  close: []
  create: [payload: { sampleBlockIds: string[] }]
}>()
```

每项文案固定包含：父 `sequence/index`、`sampleNumber || '未填写样品名称'`、`completed ? '已完成' : '未完成'`、`复样 ${block.retests.length} 组`。提交按钮文案“创建复样”，无选择/保存中禁用。

- [ ] **Step 4: 接入工具栏和创建后定位**

在“标记样品完成”按钮前增加：

```vue
<el-button :loading="labStore.saving" :disabled="isPageReadonly" @click="openSampleRetestDialog">
  样品复样
</el-button>
```

页面状态和处理函数：

```ts
const retestDialogVisible = ref(false)
const highlightRetestId = ref('')

async function applySampleRetestCreation(payload: { sampleBlockIds: string[] }) {
  try {
    const created = await labStore.createRetests(payload.sampleBlockIds)
    retestDialogVisible.value = false
    highlightRetestId.value = created[0]?.id || ''
    ElMessage.success(`已创建 ${created.length} 组复样`)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '复样创建失败')
  }
}
```

把 `highlightRetestId` 同时传给 `LabSheetGrid` 和 `MobileLabSampleList`；新建后由子组件滚动并聚焦第一个启用字段。切换日期时清空该 ID。

- [ ] **Step 5: 运行页面测试确认 GREEN**

```bash
./node_modules/.bin/vitest run src/components/lab-sheet/SampleRetestDialog.test.ts src/views/dashboard/LabDataPage.test.ts --cache=false
```

Expected: PASS，按钮顺序与用户标注一致。

- [ ] **Step 6: 提交**

```bash
git add src/components/lab-sheet/SampleRetestDialog.vue src/components/lab-sheet/SampleRetestDialog.test.ts src/views/dashboard/LabDataPage.vue src/views/dashboard/LabDataPage.test.ts
git commit -m "feat: add sample retest creation flow"
```

---

### Task 9: 电脑端紧凑复样计算带

**Files:**
- Create: `src/components/lab-sheet/SampleRetestBand.vue`
- Create: `src/components/lab-sheet/SampleRetestBand.test.ts`
- Modify: `src/components/lab-sheet/LabSheetGrid.vue`
- Modify: `src/components/lab-sheet/LabSheetGrid.test.ts`
- Modify: `src/views/dashboard/LabDataPage.vue`
- Modify: `src/views/dashboard/LabDataPage.test.ts`

**Interfaces:**
- Produces: `SampleRetestBand` emits `update`、`fieldCommit`、`delete`、`void`。
- Produces: `LabSheetGrid` 向页面转发同名复样事件，参数包含 `sampleBlockId` 和 `retestId`。

- [ ] **Step 1: 写计算带位置和行为失败测试**

```ts
it('renders every retest after original calculation cells and before the amount row', () => {
  const wrapper = mountGrid([makeBlockWithRetests(2)])
  const block = wrapper.get('[data-block-id="block-1"]')
  const order = Array.from(block.element.parentElement!.children).map((node) =>
    (node as HTMLElement).dataset.retestId || (node as HTMLElement).dataset.field || ''
  )
  expect(order.indexOf('retest-2')).toBeLessThan(order.indexOf('price'))
  expect(wrapper.findAll('[data-retest-id]')).toHaveLength(2)
})
```

`SampleRetestBand.test.ts` 断言：输入上方/结果下方；只启用父 `elementNote` 对应字段；快照时间和“复样1”显示；空白显示删除、`everFilled=true` 显示作废；VOID 灰色只读；完成数据隐藏时整带加锁；DOM 文本不含“差值/偏差/合格”。

- [ ] **Step 2: 运行测试确认 RED**

```bash
./node_modules/.bin/vitest run src/components/lab-sheet/SampleRetestBand.test.ts src/components/lab-sheet/LabSheetGrid.test.ts src/views/dashboard/LabDataPage.test.ts --cache=false
```

Expected: 复样计算带不存在。

- [ ] **Step 3: 实现独立计算带组件**

组件 props/emits：

```ts
const props = defineProps<{
  parent: SampleBlock
  retest: SampleRetest
  readonly?: boolean
  highlighted?: boolean
}>()
const emit = defineEmits<{
  update: [retestId: string, patch: Partial<SampleRetestInput>]
  fieldCommit: [retestId: string, field: SampleRetestInputField, oldValue: unknown, newValue: unknown]
  delete: [retestId: string]
  void: [retestId: string]
}>()
```

根元素：

```vue
<section
  class="sample-retest-band"
  :class="{ 'is-void': retest.status === 'VOID', 'is-highlighted': highlighted }"
  :data-retest-id="retest.id"
  :aria-label="`复样${retest.sequence}`"
>
```

内部 `display:grid` 使用 `labSheetColumns` 同宽的 23 列。A 列显示“复样N”和状态，B 列显示快照时间、保存状态与删除/作废按钮；C–W 遍历 `retestGridColumns`，启用列用原生 decimal input，顶部输入、底部结果，禁用列为空白占位。输入使用 `parseNumericInput`，结果使用 `formatFormulaValue`。

- [ ] **Step 4: 插入正确位置并连接页面确认动作**

在 `LabSheetGrid.vue` 原始检测结果 template 结束之后、`getAmountLabel(block)` 之前插入：

```vue
<SampleRetestBand
  v-for="retest in block.retests"
  :key="retest.id"
  :parent="block"
  :retest="retest"
  :readonly="readonly"
  :highlighted="retest.id === highlightRetestId"
  @update="(retestId, patch) => emit('retestUpdate', block.id, retestId, patch)"
  @field-commit="(retestId, field, oldValue, newValue) => emit('retestFieldCommit', block.id, retestId, field, oldValue, newValue)"
  @delete="(retestId) => emit('retestDelete', block.id, retestId)"
  @void="(retestId) => emit('retestVoid', block.id, retestId)"
/>
```

页面把 update/commit 接到 store；删除使用 `ElMessageBox.confirm('确认删除这条空白复样吗？')`，作废使用带可选原因输入的 `ElMessageBox.prompt`，成功后分别调用 `deleteRetestRecord` 和 `voidRetestRecord`。取消确认不得调用 API。

- [ ] **Step 5: 运行电脑端测试确认 GREEN**

```bash
./node_modules/.bin/vitest run src/components/lab-sheet/SampleRetestBand.test.ts src/components/lab-sheet/LabSheetGrid.test.ts src/views/dashboard/LabDataPage.test.ts --cache=false
```

Expected: PASS；001 的两组复样位于金额行之前、互相独立且没有差值 UI。

- [ ] **Step 6: 提交**

```bash
git add src/components/lab-sheet/SampleRetestBand.vue src/components/lab-sheet/SampleRetestBand.test.ts src/components/lab-sheet/LabSheetGrid.vue src/components/lab-sheet/LabSheetGrid.test.ts src/views/dashboard/LabDataPage.vue src/views/dashboard/LabDataPage.test.ts
git commit -m "feat: render desktop sample retest bands"
```

---

### Task 10: 手机端复样折叠区与完整操作

**Files:**
- Create: `src/components/lab-sheet/MobileSampleRetests.vue`
- Create: `src/components/lab-sheet/MobileSampleRetests.test.ts`
- Modify: `src/components/lab-sheet/MobileLabSampleList.vue`
- Modify: `src/components/lab-sheet/MobileLabSampleList.test.ts`
- Modify: `src/views/dashboard/LabDataPage.vue`
- Modify: `src/views/dashboard/LabDataPage.test.ts`

**Interfaces:**
- Produces: `MobileSampleRetests` 使用与电脑端相同的 props 和四种业务 emit。
- Produces: `MobileLabSampleList` 转发复样事件，并在 `highlightRetestId` 改变时展开父样品与复样区。

- [ ] **Step 1: 写手机完整流程失败测试**

```ts
it('expands 复样记录, edits one retest, and exposes delete or void by lifecycle', async () => {
  const wrapper = mountMobileRetests(makeBlockWithRetests(2))
  expect(wrapper.get('[data-testid="mobile-retests-toggle"]').text()).toContain('复样记录（2）')
  await wrapper.get('[data-testid="mobile-retests-toggle"]').trigger('click')
  await wrapper.get('[data-retest-id="retest-1"] input[data-retest-field="ironRaw"]').setValue('1')
  await wrapper.get('[data-retest-id="retest-1"] input[data-retest-field="ironRaw"]').trigger('blur')
  expect(wrapper.emitted('update')).toContainEqual(['retest-1', { ironRaw: 1 }])
  expect(wrapper.get('[data-retest-id="retest-1"]').text()).toContain('删除')
  expect(wrapper.get('[data-retest-id="retest-2"]').text()).toContain('作废')
})
```

另写：创建后自动展开/滚动/聚焦；VOID 灰色只读；完成数据锁；历史只读；只渲染父元素；计数包含 VOID；文本无差值；手机 toolbar 展开后能看到“样品复样”。

- [ ] **Step 2: 运行手机测试确认 RED**

```bash
./node_modules/.bin/vitest run src/components/lab-sheet/MobileSampleRetests.test.ts src/components/lab-sheet/MobileLabSampleList.test.ts src/views/dashboard/LabDataPage.test.ts --cache=false
```

Expected: 手机复样区不存在。

- [ ] **Step 3: 实现手机复样组件**

在折叠按钮中固定显示：

```vue
<button data-testid="mobile-retests-toggle" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
  <strong>复样记录（{{ parent.retests.length }}）</strong>
  <span>{{ expanded ? '收起' : '展开' }}</span>
</button>
```

展开后按 `sequence` 显示卡片。每张卡片显示“复样N”、ACTIVE/已作废、创建时间、参数快照时间；使用 `enabledRetestFields(parent.inputs.elementNote || '')` 渲染 decimal 输入和对应结果。`readonly || retest.readonly || sensitiveFieldsHidden` 时禁用全部输入；按钮规则与电脑端一致。

- [ ] **Step 4: 接入样品卡片与页面 store**

在 `MobileLabSampleList.vue` 的原始计算区之后、“保存并录入下一项”之前插入组件并转发：

```vue
<MobileSampleRetests
  :parent="block"
  :readonly="readonly"
  :highlight-retest-id="highlightRetestId"
  @update="(retestId, patch) => emit('retestUpdate', block.id, retestId, patch)"
  @field-commit="(retestId, field, oldValue, newValue) => emit('retestFieldCommit', block.id, retestId, field, oldValue, newValue)"
  @delete="(retestId) => emit('retestDelete', block.id, retestId)"
  @void="(retestId) => emit('retestVoid', block.id, retestId)"
/>
```

页面复用 Task 9 的 store 和确认处理函数，不创建移动端专用 API 或状态。

- [ ] **Step 5: 运行手机测试确认 GREEN**

```bash
./node_modules/.bin/vitest run src/components/lab-sheet/MobileSampleRetests.test.ts src/components/lab-sheet/MobileLabSampleList.test.ts src/views/dashboard/LabDataPage.test.ts --cache=false
```

Expected: PASS，手机可完成创建后的查看、编辑、自动保存、删除空白和作废已填写流程。

- [ ] **Step 6: 提交**

```bash
git add src/components/lab-sheet/MobileSampleRetests.vue src/components/lab-sheet/MobileSampleRetests.test.ts src/components/lab-sheet/MobileLabSampleList.vue src/components/lab-sheet/MobileLabSampleList.test.ts src/views/dashboard/LabDataPage.vue src/views/dashboard/LabDataPage.test.ts
git commit -m "feat: support sample retests on mobile"
```

---

### Task 11: 后台 GET-only 复样查看

**Files:**
- Create: `server/src/admin/data.service.test.ts`
- Create: `admin/src/components/SampleRetestReadOnlyPanel.vue`
- Create: `admin/src/components/SampleRetestReadOnlyPanel.test.ts`
- Create: `admin/src/views/DataStatisticsPage.test.ts`
- Modify: `server/src/admin/data.service.ts`
- Modify: `admin/src/types.ts`
- Modify: `admin/src/api.ts`
- Modify: `admin/src/views/DataStatisticsPage.vue`

**Interfaces:**
- Produces: 既有 `GET /admin/data-statistics/lab-sheets` 在每个 `sampleBlock` 下返回 `retests`。
- Produces: `AdminSampleRetest` 和 `AdminDataSampleBlock` 只读类型。
- Produces: 后台 UI 只展示，不 emit 任何 mutation。

- [ ] **Step 1: 写服务端授权范围和后台 UI 失败测试**

服务端：

```ts
it('returns active and void retests only for allowed frontend accounts', async () => {
  access.getAllowedFrontendUserIds.mockResolvedValue(['front-1'])
  prisma.labSheet.findMany.mockResolvedValue([makeSheetWithRetests('front-1')])
  const result = await service.labSheets(subAdmin, { frontendUserIds: ['front-1'], date: '2026-08-20' })
  expect(result[0].sampleBlocks[0].retests.map((row) => row.status)).toEqual(['ACTIVE', 'VOID'])
  expect(prisma.labSheet.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { frontendUserId: { in: ['front-1'] }, date: '2026-08-20' }
  }))
})
```

后台组件：

```ts
it('renders active and void retests without editable controls or write events', () => {
  const wrapper = mount(SampleRetestReadOnlyPanel, { props: { retests: makeAdminRetests() } })
  expect(wrapper.text()).toContain('复样1')
  expect(wrapper.text()).toContain('已作废')
  expect(wrapper.find('input, textarea, select').exists()).toBe(false)
  expect(wrapper.text()).not.toMatch(/保存|删除|作废操作|恢复/)
})
```

`DataStatisticsPage.test.ts` 断言页面加载只调用 `request.get('/admin/data-statistics/lab-sheets', ...)`，展开显示参数快照、输入、结果、状态和作废原因，不调用 post/put/patch/delete。

- [ ] **Step 2: 运行后台测试确认 RED**

```bash
./node_modules/.bin/vitest run server/src/admin/data.service.test.ts admin/src/components/SampleRetestReadOnlyPanel.test.ts admin/src/views/DataStatisticsPage.test.ts --cache=false
```

Expected: 服务端未 include retests，组件和页面测试不存在。

- [ ] **Step 3: 实现服务端 GET 嵌套数据**

只修改 `AdminDataService.labSheets` 的现有查询：

```ts
sampleBlocks: {
  orderBy: { index: 'asc' },
  include: { retests: { orderBy: { sequence: 'asc' } } }
}
```

映射时为原始 block 增加：

```ts
retests: block.retests.map((retest) => ({
  ...toSampleRetestDto(retest, {
    parentCompleted: Boolean((block.inputs as Record<string, unknown>).completed),
    sheetReadonly: true,
    canViewCompletedSensitiveData: true
  }),
  readonly: true
}))
```

不得修改 `AdminDataController`，不得新增任何 admin 复样 mutation route。

- [ ] **Step 4: 实现后台只读组件、类型与 Mock 防写**

`SampleRetestReadOnlyPanel` props 只有：

```ts
defineProps<{ retests: AdminSampleRetest[] }>()
```

组件不声明 emits。显示列包含序号、状态、创建/更新时间、输入、结果、参数快照、作废时间/原因。`DataStatisticsPage.vue` 在每个原始样品行提供“查看复样（n）”展开内容。

`admin/src/api.ts` 的 Mock GET fixture 加一条 ACTIVE 和一条 VOID 复样；对下列路径的 POST/PUT/PATCH/DELETE 统一抛出“后台复样数据只读”：

```ts
function isAdminRetestWritePath(url: string) {
  return url.startsWith('/admin/data-statistics/lab-sheets') || url.includes('/sample-retests')
}
```

- [ ] **Step 5: 运行后台测试与构建确认 GREEN**

```bash
./node_modules/.bin/vitest run server/src/admin/data.service.test.ts admin/src/components/SampleRetestReadOnlyPanel.test.ts admin/src/views/DataStatisticsPage.test.ts --cache=false
pnpm build:admin
```

Expected: PASS；后台编译成功且复样页面没有写控件或写请求。

- [ ] **Step 6: 提交**

```bash
git add server/src/admin/data.service.ts server/src/admin/data.service.test.ts admin/src/types.ts admin/src/api.ts admin/src/components/SampleRetestReadOnlyPanel.vue admin/src/components/SampleRetestReadOnlyPanel.test.ts admin/src/views/DataStatisticsPage.vue admin/src/views/DataStatisticsPage.test.ts
git commit -m "feat: show sample retests in read-only admin"
```

---

### Task 12: 业务隔离回归、完整验证与浏览器验收

**Files:**
- Modify: `server/src/reports/reports.service.test.ts`
- Modify: `server/src/finance/finance.service.test.ts`
- Modify: `server/src/customer-overview/customer-overview.service.test.ts`
- Modify: `src/utils/sampleReport.test.ts`
- Verify only: prepaid service tests, customer/server builds, Prisma migration, browser pages

**Interfaces:**
- Consumes: 完整复样功能。
- Produces: 创建、填写和作废复样不会改变既有业务汇总的回归证据。

- [ ] **Step 1: 写业务隔离回归测试**

在三个服务 fixture 的同一原始样品下加入两条复样（ACTIVE 和 VOID），输入中使用明显的大数，断言汇总仍只按父 `SampleBlock.inputs` 计算：

```ts
const retests = [
  { id: 'retest-1', status: 'ACTIVE', inputs: { ironRaw: 99 }, results: { iron: 9999 } },
  { id: 'retest-2', status: 'VOID', inputs: { ironRaw: 88 }, results: { iron: 8888 } }
]

expect(report.statusSummaries.find((row) => row.status === '未结款')).toMatchObject({ count: 1, amount: 80 })
expect(financeRow).toMatchObject({ sampleCount: 1, amount: 80 })
expect(customerRow).toMatchObject({ sampleCount: 1, totalAmount: 80 })
```

在 `src/utils/sampleReport.test.ts` 构造带 `retests` 的 `SampleBlock`，断言短信/报告可选性和元素结果只读父 `inputs/results`，不产生额外样品。

- [ ] **Step 2: 运行隔离测试确认当前实现是否安全**

```bash
./node_modules/.bin/vitest run server/src/reports/reports.service.test.ts server/src/finance/finance.service.test.ts server/src/customer-overview/customer-overview.service.test.ts src/utils/sampleReport.test.ts server/src/shared-prepaid/shared-prepaid-ledger.service.test.ts --cache=false
```

Expected: PASS。若任何汇总因 `retests` 增加，修复对应查询只遍历 `sampleBlocks`，然后重跑直到 PASS；不得通过删除隔离断言解决。

- [ ] **Step 3: 提交业务隔离测试**

```bash
git add server/src/reports/reports.service.test.ts server/src/finance/finance.service.test.ts server/src/customer-overview/customer-overview.service.test.ts src/utils/sampleReport.test.ts
git commit -m "test: lock sample retests out of business totals"
```

- [ ] **Step 4: 运行全部定向测试**

```bash
./node_modules/.bin/vitest run \
  server/src/lab-sheets/sample-retests.schema.test.ts \
  server/src/lab-sheets/sample-retest.dto.test.ts \
  server/src/lab-sheets/sample-retests.service.test.ts \
  server/src/lab-sheets/lab-sheets.controller.test.ts \
  server/src/lab-sheets/lab-sheets.service.test.ts \
  server/src/admin/data.service.test.ts \
  src/utils/sampleRetest.test.ts \
  src/api/labSheet.test.ts \
  src/mocks/db.test.ts \
  src/stores/labSheet.test.ts \
  src/views/dashboard/LabDataPage.test.ts \
  src/components/lab-sheet/SampleRetestDialog.test.ts \
  src/components/lab-sheet/SampleRetestBand.test.ts \
  src/components/lab-sheet/LabSheetGrid.test.ts \
  src/components/lab-sheet/MobileSampleRetests.test.ts \
  src/components/lab-sheet/MobileLabSampleList.test.ts \
  admin/src/components/SampleRetestReadOnlyPanel.test.ts \
  admin/src/views/DataStatisticsPage.test.ts \
  --cache=false
```

Expected: 0 failed。

- [ ] **Step 5: 运行 Prisma、完整测试和三端构建**

```bash
pnpm --filter yangshao-server exec prisma validate --schema prisma/schema.prisma
pnpm build
pnpm build:admin
pnpm build:server
./node_modules/.bin/vitest run --cache=false --exclude '.worktrees/**' --exclude '.pnpm-store/**' --exclude '.superpowers/**'
```

Expected: Prisma 和三个构建 exit 0；完整测试的新复样相关文件 0 failed。对于基线已有失败，逐项与实施前保存的失败列表比对，任何新增失败必须修复。

- [ ] **Step 6: 电脑端浏览器验收**

使用本工作树启动客户 Vite 和服务端，在 Codex 内置浏览器电脑视口验证：

1. “样品复样”紧邻并位于“标记样品完成”左侧。
2. 选择 001 创建复样1，再修改参数后创建复样2。
3. 两条复样准确位于原始计算区和“样品金额”之间。
4. 两条分别输入数据并刷新，值、结果和不同参数快照均保留。
5. 确认页面不显示差值、偏差或合格判定。
6. 新建空白复样可删除；填入 `0` 再清空后只能作废；作废记录灰色只读。
7. 完成 001 后撤销访问授权，复样被加密；重新授权后可查看并按当天规则编辑。
8. 用拥有 `DATA_MAIN` 的子账号可操作，无该权限的子账号路由/API 返回 403。

- [ ] **Step 7: 手机端和后台浏览器验收**

手机视口验证创建按钮、`复样记录（n）`、展开、编辑、自动保存、删除/作废和完成数据锁。后台 `http://127.0.0.1:5174/admin/data` 验证 ACTIVE/VOID 均可展开查看，Network 中复样相关请求只有 GET，页面无输入、保存、删除、作废或恢复控件。

- [ ] **Step 8: 迁移与关键数据只读核对**

在本地测试数据库应用迁移前后记录并比较：`LabSheet` 数量、`SampleBlock` 数量、财务金额合计、共享预付款余额合计和客户样品数；迁移后只允许新增 schema 对象和所有父样品 `nextRetestSequence=1`，历史业务值必须一致。不得连接或修改 VPS 生产数据库。

- [ ] **Step 9: 最终工作树核验**

```bash
git status --short
git log --oneline --decorate -12
git diff ac6f8e3...HEAD --check
```

Expected: 工作树干净；提交按任务分层；diff 无空白错误。把实际测试、构建、浏览器和数据核对结果完整报告给用户，不把基线既有失败描述为本功能通过。
