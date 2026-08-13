# 仰韶双端桌面软件设计

## 1. 目标

把现有线上客户系统和后台管理系统分别封装为可安装的 Electron 桌面软件，并保留网页版现有的导航、账号权限、业务数据、实时连接、图片上传、员工照片和 PNG 导出功能。

桌面软件只负责安全地显示线上网页，不在员工电脑上安装 NestJS、PostgreSQL 或业务数据副本。网页、REST API、SSE、Prisma Schema 和生产数据继续由现有服务器维护；网页发布后，桌面软件下次打开或强制刷新即可使用最新功能。

## 2. 双应用边界

| 配置 | 仰韶化验内部系统 | 仰韶化验后端系统 |
| --- | --- | --- |
| 应用 ID | `art.ysjc.internal-system` | `art.ysjc.backend-system` |
| 固定入口 | `https://www.ysjc.art/` | `https://ys.ysjc.art/admin/login` |
| 允许的主文档 Origin | `https://www.ysjc.art` | `https://ys.ysjc.art` |
| 本地数据目录 | `YangshaoInternalSystem` | `YangshaoBackendSystem` |
| 安装包前缀 | `Yangshao-Internal-System` | `Yangshao-Backend-System` |

两个应用共用一套桌面外壳代码，但使用独立应用 ID、产品名称、入口、图标、安装包和 `userData` 目录。这样可以同时安装、同时登录，Cookie、localStorage、IndexedDB、HTTP 缓存和窗口偏好互不串用。

产品名称中的“后端系统”仅表示后台管理桌面软件；NestJS API 仍然运行在现有服务器。

## 3. 窗口和会话行为

- 每个应用只允许一个实例运行；再次启动时聚焦已有窗口。
- 默认窗口为 `1440 × 900`，最小为 `1100 × 700`。
- 窗口标题固定为对应产品名称，不接受远程页面覆盖。
- 启动时只清理 HTTP 缓存，不清理 Cookie、localStorage、IndexedDB、登录令牌或页面偏好。
- 菜单提供普通刷新、强制刷新、关于和退出。
- 页面加载失败时显示内置离线页，明确提示“网络或服务器不可用”，并提供重试。

## 4. 远程内容安全模型

远程网页运行在 Electron 的隔离渲染进程中：

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- `webSecurity: true`
- 不配置远程 preload，不向网页暴露 IPC、文件系统、Shell 或命令执行接口。
- 正式构建禁用开发者工具和任意新窗口。
- 默认拒绝摄像头、麦克风、定位、通知、MIDI、剪贴板读取等权限。
- 证书错误一律拒绝，不允许用户绕过。

所有主页面跳转都使用标准 `URL` 解析器比较精确 `origin`，仅允许目标应用自己的 HTTPS Origin。因此 `http://`、用户名伪装、端口变体和 `www.ysjc.art.evil.com` 等相似域名均被拒绝。

外部 HTTPS 链接不在 Electron 内打开：先显示确认对话框，确认后交给系统浏览器。非 HTTPS 外部协议直接拦截。目标 Origin 内的 SPA 路由和 API/SSE 连接正常保留。

对目标 Origin 的主文档补充同源 CSP：脚本只能来自自身，图片允许 `data:` 和 `blob:`，连接只允许两个正式 HTTPS Origin，不允许对象、框架和外部脚本。该策略只作用于主文档，不改写 API JSON 或下载响应。

安全基线遵循 [Electron 远程内容安全清单](https://www.electronjs.org/docs/latest/tutorial/security)。

## 5. 上传、下载和实时功能

- 保留 Chromium 标准文件选择器，因此图片上传和员工照片上传不需要任何 Node 桥接。
- 允许目标 Origin 创建 `blob:` / Canvas 生成的下载；下载开始时显示系统“另存为”，用户取消时不创建文件。
- 文件名经过本地清理，不能把路径片段或控制字符带入默认保存位置。
- SSE 和同源 API 继续直连线上服务器，桌面端不代理、不缓存业务响应。

## 6. 图标和安装包

使用已确认的两张标志源图，只做平台规格化：统一安全留白、清理后台图黑色外角、生成 1024px 主图、Windows `.ico` 和 macOS `.icns`，不重新设计标志。

固定版本：

- Electron `43.2.0`
- electron-builder `26.15.7`
- 桌面软件版本 `1.0.0`

Windows 目标为 Windows 10/11 x64 的 NSIS 当前用户安装器，无需管理员权限，创建桌面和开始菜单快捷方式。macOS 目标为 macOS 13+ Apple Silicon arm64 DMG。

产物名称固定为：

- `Yangshao-Internal-System-1.0.0-win-x64.exe`
- `Yangshao-Backend-System-1.0.0-win-x64.exe`
- `Yangshao-Internal-System-1.0.0-mac-arm64.dmg`
- `Yangshao-Backend-System-1.0.0-mac-arm64.dmg`

本版不办理 Windows 或 Apple Developer 正式签名，不做 Apple 公证，也不实现自动更新。Windows SmartScreen、macOS Gatekeeper 或企业安全策略可能要求人工放行或 IT 白名单。网页更新无需重装；Electron 或原生外壳更新采用覆盖安装。

## 7. 私有交付模型

仓库内提供手动触发的 GitHub Actions 工作流：Linux 先验证桌面端、客户前台、后台和服务端测试/构建及正式网址可达性；`windows-2025` 生成两个 x64 EXE；`macos-15` 生成两个 arm64 DMG；汇总后生成 `SHA256SUMS.txt`。

四个安装包作为私有 Actions Artifact 保存 30 天，不创建公开 Release。只有有仓库权限的成员能下载。桌面代码与现有前端、后台、服务端放在同一私有仓库的 `desktop/` workspace 中，保证每次构建对应同一个提交，不额外拆仓库。

## 8. 验收边界

自动验证覆盖：双应用映射与会话隔离、相似域名攻击、协议限制、权限拒绝、外链确认、下载取消/保存、离线重试、缓存刷新、构建配置、产物命名、CPU 架构、图标和 SHA-256。

macOS 与 Windows 最终仍需真机验收安装、安全放行、登录保持、全部导航、录入、SSE、上传、员工照片、PNG 导出、后台权限隔离、断网恢复、刷新、外链和卸载。Windows 真机验收不在 CI 保存真实账号密码。
