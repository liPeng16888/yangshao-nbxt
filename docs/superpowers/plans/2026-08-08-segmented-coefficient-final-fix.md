# 系数分段应用最终修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复最终审查中的 1 个 Critical、3 个 Important 和 2 个 Minor，使分段系数应用在权限、并发、空白快照和交互边界上可安全交付。

**Architecture:** apply 响应按请求者 grant 脱敏，实时通道只发无敏感载荷的刷新信号，客户端使用自己的 grant 重拉。apply/save/add 统一通过 PostgreSQL `LabSheet` 行锁串行化，并在锁后重读数据；分段空白快照在 JSON 中带非数据库字段标记。前端使用独立 applying 状态阻止关闭、取消和样品编辑。

**Tech Stack:** Vue 3、Pinia、Element Plus、NestJS、Prisma/PostgreSQL、Vitest、TypeScript

## Global Constraints

- 不新增数据库迁移，不改变现有普通参数接口。
- 每个真实触发场景必须先有失败测试并确认 RED，再写生产代码。
- 只发布一次安全的实时刷新信号，不在 SSE 中携带完整表格。
- 分段标记只存在 `parameterSnapshot` JSON，表级 `parameters` 和新增样品保持普通语义。
- 所有验证命令必须记录到 `final-fix-report.md`。

---

### Task 1: grant 边界与安全实时信号

**Files:**
- Modify: `server/src/lab-sheets/lab-sheets.controller.ts`
- Modify: `server/src/lab-sheets/lab-sheets.service.ts`
- Modify: `server/src/lab-sheets/lab-sheet-realtime.service.ts`
- Create: `server/src/lab-sheets/lab-sheets.controller.test.ts`
- Modify: `server/src/lab-sheets/lab-sheets.service.test.ts`
- Modify: `src/api/labSheet.ts`
- Create: `src/api/labSheet.test.ts`
- Modify: `src/stores/labSheet.ts`
- Modify: `src/stores/labSheet.test.ts`

**Interfaces:**
- Consumes: `AuthService.isFeatureProtected/hasAccessGrant`、`getLabSheetByDate()`。
- Produces: `applyCurrentParametersFromIndex(..., canViewCompletedSensitiveData)` 和无 `sheet` 载荷的 `sheet-reloaded`。

- [ ] 先写 controller/service/API/store 失败测试：无 grant 响应脱敏、API 携带 grant、SSE 不带 sheet、接收端按自身 grant 重拉。
- [ ] 运行目标 Vitest 文件，确认失败来自当前越权响应/直接广播行为。
- [ ] 控制器计算 grant 布尔值，service 按该值转 DTO，apply/add 只发一次无敏感载荷的刷新信号。
- [ ] API 合并 client-id 和 access-grant header；store 收到刷新信号后调用 `getLabSheetByDate`。
- [ ] 重跑目标测试确认 GREEN。

### Task 2: 分段空白快照与普通参数语义

**Files:**
- Modify: `server/src/lab-sheets/lab-sheets.service.test.ts`
- Modify: `server/src/lab-sheets/lab-sheets.service.ts`
- Modify: `src/types/labSheet.ts`
- Modify: `src/stores/labSheet.test.ts`
- Modify: `src/stores/labSheet.ts`
- Modify: `src/mocks/db.ts`

**Interfaces:**
- Produces: `LabParameterSnapshot.segmentedApplication?: true`。

- [ ] 先写“003 应用 A、008 应用 B、空白 005 首次录入仍用 A”的前后端失败测试。
- [ ] 补一条普通参数更新后普通空白块仍使用最新表级参数的保护测试。
- [ ] 确认 RED 后，apply 在快照 JSON 加 `segmentedApplication: true`，save/patch/mock 只在无该标记时执行普通首次录入覆盖。
- [ ] 重跑目标测试确认 GREEN。

### Task 3: 数据库级共享串行化协议

**Files:**
- Modify: `server/src/lab-sheets/lab-sheets.service.test.ts`
- Modify: `server/src/lab-sheets/lab-sheets.service.ts`

**Interfaces:**
- Produces: `withSheetWriteLock(sheetId, operation)`，在 PostgreSQL `LabSheet` 行上执行 `SELECT ... FOR UPDATE`。

- [ ] 为 apply/save/add 各写一个可确定测试：行锁 mock 改变数据后，后续查询必须读到最新 inputs/parameters，并断言锁先于读。
- [ ] 运行服务测试确认 RED。
- [ ] 将 apply/save/add 全部放入共享交互式事务，先锁表行，后用 transaction client 重读、校验、计算和写入；变更日志也使用同一 transaction client。
- [ ] 重跑服务测试确认 GREEN。

### Task 4: 前端应用互斥与不丢本地修改

**Files:**
- Modify: `src/components/lab-sheet/CoefficientApplicationDialog.test.ts`
- Modify: `src/components/lab-sheet/CoefficientApplicationDialog.vue`
- Modify: `src/stores/labSheet.test.ts`
- Modify: `src/stores/labSheet.ts`
- Modify: `src/views/dashboard/LabDataPage.test.ts`
- Modify: `src/views/dashboard/LabDataPage.vue`
- Modify: `src/views/dashboard/CoefficientCalculationPage.vue`

**Interfaces:**
- Produces: Pinia `applyingParameters` 布尔状态。

- [ ] 先用 deferred apply promise 写失败测试：请求中取消/关闭/Escape 均无效，grid readonly，`patchBlock` 不产生新脏数据。
- [ ] 运行目标前端测试确认 RED。
- [ ] 新增 `applyingParameters`，从开始预保存到响应处理全程互斥；对话框关闭入口和数据网格统一使用该状态。
- [ ] 重跑目标测试确认 GREEN。

### Task 5: 严格校验、边界恢复和确认文案

**Files:**
- Modify: `server/src/lab-sheets/lab-sheets.service.test.ts`
- Modify: `server/src/lab-sheets/lab-sheets.service.ts`
- Create: `src/mocks/db.test.ts`
- Modify: `src/mocks/db.ts`
- Modify: `src/views/dashboard/CoefficientCalculationPage.test.ts`
- Modify: `src/views/dashboard/CoefficientCalculationPage.vue`
- Modify: `src/components/lab-sheet/CoefficientApplicationDialog.test.ts`
- Modify: `src/components/lab-sheet/CoefficientApplicationDialog.vue`

- [ ] 先写 `null`、字符串/布尔/数组 startIndex、非有限/缺失参数、mock 不存在边界的失败测试。
- [ ] 先写前端不存在边界错误后刷新当天数据并要求重选的失败测试。
- [ ] 先写文案失败测试，断言“立即重新计算所选及后续已有样品”，首样也包含“（含）”。
- [ ] 确认 RED 后实现服务与 mock 同构校验、页面边界恢复和完整影响提示。
- [ ] 重跑目标测试确认 GREEN。

### Task 6: 验证、自审、报告与提交

**Files:**
- Create: `.superpowers/sdd/2026-08-08-segmented-coefficient-application/final-fix-report.md`

- [ ] 运行所有目标/覆盖测试并记录通过计数。
- [ ] 运行 `pnpm test:all`和 `pnpm build:all`，读取完整输出和 exit code。
- [ ] 用 `git diff --check`、`git diff --stat`、`git diff` 逐项对照 Critical/Important/Minor 要求，确认无迁移。
- [ ] 写 `final-fix-report.md`，列出每项 RED/GREEN 命令、计数、修复映射、commit 和 concerns。
- [ ] 提交清晰 commit，再次检查 `git status --short`。
