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

客户前端默认使用开发 Mock 数据，可直接用下面账号登录：

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

开发预览数据不连接数据库；真实联调或部署时设置 `VITE_ADMIN_USE_MOCKS=false` 并启动后端服务。

## 环境变量

复制 `.env.example` 后按环境调整：

```text
VITE_API_BASE_URL=/api
VITE_APP_TITLE=仰韶化验室内部系统
VITE_USE_MOCKS=true
```

接入真实后端时，将 `VITE_USE_MOCKS` 改为 `false`，并确认 `VITE_API_BASE_URL` 指向后端网关或 Nginx 代理路径。

后端需要配置 PostgreSQL、JWT 和主账号：

```text
DATABASE_URL=postgresql://yangshao:password@127.0.0.1:5432/yangshao?schema=public
JWT_SECRET=请换成强随机字符串
PASSWORD_CIPHER_SECRET=请换成强随机字符串
ROOT_ADMIN_ACCOUNT=root
ROOT_ADMIN_PASSWORD=请换成主账号密码
ROOT_ADMIN_NAME=主账号
UPLOAD_DIR=/var/www/yangshao/uploads
SERVER_PORT=3000
```

初始化数据库：

```bash
pnpm --filter yangshao-server prisma:generate
pnpm --filter yangshao-server prisma:migrate
pnpm --filter yangshao-server seed
```

## 构建与测试

```bash
pnpm test
pnpm build
pnpm build:admin
pnpm build:server
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
