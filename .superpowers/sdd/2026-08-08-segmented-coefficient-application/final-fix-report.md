# 系数分段应用最终修复报告

日期：2026-08-08
分支：`codex/segmented-coefficient-application`
实现提交：`e5f1d13 fix: harden segmented coefficient application`

## 结论

原最终审查中的 1 个 Critical、3 个 Important、2 个 Minor 均已修复。最终自审同时闭合了与本次安全刷新和共享表锁协议直接相连的三个路径：新增样品完整表响应、`block-saved` 实时事件、财务批量结款写入。没有数据库迁移。

状态：`DONE_WITH_CONCERNS`。唯一剩余验证限制是仓库没有可用的多连接 PostgreSQL 集成测试环境；锁后重读和锁顺序已由确定性单元测试证明，最终 Nest 构建也已通过。

## RED 证据

### 第一轮：原最终审查六项

1. 后端授权、脱敏、快照标记、共享锁和严格请求校验：

   ```text
   pnpm --filter yangshao-server exec vitest run src/lab-sheets/lab-sheets.controller.test.ts src/lab-sheets/lab-sheets.service.test.ts
   ```

   RED：2 个测试文件失败，14 failed / 22 passed。失败分别命中 grant 判定、无 grant 响应脱敏、SSE 完整表载荷、分段空白快照、apply/save/add 锁后重读和严格 payload 校验。

2. 客户端 apply grant 请求头：

   ```text
   pnpm exec vitest run src/api/labSheet.test.ts
   ```

   RED：1 failed / 1；请求缺少 `X-YS-Access-Grant`。首次运行暴露的 `localStorage` 测试夹具问题修正后，重新确认了上述行为性 RED。

3. 前端互斥、无信任 SSE 补拉、分段快照、边界恢复、mock 契约和确认文案：

   ```text
   pnpm exec vitest run src/stores/labSheet.test.ts src/components/lab-sheet/CoefficientApplicationDialog.test.ts src/views/dashboard/LabDataPage.test.ts src/views/dashboard/CoefficientCalculationPage.test.ts src/mocks/db.test.ts
   ```

   RED：5 个测试文件失败，21 failed / 42 passed。失败覆盖 deferred apply 期间的关闭/取消/编辑、直接信任 SSE、旧段空白样品首次录入、非法 mock 请求、不存在边界恢复和完整影响提示。

### 第二轮：最终差异自审闭环

4. 新增样品授权、保存事件载荷和财务写锁：

   ```text
   pnpm --filter yangshao-server exec vitest run src/lab-sheets/lab-sheets.controller.test.ts src/lab-sheets/lab-sheets.service.test.ts src/finance/finance.service.test.ts
   ```

   RED：3 个测试文件失败，5 failed / 45 passed。失败明确证明 add 路径未传 grant、add 返回未脱敏表、`block-saved` 携带授权调用者完整块，以及财务结款未在锁后读取最新快照。

5. add grant 请求头与 `block-saved` 无信任补拉：

   ```text
   pnpm exec vitest run src/api/labSheet.test.ts src/stores/labSheet.test.ts
   ```

   RED：2 个测试文件失败，2 failed / 21 passed。失败明确证明 add 未发送 grant，store 直接应用了 SSE 中的块而没有按自身访问上下文补拉。

6. 最终构建诊断：

   ```text
   pnpm build:all
   ```

   RED：`TS6133`，`applyRemoteBlock` 在 `block-saved` 改为安全补拉后成为死代码；删除该私有函数后重新验证。更早的增量构建还捕获并修复了 `src/mocks/db.ts` 的参数键索引 `TS2322`。

## 修复映射

