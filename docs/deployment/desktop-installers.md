# 仰韶双端桌面软件安装与运维

## 1. 软件范围

本仓库同时维护网站、NestJS API 和两个 Electron 在线桌面外壳，不需要为桌面端单独建立 GitHub 仓库。

| 软件 | 支持系统 | 固定入口 |
| --- | --- | --- |
| 仰韶化验内部系统 | Windows 10/11 x64、macOS 13+ Apple Silicon | `https://www.ysjc.art/` |
| 仰韶化验后端系统 | Windows 10/11 x64、macOS 13+ Apple Silicon | `https://ys.ysjc.art/admin/login` |

“后端系统”在产品名中指后台管理桌面软件。NestJS API、PostgreSQL、账号、权限和业务数据仍在现有服务器上运行，不会安装到员工电脑。

网页发布后，桌面软件下次打开或使用“页面 → 强制刷新”即可同步。只有域名、图标、窗口、Electron 或原生外壳变更才重新制作安装包。当前整改阶段只在本地完成代码和 macOS 安装包验证，不上传 GitHub、不部署 VPS、不执行生产数据库迁移；必须等负责人明确通知后，才进入 GitHub 私有构建和 VPS 发布流程。

## 2. 在 GitHub 生成并下载安装包

仓库成员按以下路径操作：

1. 打开私有仓库 `liPeng16888/yangshao-nbxt`。
2. 点击顶部 `Actions`。
3. 左侧选择 `Build private desktop installers`。
4. 点击右侧 `Run workflow`，选择要构建的分支，再点绿色 `Run workflow`。
5. 等待 `Validate`、Windows、macOS 和 `Bundle` 全部变绿。
6. 打开这次运行页面，滚动到底部 `Artifacts`。
7. 下载 `Yangshao-Desktop-Installers-1.0.3`。
8. 解压后得到四个安装包和 `SHA256SUMS.txt`：

   - `Yangshao-Internal-System-1.0.3-win-x64.exe`
   - `Yangshao-Backend-System-1.0.3-win-x64.exe`
   - `Yangshao-Internal-System-1.0.3-mac-arm64.dmg`
   - `Yangshao-Backend-System-1.0.3-mac-arm64.dmg`

Artifact 私有保存 30 天，不创建公开 Release。只有对私有仓库有权限的成员能下载。Actions 会消耗 GitHub 额度，额度耗尽且未配置付费方式时构建会暂停。

## 3. 校验下载文件

校验可以发现下载损坏或拿错版本。

macOS：

```bash
cd 下载后解压的目录
shasum -a 256 -c SHA256SUMS.txt
```

Windows PowerShell：

```powershell
Get-FileHash -Algorithm SHA256 .\Yangshao-Internal-System-1.0.3-win-x64.exe
Get-FileHash -Algorithm SHA256 .\Yangshao-Backend-System-1.0.3-win-x64.exe
```

把输出与 `SHA256SUMS.txt` 中对应文件的哈希比较，必须完全一致。

## 4. Windows 安装和 SmartScreen

1. 双击需要的 `.exe`。
2. 如果 SmartScreen 显示“Windows 已保护你的电脑”，先确认文件来自内部私有仓库且 SHA-256 一致，再点击“更多信息 → 仍要运行”。
3. 按安装向导完成当前用户安装，不需要管理员权限。
4. 安装程序会创建桌面快捷方式和开始菜单快捷方式。

本版未购买 Windows 代码签名证书，因此 SmartScreen 提示是预期现象。若公司安全策略彻底禁止未签名程序，需要 IT 按文件哈希或应用规则放行，不能通过修改程序绕过策略。

## 5. macOS 安装和 Gatekeeper

1. 双击 arm64 `.dmg`。
2. 把应用拖入 `Applications（应用程序）`。
3. 首次启动如果提示无法验证开发者，关闭提示后打开“系统设置 → 隐私与安全性”。
4. 在安全区域找到对应应用，点击“仍要打开”，再次确认。

也可以在 Finder 的“应用程序”中按住 Control 点击应用，选择“打开”，再确认一次。只有来源和 SHA-256 已核对时才放行。

本版没有 Apple Developer ID 正式签名和公证；安装包内仅有 Electron Fuses 写入后所需的 ad-hoc 临时签名，因此首次放行提示是预期现象。若企业 MDM 禁止未公证应用，需要 IT 白名单；不要关闭整台 Mac 的 Gatekeeper。

## 6. 覆盖安装和版本查看

