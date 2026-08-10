# 员工考勤与工资管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Every behavior change follows RED → GREEN → REFACTOR and is committed per task.

**Goal:** 在前台增加可编辑的完整员工考勤与工资管理模块，在后台增加严格只读的对应模块，并支持工资 PNG 导出、本地 Mock 演示与数据库持久化。

**Architecture:** NestJS/Prisma 作为唯一业务规则和持久化来源，Vue/Pinia 前台调用 `/employee-attendance/*` 完成管理，后台调用 `/admin/employee-attendance/*` 只读查询。工资计算、排班展开、请假折算、权限校验和敏感字段处理放在服务端独立单元中；本地 Mock 实现相同前端契约。

**Tech Stack:** Vue 3、Element Plus、Pinia、Vite/Vitest、NestJS、Prisma/PostgreSQL、Canvas PNG、AES-256-GCM。

## Global Constraints

- 前台一级菜单“员工考勤”必须位于“化验报告”和“财务”之间，二级菜单固定为：考勤概览、员工档案、排班管理、考勤记录、请假管理、提成与奖金、工资统计。
- 前台可管理，后台严格只读；后台不提供新增、修改、删除、审批、确认或导出能力。
- 所有数据按 `frontendUserId` 隔离；后台主账号可看全部，子账号只能看授权前台账号。
- 新增访问保护类型 `EMPLOYEE_ATTENDANCE`；受保护时前台页面和服务端读写接口都必须校验 `X-YS-Access-Grant`。
- 工资公式：`基本月薪 + 全勤奖 + 手工加班时长×加班时薪 + 提成 + 奖金 + 人工调整 - 超额请假扣款 - 缺勤扣款`。
- 超额请假和缺勤按 `基本月薪 ÷ 当月应出勤天数 × 天数` 扣款；两者都取消全勤奖。迟到早退只统计，不自动扣薪。
- 加班时长完全手工填写；提成按单价×数量；奖金和人工调整原因必填；不计算社保、公积金和个税。
- 工资确认保存快照并锁定当月关联数据；填写原因撤销确认后才能继续修改。
- 身份证号、银行卡号、住址、紧急联系人等使用独立密钥 AES-256-GCM 加密；普通列表默认脱敏。
- 员工照片使用私有鉴权读取，不生成公开上传 URL。
- 本地 Mock 与真实 API 行为一致，5173/5174 无真实数据库时可完整演示。
- 不部署生产环境。

---

