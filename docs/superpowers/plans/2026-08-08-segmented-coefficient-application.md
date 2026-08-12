# 系数按起始样品分段应用实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户在“系数计算”页面选择当天起始样品，并以一次原子操作将新空白和系数应用到该样品及其后所有样品，同时立即重算结果。

**Architecture:** 新增一个专用服务端事务接口，利用现有 `LabSheet.parameters` 保存最后生效参数，利用每个 `SampleBlock.parameterSnapshot` 保存分段历史。前端先落库待保存样品，再调用接口并用返回的完整 `LabSheet` 替换 Pinia 状态；独立对话框负责起始样品选择和影响范围提示。

**Tech Stack:** Vue 3、TypeScript、Pinia、Element Plus、NestJS、Prisma、Vitest、Vue Test Utils

## Global Constraints

- 样品编号使用 `SampleBlock.index`，界面按三位数格式显示，不读取用户填写的 `sampleNumber`。
- 所选起始样品必须已存在，且本次应用包含该样品。
- `index < startIndex` 的样品输入、结果和参数快照均不得改变。
- `index >= startIndex` 的样品必须更新完整参数快照并用现有输入重新计算结果，包括尚未填写检测数据的空白样品。
- 表格当前参数必须更新为最后一次成功应用的参数，使后续新增样品继续沿用。
- 表格参数和所有受影响样品必须在同一数据库事务中更新。
- 不新增数据库表或迁移，不改变现有普通参数更新接口。
- 成功后只发布一次 `sheet-reloaded` 实时事件。

---

### Task 1: 服务端原子分段应用

**Files:**
- Modify: `server/src/lab-sheets/lab-sheets.service.test.ts`
- Modify: `server/src/lab-sheets/lab-sheets.service.ts`
- Modify: `server/src/lab-sheets/lab-sheets.controller.ts`

**Interfaces:**
- Consumes: `calculateResults(inputs, parameters)`、`defaultLabParameters`、`businessDateInBeijing()`、Prisma 交互式事务。
- Produces: `LabSheetsService.applyCurrentParametersFromIndex(frontendUserId, payload, sourceClientId)`，以及 `PUT /lab-sheets/parameters/current/apply`。

- [ ] **Step 1: 扩充服务测试的 Prisma 事务假对象**

在 `lab-sheets.service.test.ts` 的测试夹具中增加一个独立事务客户端，并让 `$transaction` 调用真实回调，以便测试服务逻辑而不是测试 mock：

```ts
const transaction = {
  labSheet: {
    findUnique: vi.fn(),
    update: vi.fn()
  },
  sampleBlock: {
    update: vi.fn()
  }
}

const prisma = {
  labSheet: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  },
  sampleBlock: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    createMany: vi.fn()
  },
  $transaction: vi.fn(async (operation: (tx: typeof transaction) => unknown) => operation(transaction))
}
```

在 `beforeEach` 中重置事务返回值，并让 `transaction.sampleBlock.update` 返回合并后的样品结构。

- [ ] **Step 2: 写出“003 起应用且前两项不变”的失败测试**

测试使用手工结果值断言边界，不能用生产公式函数生成 expected：

```ts
it('applies new parameters from the selected sample and recalculates only that range', async () => {
  const today = businessDateInBeijing()
  const oldParameters = { ...defaultLabParameters, ironBlank: 0.04, ironFactor: 10 }
  const newParameters = { ...defaultLabParameters, ironBlank: 0.1, ironFactor: 20 }
  const blocks = [1, 2, 3, 4].map((index) => makeBlock(index, { ironRaw: 1 }, oldParameters))
  prisma.labSheet.findUnique.mockResolvedValue(makeSheet(today, blocks, oldParameters))
  transaction.labSheet.findUnique.mockResolvedValue(makeSheet(today, blocks, oldParameters))

  const result = await service.applyCurrentParametersFromIndex(
    'front-1',
    { parameters: newParameters, startIndex: 3 },
    'client-1'
  )

  expect(transaction.sampleBlock.update).toHaveBeenCalledTimes(2)
  expect(transaction.sampleBlock.update).not.toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: 'block-1' } })
  )
  expect(transaction.sampleBlock.update).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 'block-3' },
    data: expect.objectContaining({
      parameterSnapshot: expect.objectContaining({ ironBlank: 0.1, ironFactor: 20 }),
      results: expect.objectContaining({ iron: 18 })
    })
  }))
  expect(result.parameters).toMatchObject({ ironBlank: 0.1, ironFactor: 20 })
})
```

