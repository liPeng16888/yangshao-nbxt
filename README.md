# 仰韶化验室内部系统前端

Vue 3 + TypeScript + Vite 实现的化验室内部业务前端，覆盖登录注册、数据计算、财务、报表和黑名单模块。

## 本地开发

```bash
pnpm install
pnpm dev
```

默认使用开发 Mock 数据，可直接用下面账号登录：

```text
账号：admin
密码：admin123
```

注册 Mock 一次性注册码：

```text
YANGSHAO-2026
```

## 环境变量

复制 `.env.example` 后按环境调整：

```text
VITE_API_BASE_URL=/api
VITE_APP_TITLE=仰韶化验室内部系统
VITE_USE_MOCKS=true
```

接入真实后端时，将 `VITE_USE_MOCKS` 改为 `false`，并确认 `VITE_API_BASE_URL` 指向后端网关或 Nginx 代理路径。

## 构建与测试

```bash
pnpm test
pnpm build
```

## 腾讯云 VPS / Nginx 部署要点

Vite 构建产物位于 `dist/`。上传到服务器静态目录后，Nginx 需要支持前端路由刷新：

```nginx
location / {
  root /var/www/yangshao-lab-frontend;
  index index.html;
  try_files $uri $uri/ /index.html;
}
```

如果后端与前端同域部署，建议代理 `/api`：

```nginx
location /api/ {
  proxy_pass http://127.0.0.1:后端端口/;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```