| 审查项 | 修复 | 确定性回归证明 |
| --- | --- | --- |
| Critical：apply 响应和实时事件越权 | apply 与 add 都读取 `COMPLETED_SAMPLE_DATA` grant，按调用者权限脱敏；`sheet-reloaded`、`block-saved` 均只发元数据，各客户端用自己的 grant GET 补拉 | controller/API/service/store 测试分别覆盖拒绝、允许、无敏感载荷和无信任补拉 |
| Important：旧段空白样品首次录入被最新全局参数覆盖 | 仅 apply 写入的 `parameterSnapshot` 带 `segmentedApplication: true`；server/store/mock 首次检测输入只覆盖普通未标记快照；表级参数不带标记 | 003=A、008=B、空白 005 后填仍按 A；普通未标记空白仍按最新表参数 |
| Important：apply/save/add 并发可留下不一致结果 | 三条写路径统一先 `SELECT LabSheet ... FOR UPDATE`，再用 transaction client 重读；add 从最新最大 index 分配；变更日志在同一事务；仓库唯一另一条 SampleBlock 写路径（财务批量结款）也先按 sheet id 排序锁表后重读 | apply/save/add/finance 四个测试用锁 mock 在锁时切换可见状态，并断言锁调用顺序与最新 inputs/snapshot/parameters 计算结果 |
| Important：apply 期间仍可关闭并编辑 | 独立 `applyingParameters` 从预保存开始持续到响应结束；重复应用、patch、字段提交、数据网格、取消、关闭、Escape 均被阻止；响应通过远端合并路径接入 | deferred promise 测试覆盖整个请求窗口并验证无新脏数据、无重复请求 |
| Minor：真实端、mock 和边界恢复不一致 | 顶层 payload 必须是对象，startIndex 必须是 number 正整数，九项参数必须完整有限；mock 同构校验且先校验后变更；不存在边界时刷新当天表并强制重选 | null/array/string/boolean/fraction/NaN/Infinity/缺项/不存在 index 均有回归测试 |
| Minor：确认文案不完整 | 首样也显示“（含）”，并明确“立即重新计算所选及后续已有样品”；非首样说明之前范围保持不变 | 组件文案测试覆盖首样和 003 边界 |

## GREEN 与最终验证

### 目标回归

```text
pnpm --filter yangshao-server exec vitest run src/lab-sheets/lab-sheets.controller.test.ts src/lab-sheets/lab-sheets.service.test.ts src/finance/finance.service.test.ts
```

GREEN：3 files / 50 tests passed。

```text
pnpm exec vitest run src/api/labSheet.test.ts src/stores/labSheet.test.ts src/components/lab-sheet/CoefficientApplicationDialog.test.ts src/views/dashboard/LabDataPage.test.ts src/views/dashboard/CoefficientCalculationPage.test.ts src/mocks/db.test.ts
```

GREEN：6 files / 67 tests passed。

### 全量测试

```text
pnpm test:all
```

最终 GREEN（删除最后一处死代码后重跑）：

- 根 Vitest：51 files / 382 tests passed。
- server Vitest：10 files / 109 tests passed。
- exit code 0。

### 全量构建

```text
pnpm build:all
```

最终 GREEN：客户前端 `vue-tsc + vite build`、管理端 `vue-tsc + vite build`、服务端 `nest build` 全部成功，exit code 0。

### 静态与范围检查

```text
git diff --check
git diff --name-only | rg '(^|/)(prisma/)?migrations?/' || true
```

- `git diff --check` 无输出。
- 没有 migration 文件；分段标记只存于现有 JSON 快照字段。
- 独立只读复审全局搜索了生产代码的 SampleBlock 写入、SSE 载荷和 LabSheet 完整响应路径，未发现未闭合的写入或敏感载荷路径。

## 提交

- `e5f1d13 fix: harden segmented coefficient application`：生产代码、回归测试和实施计划。
- 本报告由后续文档提交保存。

## Remaining concerns

1. 当前仓库没有可直接运行的真实 PostgreSQL 多连接集成测试夹具。单元测试可确定证明“先锁、后重读、使用最新状态计算”的控制流，但不能替代真实数据库上的并发互斥演练。
2. 测试/构建仍会输出已有的 Sass legacy API、Element Plus checkbox API 和大 chunk 警告；均未导致失败，也不由本修复引入。