生产变更若把起始编号写成 `>`、重算前一项或忘记更新快照，此测试必须失败。

- [ ] **Step 3: 运行服务端目标测试并确认 RED**

Run:

```bash
pnpm --filter yangshao-server exec vitest run src/lab-sheets/lab-sheets.service.test.ts
```

Expected: FAIL，提示 `applyCurrentParametersFromIndex is not a function`。

- [ ] **Step 4: 写出重复从 008 覆盖、空白样品和校验的失败测试**

补充独立用例：

```ts
it('overwrites every snapshot from a later boundary including empty blocks', async () => {
  const today = businessDateInBeijing()
  const parametersA = { ...defaultLabParameters, ironFactor: 10 }
  const parametersB = { ...defaultLabParameters, ironFactor: 25 }
  const blocks = Array.from({ length: 10 }, (_, offset) => {
    const index = offset + 1
    return makeBlock(index, index === 10 ? {} : { ironRaw: 1 }, parametersA)
  })
  const before = makeSheet(today, blocks, parametersA)
  const after = makeSheet(today, blocks.map((block) => block.index >= 8
    ? { ...block, parameterSnapshot: parametersB }
    : block), parametersB)
  prisma.labSheet.findUnique.mockResolvedValue(before)
  transaction.labSheet.findUnique.mockResolvedValueOnce(before).mockResolvedValueOnce(after)

  await service.applyCurrentParametersFromIndex(
    'front-1',
    { parameters: parametersB, startIndex: 8 },
    'client-1'
  )

  expect(transaction.sampleBlock.update).toHaveBeenCalledTimes(3)
  expect(transaction.sampleBlock.update.mock.calls.map(([argument]) => argument.where.id))
    .toEqual(['block-8', 'block-9', 'block-10'])
  expect(transaction.sampleBlock.update).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 'block-10' },
    data: expect.objectContaining({
      parameterSnapshot: expect.objectContaining({ ironFactor: 25 })
    })
  }))
})

it.each([
  [{ ...defaultLabParameters }, 0, '起始样品编号必须是正整数'],
  [{ ...defaultLabParameters, ironFactor: Number.NaN }, 1, '参数必须是有限数值']
])('rejects invalid segmented parameter applications', async (parameters, startIndex, message) => {
  await expect(service.applyCurrentParametersFromIndex('front-1', { parameters, startIndex }))
    .rejects.toThrow(message)
  expect(prisma.$transaction).not.toHaveBeenCalled()
})

it('rejects a start index that is not present in the current sheet', async () => {
  const today = businessDateInBeijing()
  const sheet = makeSheet(today, [1, 2, 3, 4].map((index) => makeBlock(index)))
  prisma.labSheet.findUnique.mockResolvedValue(sheet)
  transaction.labSheet.findUnique.mockResolvedValue(sheet)

  await expect(service.applyCurrentParametersFromIndex(
    'front-1',
    { parameters: defaultLabParameters, startIndex: 8 }
  )).rejects.toThrow('起始样品不存在，请刷新后重新选择')

  expect(transaction.labSheet.update).not.toHaveBeenCalled()
  expect(transaction.sampleBlock.update).not.toHaveBeenCalled()
})
```

Expected: 新测试继续因方法缺失而失败。

- [ ] **Step 5: 实现最小服务端事务方法**

在 `lab-sheets.service.ts` 导入 `BadRequestException`，新增完整参数校验和事务方法：