网页更新不需要覆盖安装。外壳版本更新时：

- Windows：退出软件后直接运行新 `.exe`，安装到原位置即可。
- macOS：退出软件，打开新 DMG，把新应用拖入“应用程序”并选择“替换”。

登录态保存在独立 `userData` 目录中，正常覆盖安装不会清除。打开应用菜单中的“关于 仰韶化验内部系统”或“关于 仰韶化验后端系统”，可查看桌面外壳权威版本、UTC 构建时间、七位 Git 提交号和构建目标；报障时应一并提供这些信息。本版应显示版本 `1.0.2`。

## 7. 主账号共享与本机数据边界

内部系统的以下四类配置以主账号的数据所有者为范围保存在服务器，主账号和拥有对应权限的子账号共用同一套数据：

- 化验报告模板及公章；
- 短信模板；
- 来样单位快捷名称；
- 常用化验元素组合。

不同主账号之间仍严格隔离。尚未提交的表单草稿、当前样品的实际元素选择、计算过程和页面临时状态仍保存在当前设备或当前页面中，不会自动同步到另一台电脑。清理本机应用数据会移除登录态、本机缓存和这些本机状态，但不会删除服务器上的四类共享配置。

## 8. 卸载和清理本地登录态

### Windows

在“设置 → 应用 → 已安装的应用”中找到对应产品并卸载。普通卸载用于移除程序；如果还要清除这台电脑上保存的登录态，在软件完全退出后删除：

```text
%APPDATA%\YangshaoInternalSystem
%APPDATA%\YangshaoBackendSystem
```

只删除需要重置的应用目录。两个应用的数据目录相互独立。

### macOS

从“应用程序”把应用移到废纸篓。若还要清除登录态，在软件完全退出后删除：

```text
~/Library/Application Support/YangshaoInternalSystem
~/Library/Application Support/YangshaoBackendSystem
```

清理本地登录态不会删除服务器账号或业务数据，但下次启动需要重新登录。

## 9. 桌面编辑、查找与刷新

- 在可编辑输入框内右键可使用撤销、剪切、复制、粘贴、删除和全选；只读选区可复制。
- `Cmd+F`（Windows 为 `Ctrl+F`）打开页面查找，`Cmd/Ctrl+G` 查找下一个，`Cmd/Ctrl+Shift+G` 查找上一个。
- `Cmd/Ctrl+0` 恢复 100% 显示；`Cmd/Ctrl++` 和 `Cmd/Ctrl+-` 在 50% 至 200% 之间缩放。
- `Cmd/Ctrl+R` 普通刷新；`Cmd/Ctrl+Shift+R` 强制刷新并重新获取网页资源。

普通刷新和强制刷新都不会主动清除 Cookie、登录令牌、localStorage、本机草稿或计算状态。网页自身在重新加载时尚未提交的内存输入仍可能丢失，因此刷新前应先保存正在编辑的数据。

## 10. 网络和服务器故障

出现“网络或服务器不可用”时：

1. 确认电脑能访问互联网。
2. 用系统浏览器分别打开对应固定入口，判断是本机网络还是服务器问题。
3. 启动或刷新超过 15 秒仍未成功时，软件会显示“网络或服务器不可用”；回到桌面软件点击“重试”。
4. 如页面显示旧内容，使用“页面 → 强制刷新”。
5. 仍失败时记录发生时间、应用名称、页面位置和错误截图交给维护人员。

启动时桌面软件只清理 HTTP 缓存，不清 Cookie、localStorage、登录令牌、本机草稿、计算状态或页面偏好。普通关闭、重启、普通刷新和强制刷新后登录应保持。

## 11. 真机验收清单

Windows 10/11 x64 与 macOS 13+ Apple Silicon 各自验证：

- 两个软件可同时安装、启动、退出，图标和名称正确。
- 首次安全放行和覆盖安装可完成，关闭后登录保持。
- 内部系统全部导航、录入、SSE 同步、图片上传、员工照片和所有 PNG 导出可用。
- 后端系统全部只读页面、主/子账号权限隔离和敏感信息重新验证可用。
- 两个软件同时登录时会话不串用。
- 断网显示离线页，恢复后重试成功。
- 站内导航留在软件内，外部 HTTPS 链接确认后由系统浏览器打开，其他协议被拦截。
- “另存为”可保存或取消下载，取消不产生空文件。
- 卸载和按需清理本地登录态符合预期。

Windows 业务真机确认由内部人员使用真实账号完成，CI 不保存账号、密码、验证码或员工数据。
