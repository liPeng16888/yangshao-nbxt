# 仰韶化验室内部系统

客户前端、后台管理前端、后端 API 放在同一个仓库内：

- 根目录：客户前端，Vue 3 + TypeScript + Vite。
- `admin/`：后台管理前端，Vue 3 + TypeScript + Element Plus。
- `server/`：NestJS + Prisma + PostgreSQL 后端 API。
- `uploads/`：VPS 本地上传文件目录，已加入 Git 忽略。

## 本地开发

```bash
pnpm install
pnpm dev
pnpm dev:admin
pnpm dev:server
```

客户前端以 Mock 标志启动后，可直接用下面账号登录：

```text
账号：admin
密码：admin123
```

注册 Mock 一次性注册码：

```text
YANGSHAO-2026
```

后台管理前端在开发环境可直接预览界面：

```text
地址：http://127.0.0.1:5174/admin/login
账号：admin
密码：admin123456
```

Mock 预览数据不连接数据库；已提交的环境模板默认关闭 Mock，避免生产构建误用演示数据。

两端登录页均支持“记住账号密码”：勾选后，仅在登录成功时将最近一次的账号密码保存到当前浏览器。下次打开登录页会自动填入，也可点击“快捷登录”重新验证并登录。前端和后台分别保存；退出登录后仍保留，取消勾选或点击“清除已记住信息”即可删除。首次登录需要自行输入账号密码。此功能将凭据保存到浏览器本地存储，请仅在本人设备上启用。

首次运行分别创建三个环境文件：

```bash
cp .env.example .env.local
cp admin/.env.example admin/.env.local
cp server/.env.example server/.env
```

前两个文件使用已被 Git 忽略的 Vite `.env.local`，后端使用已被 Git 忽略的 `server/.env`，真实密钥不会因为这套复制方式进入版本控制。模板中的两个 Mock 开关均为 `false`。仅在本地演示时，通过启动命令临时覆盖为 `true`：

```bash
VITE_USE_MOCKS=true ./node_modules/.bin/vite --host 127.0.0.1 --port 5173
cd admin && VITE_ADMIN_USE_MOCKS=true ./node_modules/.bin/vite --host 127.0.0.1 --port 5174
```

- 客户前端登录后访问 `http://127.0.0.1:5173/employee-attendance/overview`。
- 后台使用 `admin / admin123456` 登录 `http://127.0.0.1:5174/admin/login`，随后访问 `http://127.0.0.1:5174/admin/employee-attendance/overview`。
- 后台 Mock 子账号 `sub001 / sub123456` 只能查看已授权的前端账号数据，可用于验证账号隔离。

## 员工考勤与工资

“员工考勤”位于“化验报告”和“财务”之间，包含七个二级页面：考勤概览、员工档案、排班管理、考勤记录、请假管理、提成与奖金、工资统计。

客户前端的 `/employee-attendance/*` 页面用于录入和管理；后台 `/admin/employee-attendance/*` 页面严格只读，只提供筛选、汇总和脱敏查看。后台只有查看单个员工敏感信息时会要求重新输入当前后台账号密码，并记录审计；后台没有业务新增、修改、删除、请假审批、工资确认或 PNG 导出入口。

排班管理使用“月度每日排班”，不再编辑周模板。工作日可填写多组同日 `上班—下班` 计划时段；相邻时段的空档自动作为休息时间，不计入工时。休息日统一为空时段和 0 分钟，本版不支持跨日排班，结束时间必须晚于开始时间。可自由选择任意多个日期后批量完整覆盖；复制上月按日期序号复制，确认后会完整覆盖目标月已有排班。

考勤记录中的“实际出勤”完全由管理员手工录入，也可填写多组同日时段。没有任何实际出勤时段时，系统默认按排班正常出勤，不自动产生迟到、早退或缺勤；录入时段后才按计划与实际时段计算迟到、早退和未覆盖缺勤。没有实际时段时可以手工登记明确缺勤分钟；加班分钟始终由管理员手工填写，绝不从实际时段自动推导。请假列表支持同时筛选多个员工，空选表示全部员工；新增、编辑请假仍一次只选择一名员工。

工资统计采用员工月薪、全勤奖、手工加班、提成、奖金、人工调整、超额请假和缺勤计算。工资确认前会检查所选月份的待审批请假、排班和考勤缺失；确认后锁定当月来源记录，填写原因撤销确认后才可修改。个人工资条和当月全员工资汇总均可从客户前端导出为高清 PNG。

本地 Mock 数据按登录的前端账号隔离并保存在浏览器 `localStorage`，适合界面演示，不等同于数据库备份或生产数据。

## 环境变量

复制 `.env.example` 后按环境调整：

```text
VITE_API_BASE_URL=/api
VITE_APP_TITLE=仰韶化验室内部系统
VITE_USE_MOCKS=false
```

接入真实后端时保持 `VITE_USE_MOCKS=false`。本地开发的客户前端使用 `VITE_API_BASE_URL=/api`，根目录 Vite 会把 `/api` 代理到 `http://127.0.0.1:3000`；部署时由 Nginx 或后端网关接管同一路径。后台同样保持 `VITE_ADMIN_USE_MOCKS=false`。