```ts
async applyCurrentParametersFromIndex(
  frontendUserId: string,
  payload: Record<string, unknown>,
  sourceClientId?: string
) {
  const startIndex = Number(payload.startIndex)
  if (!Number.isInteger(startIndex) || startIndex <= 0) {
    throw new BadRequestException('起始样品编号必须是正整数')
  }
  const parameters = this.requireCompleteLabParameters(payload.parameters)
  const current = await this.ensureSheet(frontendUserId, businessDateInBeijing())
  this.assertSheetEditable(current)
  const nextParameters = { ...parameters, savedAt: new Date().toISOString() }

  const updatedSheet = await this.prisma.$transaction(async (tx) => {
    const sheet = await tx.labSheet.findUnique({
      where: { id: current.id },
      include: { sampleBlocks: { orderBy: { index: 'asc' } } }
    })
    if (!sheet) throw new NotFoundException('未找到表格')
    if (!sheet.sampleBlocks.some((block) => block.index === startIndex)) {
      throw new BadRequestException('起始样品不存在，请刷新后重新选择')
    }
    await tx.labSheet.update({
      where: { id: sheet.id },
      data: { parameters: nextParameters as Prisma.InputJsonValue }
    })
    for (const block of sheet.sampleBlocks.filter((item) => item.index >= startIndex)) {
      await tx.sampleBlock.update({
        where: { id: block.id },
        data: {
          parameterSnapshot: nextParameters as Prisma.InputJsonValue,
          results: calculateResults(block.inputs as Record<string, unknown>, nextParameters) as Prisma.InputJsonValue
        }
      })
    }
    const reloaded = await tx.labSheet.findUnique({
      where: { id: sheet.id },
      include: { sampleBlocks: { orderBy: { index: 'asc' } } }
    })
    if (!reloaded) throw new NotFoundException('未找到表格')
    return reloaded
  })

  const dto = this.toSheetDto(updatedSheet, true)
  this.realtime.publish({
    type: 'sheet-reloaded', frontendUserId, date: dto.date, sheetId: dto.id,
    sheet: dto, sourceClientId, updatedAt: new Date().toISOString()
  })
  return dto
}
```

`requireCompleteLabParameters` 必须遍历 `Object.keys(defaultLabParameters)`，要求每个字段都存在且为有限数值，只返回这九个字段，忽略客户端 `savedAt`。

- [ ] **Step 6: 暴露控制器路由**

在普通参数更新路由旁新增：

```ts
@Put('parameters/current/apply')
applyCurrentParameters(
  @CurrentUserInfo() user: CurrentUser,
  @Body() payload: Record<string, unknown>,
  @Headers('x-ys-client-id') sourceClientId?: string
) {
  return this.sheets.applyCurrentParametersFromIndex(user.id, payload, sourceClientId)
}
```

- [ ] **Step 7: 运行服务测试并确认 GREEN**

Run:

```bash
pnpm --filter yangshao-server exec vitest run src/lab-sheets/lab-sheets.service.test.ts
```

Expected: PASS；事务测试确认 001～002 未更新、003 起重算、空白样品更新快照、非法输入被拒绝、实时事件只发布一次。

- [ ] **Step 8: 提交服务端任务**

```bash
git add server/src/lab-sheets/lab-sheets.service.test.ts server/src/lab-sheets/lab-sheets.service.ts server/src/lab-sheets/lab-sheets.controller.ts
git commit -m "feat: apply lab parameters from sample index"
```

---

### Task 2: 前端 API 和 Pinia 原子同步

**Files:**
- Modify: `src/api/labSheet.ts`
- Modify: `src/stores/labSheet.test.ts`
- Modify: `src/stores/labSheet.ts`

**Interfaces:**
- Consumes: Task 1 的 `PUT /lab-sheets/parameters/current/apply` 和完整 `LabSheet` 响应。
- Produces: `applyCurrentParametersFromIndex(parameters, startIndex): Promise<LabSheet>` API，以及 store 的 `applyParametersFromIndex(parameters, startIndex): Promise<boolean>`。

- [ ] **Step 1: 为 store 增加新的 API mock 和成功表格夹具**

在 hoisted mock 中增加：

```ts
applyCurrentParametersFromIndex: vi.fn()
```

成功夹具应完整包含 `id`、`date`、`readonly`、`parameters`、`sampleBlocks`，并让 block-1 保留旧快照、block-2 起使用新快照。