### Task 1: 数据模型、加密与工资计算内核

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260810000000_add_employee_attendance/migration.sql`
- Create: `server/src/employee-attendance/employee-data-cipher.service.ts`
- Create: `server/src/employee-attendance/payroll-calculator.ts`
- Test: `server/src/employee-attendance/payroll-calculator.test.ts`
- Test: `server/src/employee-attendance/employee-data-cipher.service.test.ts`
- Modify: `server/.env.example`, `.env.example`

**Interfaces:**
- Produce Prisma enums for employee status, leave unit/status, payroll status and audit action.
- Produce models for employees, weekly schedules, date overrides, monthly settings, attendance, leave types/requests, commission types/records, bonuses, payroll runs/items/adjustments and audit logs.
- Produce `calculatePayroll(input: PayrollCalculationInput): PayrollCalculationResult` using decimal-safe rounding to two money decimals and minute/hour precision.
- Produce `EmployeeDataCipherService.encrypt/decrypt/mask` using `EMPLOYEE_DATA_CIPHER_SECRET`.

- [ ] Write calculator and cipher tests first; verify failures are caused by missing production modules.
- [ ] Add Prisma schema and SQL migration with ownership, uniqueness, indexes, relations and restrictive/cascading deletes consistent with the global constraints.
- [ ] Implement calculator cases for rest quota, hourly/half/full-day leave, absence, overtime, commission, bonus, signed adjustments and zero scheduled days.
- [ ] Implement authenticated encryption and masking; reject malformed ciphertext without leaking secrets.
- [ ] Generate Prisma client, run focused tests, run server build, commit `feat: add employee attendance data model and payroll core`.

### Task 2: 前台员工、排班、考勤、请假与报酬 API

**Files:**
- Create: `server/src/employee-attendance/employee-attendance.dto.ts`
- Create: `server/src/employee-attendance/employee-attendance.service.ts`
- Create: `server/src/employee-attendance/employee-attendance.controller.ts`
- Create: `server/src/employee-attendance/employee-attendance.module.ts`
- Create: `server/src/employee-attendance/private-employee-photo.service.ts`
- Test: `server/src/employee-attendance/employee-attendance.service.test.ts`
- Test: `server/src/employee-attendance/employee-attendance.controller.test.ts`
- Modify: `server/src/app.module.ts`, `server/src/auth/auth.service.ts`

**Interfaces:**
- Frontend CRUD under `/employee-attendance` for employees, weekly schedules, overrides, month settings, attendance, leave types/requests, commission types/records and bonuses.
- `POST /employee-attendance/attendance/generate` expands schedules for selected employees/month without overwriting manually edited rows.
- `POST /employee-attendance/leaves/:id/approve|reject` changes only pending requests.
- Employee list/detail are masked by default; `GET /employee-attendance/employees/:id/reveal` requires a valid attendance grant.
- Private photo upload/read endpoints validate image size/type and frontend ownership.

- [ ] Write failing service tests for account isolation, duplicate employee/date, overlapping leave, schedule conflict, locked month and type deactivation.
- [ ] Write failing controller tests proving every write uses authenticated `FRONTEND_USER` ownership and protected requests require the attendance grant.
- [ ] Implement DTO normalization and validation with explicit 400/404/409 responses.
- [ ] Implement CRUD, schedule expansion, leave approval, commission/bonus totals, audit entries and private photos.
- [ ] Run focused tests plus server suite/build; commit `feat: add employee attendance management api`.

### Task 3: 工资、概览与后台只读 API

**Files:**
- Create: `server/src/employee-attendance/payroll.service.ts`
- Create: `server/src/employee-attendance/admin-employee-attendance.controller.ts`
- Test: `server/src/employee-attendance/payroll.service.test.ts`
- Test: `server/src/employee-attendance/admin-employee-attendance.controller.test.ts`
- Modify: employee attendance module/service/controller as required.

**Interfaces:**
- `GET /employee-attendance/overview?month=YYYY-MM` returns workforce, today attendance, leave, absence, overtime, pending leave, projected payroll and issue counts.
- `POST /employee-attendance/payroll/generate`, `GET /employee-attendance/payroll?month=`, adjustment CRUD, `POST /payroll/:id/confirm`, and `POST /payroll/:id/reopen` with required reason.
- Confirmation rejects pending leave, missing schedules and unresolved absence; concurrent confirmation is atomic.
- `/admin/employee-attendance/*` exposes read-only overview/employees/schedules/attendance/leaves/commission/bonus/payroll/audit queries filtered through `AdminAccessService`.
- `POST /admin/employee-attendance/employees/:id/reveal` is the only non-GET admin action; it verifies the current admin password, returns one employee’s plaintext once and writes an audit record.

- [ ] Write failing payroll tests for formula snapshots, blockers, historical stability, lock/reopen rules and concurrent confirmation.
- [ ] Write failing admin controller tests proving only GET plus reveal are exposed and account filtering is enforced.
- [ ] Implement overview/payroll transactions, immutable snapshots, confirm/reopen locks and audit logging.
- [ ] Implement read-only admin query facade and password re-verification for sensitive reveal.
- [ ] Run focused tests plus server suite/build; commit `feat: add employee payroll and admin read api`.

### Task 4: 前台契约、Mock、导航与七个页面

**Files:**
- Create: `src/types/employeeAttendance.ts`
- Create: `src/api/employeeAttendance.ts`
- Create: `src/stores/employeeAttendance.ts`
- Create: `src/mocks/employeeAttendance.ts`
- Create: `src/views/dashboard/employee-attendance/*.vue`
- Test: `src/api/employeeAttendance.mock.test.ts`
- Test: `src/views/dashboard/EmployeeAttendancePages.test.ts`
- Modify: `src/components/layout/AppSidebar.vue`, `src/router/index.ts`, `src/router/guards.ts`, `src/components/access/AccessGuardSettingsDialog.vue`

**Interfaces:**
- Routes: `/employee-attendance/overview`, `/employees`, `/schedules`, `/records`, `/leave`, `/compensation`, `/payroll` with base redirect to overview.
- Seven pages share month/date/employee filters and use the Pinia store; all mutations surface failures without discarding entered form data.
- Mock persistence and validation mirror real API behavior, including payroll locks and sample records for immediate local demonstration.

- [ ] Write failing route/menu/access-label tests and Mock API behavior tests.
- [ ] Add typed API/store and Mock repository; verify focused tests turn green.
- [ ] Build overview cards and issue list.
- [ ] Build employee form/table with masked/reveal fields and private photo controls.
- [ ] Build weekly schedule/date override, batch attendance generation and editable daily records.
- [ ] Build leave type/request approval UI, commission type/record tabs and multi-bonus UI with required reasons.
- [ ] Build payroll draft/detail/adjustment/confirm/reopen UI and write-protection states.
- [ ] Run focused frontend tests and build; commit `feat: add employee attendance frontend`.

### Task 5: 工资 PNG 导出

**Files:**
- Create: `src/utils/payrollPng.ts`
- Create: `src/components/employee-attendance/PayrollExportDialog.vue`
- Test: `src/utils/payrollPng.test.ts`
- Test: `src/components/employee-attendance/PayrollExportDialog.test.ts`
- Modify: payroll page.

**Interfaces:**
- `downloadEmployeePayrollPng(item, filename?)` creates one high-DPI employee payslip.
- `downloadPayrollSummaryPng(run, filename?)` creates one high-DPI monthly all-employee summary.
- Both return `Promise<boolean>`, enforce two-decimal money display, sanitize filenames and resolve false on missing canvas/blob or timeout.

- [ ] Write failing layout, filename, long-table and timeout tests.
- [ ] Implement Canvas drawing helpers without duplicating existing download/error patterns.
- [ ] Connect individual and summary export actions only on the editable frontend payroll page.
- [ ] Run focused tests and frontend build; commit `feat: export employee payroll png images`.

### Task 6: 后台只读导航、Mock 与七个页面

**Files:**
- Create: `admin/src/config/employeeAttendanceNavigation.ts`
- Create: `admin/src/views/EmployeeAttendancePage.vue`
- Test: `admin/src/views/EmployeeAttendancePage.test.ts`
- Test: `admin/src/config/employeeAttendanceNavigation.test.ts`
- Modify: `admin/src/views/AdminLayout.vue`, `admin/src/router.ts`, `admin/src/api.ts`, `admin/src/types.ts`

**Interfaces:**
- Admin routes mirror the seven frontend sections under `/employee-attendance/*` while rendering only filters, tables, details and masked reveal.
- Admin Mock responses support frontend-account filtering and contain no mutation handler for attendance data.

- [ ] Write failing navigation and read-only behavior tests, including absence of edit/delete/approve/confirm/export controls.
- [ ] Add typed admin API and Mock data filtered by authorized frontend accounts.
- [ ] Implement seven read-only route states in focused child components or tabs within the page, keeping the page file maintainable.
- [ ] Add masked detail plus admin-password reveal dialog and audit display.
- [ ] Run focused admin tests and admin build; commit `feat: add readonly employee attendance admin`.

### Task 7: 全量集成、文档与浏览器验收

**Files:**
- Modify tests or implementation only for defects reproduced during integration.
- Modify: `README.md` and environment examples with migration/key/local-preview instructions.

**Interfaces:**
- Local Mock pages must work at 5173 and 5174 without a production database.
- Real server must build with generated Prisma client and migration present.

- [ ] Run Prisma format/validate/generate and inspect migration SQL for reversibility and ownership indexes.
- [ ] Run frontend full suite excluding `.pnpm-store/**`, `.worktrees/**`, `.superpowers/**`.
- [ ] Run server full suite and `pnpm build:all`.
- [ ] Start isolated preview ports, verify all seven frontend pages, representative CRUD/payroll/PNG flow, all seven admin read-only views, access guard and browser error logs.
- [ ] Add regression tests before fixing every integration defect discovered.
- [ ] Commit `docs: document employee attendance module` and prepare whole-branch review.