后端需要配置 PostgreSQL、JWT 和主账号：

```text
DATABASE_URL=postgresql://yangshao:password@127.0.0.1:5432/yangshao?schema=public
JWT_SECRET=请换成强随机字符串
PASSWORD_CIPHER_SECRET=请换成强随机字符串
EMPLOYEE_DATA_CIPHER_SECRET=请换成独立且不少于 32 个 UTF-8 字节的强随机字符串
PRIVATE_EMPLOYEE_PHOTO_DIR=/var/lib/yangshao/private/employee-photos
ROOT_ADMIN_ACCOUNT=root
ROOT_ADMIN_PASSWORD=请换成主账号密码
ROOT_ADMIN_NAME=主账号
UPLOAD_DIR=/var/www/yangshao/uploads
SERVER_PORT=3000
```

`EMPLOYEE_DATA_CIPHER_SECRET` 专门用于员工身份证号、银行卡号、住址和紧急联系人等敏感字段的 AES-256-GCM 加密，不能复用 `PASSWORD_CIPHER_SECRET`。该密钥必须在同一套数据的整个生命周期保持不变；丢失或随意更换会导致已保存数据无法解密。请通过部署平台的密钥管理或仅管理员可读的环境文件保存，不要提交真实密钥。

`PRIVATE_EMPLOYEE_PHOTO_DIR` 必须指向后端进程可读写、但 Nginx/静态站点不能直接公开访问的目录；不能等于或位于 `UPLOAD_DIR` 之下，否则后端会拒绝读写。员工照片只能通过已鉴权接口读取，响应禁止公开缓存。该目录与数据库应一起纳入备份。本地相对路径的 `private-uploads/` 和 `server/private-uploads/` 已加入 Git 忽略，但生产环境仍必须使用仓库之外的绝对路径。

初始化数据库：

```bash
pnpm --filter yangshao-server prisma:generate
pnpm --filter yangshao-server prisma:migrate
pnpm --filter yangshao-server seed
```

### 员工考勤数据库迁移

员工考勤迁移位于：

```text
server/prisma/migrations/20260810000000_add_employee_attendance/migration.sql
server/prisma/migrations/20260811000000_add_monthly_schedule_segments/migration.sql
```

首个迁移新增员工考勤枚举、14 张业务表、账号归属索引/复合外键、`EMPLOYEE_ATTENDANCE` 访问保护类型，并为已有访问组合表增加默认为 1 的 `grantVersion` 撤销版本列。月度排班迁移新增每日排班、计划时段和实际出勤时段三张表及其租户复合外键、索引，并仅回填部署当月的旧周排班/临时调班和完整历史打卡对；不包含删表、删列或清理业务数据。

已部署环境必须先完成可恢复备份，再由运维窗口执行不会交互创建迁移的 `prisma:deploy`。下面命令仅供操作指引；本次本地功能开发没有执行生产数据库迁移：

```bash
pnpm --filter yangshao-server prisma:generate
pnpm --filter yangshao-server prisma:migrate   # 仅本地开发
pnpm --filter yangshao-server prisma:deploy    # 已部署环境
```

本仓库不提供自动执行的破坏性 down migration。月度排班迁移只新增表，首选回滚应用版本并停止使用新增功能，保留新增表，不做破坏性 schema 回滚。若确实需要恢复整库备份，必须先进入维护模式并停止所有应用写入；仅在明确接受全库所有模块数据回退、已具备完整备份且完成恢复演练时执行。不要手工删除月度排班、时段或既有员工考勤表，也不要在未备份的数据库上执行回滚；本次本地验证不代表已部署或已执行生产迁移。

## 构建与测试

```bash
pnpm test
./node_modules/.bin/vitest run admin/src
./server/node_modules/.bin/vitest run --root server
pnpm build
pnpm build:admin
pnpm build:server
pnpm build:all
```

## 腾讯云 VPS / Nginx 部署要点

推荐同域部署：

- 客户前端：`/`
- 后台管理：`/admin`
- 后端接口：`/api`
- 上传文件：`/uploads`

```nginx
location / {
  root /var/www/yangshao-lab-frontend;
  index index.html;
  try_files $uri $uri/ /index.html;
}

location /admin/ {
  alias /var/www/yangshao-admin/;
  index index.html;
  try_files $uri $uri/ /admin/index.html;
}

location /api/ {
  proxy_pass http://127.0.0.1:3000/api/;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}

location /uploads/ {
  alias /var/www/yangshao/uploads/;
}
```

主账号登录后台后，可生成前端一次性注册码、创建子账号，并给子账号授权可访问的前端客户账号数据。


### 飞书 AI 接入

后台“AI API 配置 → 飞书接入”支持企业自建机器人长连接、网站账号本人确认绑定、文字/图片与草稿确认写入。默认关闭，配置及部署步骤见 [飞书接入说明](docs/ai-feishu.md)。