- [ ] **Step 2: 写“先保存待处理数据再分段应用”的失败测试**

```ts
it('flushes pending edits before replacing the sheet with segmented parameters', async () => {
  const store = useLabSheetStore()
  await store.loadCurrentSheet()
  store.patchBlock('block-1', { ironRaw: 1 })
  const newSheet = makeSegmentedSheet(2)
  apiMocks.applyCurrentParametersFromIndex.mockResolvedValue(newSheet)

  const applied = await store.applyParametersFromIndex(newSheet.parameters, 2)

  expect(applied).toBe(true)
  expect(apiMocks.saveSampleBlock.mock.invocationCallOrder[0]).toBeLessThan(
    apiMocks.applyCurrentParametersFromIndex.mock.invocationCallOrder[0]
  )
  expect(store.sheet).toEqual(newSheet)
  expect(store.pendingAutoSaveCount).toBe(0)
})
```

生产变更若先调用应用接口、未替换完整表格或遗留脏状态，此测试必须失败。

- [ ] **Step 3: 写“保存失败时不应用”的失败测试**

```ts
it('does not apply parameters when pending sample edits cannot be saved', async () => {
  apiMocks.saveSampleBlock.mockRejectedValue({ response: { status: 400 }, message: 'bad request' })
  const store = useLabSheetStore()
  await store.loadCurrentSheet()
  store.patchBlock('block-1', { ironRaw: 1 })

  const applied = await store.applyParametersFromIndex(defaultLabParameters, 1)

  expect(applied).toBe(false)
  expect(apiMocks.applyCurrentParametersFromIndex).not.toHaveBeenCalled()
  expect(store.sampleBlocks[0].inputs.ironRaw).toBe(1)
})
```

- [ ] **Step 4: 运行 store 目标测试并确认 RED**

Run:

```bash
pnpm exec vitest run src/stores/labSheet.test.ts
```

Expected: FAIL，提示 store 方法不存在。

- [ ] **Step 5: 实现 API 和 store 方法**

`src/api/labSheet.ts`：

```ts
export async function applyCurrentParametersFromIndex(
  parameters: LabParameter,
  startIndex: number
): Promise<LabSheet> {
  if (useMocks) return mockApplyParametersFromIndex(parameters, startIndex)
  return request.put(
    '/lab-sheets/parameters/current/apply',
    { parameters, startIndex },
    clientHeaders()
  )
}
```

同时在 `src/mocks/db.ts` 增加等价 mock：更新 mock 当前表参数，并仅重算 `index >= startIndex` 的样品。

`src/stores/labSheet.ts`：

```ts
async function applyParametersFromIndex(parameters: LabParameter, startIndex: number) {
  if (!sheet.value || sheet.value.readonly) return false
  const persisted = await persistAllBlocks()
  if (!persisted.success) return false
  saving.value = true
  try {
    sheet.value = await applyCurrentParametersFromIndex(parameters, startIndex)
    resetLocalSaveState()
    syncRealtimeForLoadedSheet()
    return true
  } finally {
    saving.value = false
  }
}
```

把方法加入 store 返回对象；导入 API 时使用别名避免和 store 方法同名。

- [ ] **Step 6: 运行 store 测试并确认 GREEN**

Run:

```bash
pnpm exec vitest run src/stores/labSheet.test.ts
```

Expected: PASS；API 调用顺序、失败短路、完整表格替换和脏状态清理均符合断言。

- [ ] **Step 7: 提交前端数据层任务**

```bash
git add src/api/labSheet.ts src/mocks/db.ts src/stores/labSheet.test.ts src/stores/labSheet.ts
git commit -m "feat: sync segmented lab parameters"
```

---

### Task 3: 起始样品选择对话框和页面接线

**Files:**
- Create: `src/components/lab-sheet/CoefficientApplicationDialog.vue`
- Create: `src/components/lab-sheet/CoefficientApplicationDialog.test.ts`
- Create: `src/views/dashboard/CoefficientCalculationPage.test.ts`
- Modify: `src/views/dashboard/CoefficientCalculationPage.vue`

**Interfaces:**
- Consumes: Task 2 的 `labStore.applyParametersFromIndex(parameters, startIndex)`、`labStore.loadCurrentSheet()` 和 `labStore.sampleBlocks`。
- Produces: 对话框 props `visible`、`sampleIndices`、`loading`；事件 `cancel` 和 `confirm(startIndex)`。

- [ ] **Step 1: 写对话框行为失败测试**

挂载真实 Vue 组件，仅将 Element Plus 的 teleport 容器固定到测试 DOM。测试可观察行为：

```ts
it('requires a start sample and explains the affected range before confirming', async () => {
  const wrapper = mount(CoefficientApplicationDialog, {
    props: { visible: true, sampleIndices: [1, 2, 3, 4], loading: false },
    global: { plugins: [ElementPlus] },
    attachTo: document.body
  })

  expect(wrapper.get('[data-testid="confirm-coefficient-application"]').attributes('disabled')).toBeDefined()
  wrapper.findComponent(ElSelect).vm.$emit('update:modelValue', 3)
  await nextTick()
  expect(wrapper.text()).toContain('003（含）')
  expect(wrapper.text()).toContain('001～002 保持不变')
  await wrapper.get('[data-testid="confirm-coefficient-application"]').trigger('click')
  expect(wrapper.emitted('confirm')).toEqual([[3]])
})
```

再增加关闭/取消不提交、`visible` 再次打开时清空旧选择、空数组禁用确认的用例。

- [ ] **Step 2: 运行组件测试并确认 RED**

Run:

```bash
pnpm exec vitest run src/components/lab-sheet/CoefficientApplicationDialog.test.ts
```

Expected: FAIL，组件文件不存在。

- [ ] **Step 3: 实现最小对话框组件**

组件使用受控显示状态和本地起始编号：

```vue
<el-dialog :model-value="visible" title="选择应用起始样品" width="460px" :close-on-click-modal="false" @close="emit('cancel')">
  <el-form label-position="top">
    <el-form-item label="从哪个样品开始应用">
      <el-select v-model="selectedStartIndex" data-testid="coefficient-start-select" placeholder="请选择样品">
        <el-option v-for="index in sampleIndices" :key="index" :label="formatIndex(index)" :value="index" />
      </el-select>
    </el-form-item>
  </el-form>
  <p v-if="selectedStartIndex" class="application-impact">{{ impactMessage }}</p>
  <template #footer>
    <el-button @click="emit('cancel')">取消</el-button>
    <el-button data-testid="confirm-coefficient-application" type="primary" :loading="loading" :disabled="!selectedStartIndex" @click="emit('confirm', selectedStartIndex!)">确认应用</el-button>
  </template>
</el-dialog>
```

`impactMessage` 根据最小编号和所选编号生成；选择 001 时只提示“001 及后续”，不生成无效的“之前范围”。监听 `visible`，每次由 false 变 true 时将选择清空。

- [ ] **Step 4: 写页面接线失败测试**

页面测试使用真实 Pinia store，mock 网络 API 边界。断言：点击“应用系数”调用 `loadCurrentSheet` 并显示 001～004；确认 003 后 API 收到当前九项参数和 `3`；成功提示包含 003；取消不调用 API；无样品时提示错误且不打开对话框。

```ts
expect(apiMocks.applyCurrentParametersFromIndex).toHaveBeenCalledWith(
  expect.objectContaining({ ironBlank: 0.123, ironFactor: 29.1 }),
  3
)
expect(messageMocks.success).toHaveBeenCalledWith('已从样品 003 开始应用新参数')
```

- [ ] **Step 5: 运行页面测试并确认 RED**

Run:

```bash
pnpm exec vitest run src/views/dashboard/CoefficientCalculationPage.test.ts
```

Expected: FAIL，因为页面仍调用旧的确认框和 `saveParameters`。

- [ ] **Step 6: 接入对话框和新 store 方法**

修改页面：

```ts
const applicationDialogVisible = ref(false)

async function openApplicationDialog() {
  const loaded = await labStore.loadCurrentSheet()
  if (!loaded) return
  if (!labStore.sampleBlocks.length) {
    ElMessage.warning('当天暂无可应用的样品')
    return
  }
  applicationDialogVisible.value = true
}

async function handleApplyParameters(startIndex: number) {
  try {
    const applied = await labStore.applyParametersFromIndex({ ...parameters }, startIndex)
    if (!applied) return
    applicationDialogVisible.value = false
    ElMessage.success(`已从样品 ${String(startIndex).padStart(3, '0')} 开始应用新参数`)
  } catch {
    ElMessage.error('应用系数失败，请稍后重试')
  }
}
```

按钮改为调用 `openApplicationDialog`；模板底部挂载 `CoefficientApplicationDialog`，传入排序后的 `labStore.sampleBlocks.map(block => block.index)`。删除旧 `ElMessageBox.confirm` 依赖。

- [ ] **Step 7: 运行两个 UI 测试并确认 GREEN**

Run:

```bash
pnpm exec vitest run src/components/lab-sheet/CoefficientApplicationDialog.test.ts src/views/dashboard/CoefficientCalculationPage.test.ts
```

Expected: PASS；选择、影响提示、取消、空表、成功和错误路径均通过。

- [ ] **Step 8: 提交 UI 任务**

```bash
git add src/components/lab-sheet/CoefficientApplicationDialog.vue src/components/lab-sheet/CoefficientApplicationDialog.test.ts src/views/dashboard/CoefficientCalculationPage.vue src/views/dashboard/CoefficientCalculationPage.test.ts
git commit -m "feat: choose coefficient application boundary"
```

---

### Task 4: 全量回归、构建和浏览器验收

**Files:**
- Modify only if verification exposes a defect in files already listed above.
- Test: all frontend/admin/server tests and production builds.

**Interfaces:**
- Consumes: Tasks 1～3 的完整功能。
- Produces: 可在 `http://127.0.0.1:5173/data/coefficient` 使用并经浏览器验证的交付结果。

- [ ] **Step 1: 运行前端全量测试**

Run:

```bash
pnpm exec vitest run --exclude '**/.worktrees/**' --exclude '**/.pnpm-store/**' --exclude '**/.superpowers/**'
```

Expected: 所有前端和 admin Vitest 文件 PASS，0 failures。

- [ ] **Step 2: 运行服务端全量测试**

Run:

```bash
pnpm --filter yangshao-server test
```

Expected: 所有服务端 Vitest 文件 PASS，0 failures。

- [ ] **Step 3: 运行完整生产构建**

Run:

```bash
pnpm build:all
```

Expected: 前端 `vue-tsc`/Vite、admin `vue-tsc`/Vite 和 Nest build 均退出码 0。

- [ ] **Step 4: 在本地浏览器验证 003 与 008 两次应用**

在当天数据计算表准备至少 10 个样品并记录初始快照/结果；在系数页执行：

1. 修改空白和系数为 A，从 003 确认应用。
2. 返回数据计算页，验证 001～002 结果不变，003～010 立即按 A 更新。
3. 修改参数为 B，从 008 确认应用。
4. 验证 003～007 仍按 A，008～010 按 B。
5. 新增一个样品并录入检测值，验证使用 B。
6. 检查浏览器控制台错误为 0，确认选择框每次重新打开均不保留旧选择。

- [ ] **Step 5: 检查变更边界与工作树**

Run:

```bash
git diff --check
git status --short
git log -5 --oneline
```

Expected: 无空白错误；只有计划内提交；无未提交文件。

- [ ] **Step 6: 如验收修复产生代码，重新执行受影响测试和完整构建后提交**

```bash
git add server/src/lab-sheets/lab-sheets.service.test.ts server/src/lab-sheets/lab-sheets.service.ts server/src/lab-sheets/lab-sheets.controller.ts src/api/labSheet.ts src/mocks/db.ts src/stores/labSheet.test.ts src/stores/labSheet.ts src/components/lab-sheet/CoefficientApplicationDialog.vue src/components/lab-sheet/CoefficientApplicationDialog.test.ts src/views/dashboard/CoefficientCalculationPage.vue src/views/dashboard/CoefficientCalculationPage.test.ts
git commit -m "fix: complete segmented coefficient verification"
```

若未产生修复，不创建空提交。
