# 全项目 UI 优化验收记录

日期：2026-10-09。前台主账号与后台主账号，使用本地演示数据。

## 结果

- 全部 49 个业务入口完成桌面和手机访问，合计 98 个视图记录。
- 桌面 1440 × 1024，手机 390 × 844；全部入口页面级横向溢出为 0px。
- 宽表格保持列与顺序，通过内部滚动访问；后台窄屏日历保持周结构并在日历内滚动。
- 前台、后台及共用组件 145 个测试文件、1655 项测试通过；两端类型检查和 Vite 构建通过。
- 两端登录、记住账号、退出后恢复和快捷登录均已实际操作。

## 菜单逐项记录

| 端别 | 内容 | 路由 | 桌面 | 手机 | 页面横向溢出 |
| --- | --- | --- | --- | --- | --- |
| 后台 | 数据统计 | `/data` | 通过 | 通过 | 0px |
| 后台 | 排班考勤概览 | `/employee-attendance/schedules` | 通过 | 通过 | 0px |
| 后台 | 员工档案 | `/employee-attendance/employees` | 通过 | 通过 | 0px |
| 后台 | 考勤记录 | `/employee-attendance/records` | 通过 | 通过 | 0px |
| 后台 | 请假管理 | `/employee-attendance/leave` | 通过 | 通过 | 0px |
| 后台 | 提成与奖金 | `/employee-attendance/compensation` | 通过 | 通过 | 0px |
| 后台 | 工资统计 | `/employee-attendance/payroll` | 通过 | 通过 | 0px |
| 后台 | 预存款充值 | `/shared-prepaid/recharges` | 通过 | 通过 | 0px |
| 后台 | 预存款客户 | `/shared-prepaid/customers` | 通过 | 通过 | 0px |
| 后台 | 消费明细 | `/shared-prepaid/consumptions` | 通过 | 通过 | 0px |
| 后台 | 转账结算 | `/shared-prepaid/settlements` | 通过 | 通过 | 0px |
| 后台 | 收入账单 | `/finance/income` | 通过 | 通过 | 0px |
| 后台 | 支出账单 | `/finance/expenses` | 通过 | 通过 | 0px |
| 后台 | 未结款 | `/finance/unsettled` | 通过 | 通过 | 0px |
| 后台 | 月结款每日明细 | `/finance/monthly/daily` | 通过 | 通过 | 0px |
| 后台 | 月结款账单明细 | `/finance/monthly/bills` | 通过 | 通过 | 0px |
| 后台 | 月结客户信息收录 | `/finance/monthly/customers` | 通过 | 通过 | 0px |
| 后台 | 待办事项 | `/todos` | 通过 | 通过 | 0px |
| 后台 | 客户总览 | `/customer-overview` | 通过 | 通过 | 0px |
| 后台 | 药品库存 | `/medicine-inventory` | 通过 | 通过 | 0px |
| 后台 | 异常记录 | `/abnormal` | 通过 | 通过 | 0px |
| 后台 | 账号管理 | `/accounts` | 通过 | 通过 | 0px |
| 后台 | AI API 配置 | `/ai-settings` | 通过 | 通过 | 0px |
| 后台 | 客户黑名单 | `/blacklist` | 通过 | 通过 | 0px |
| 前台 | 数据计算 | `/data` | 通过 | 通过 | 0px |
| 前台 | 标样计算 | `/data/standard-sample` | 通过 | 通过 | 0px |
| 前台 | 系数计算 | `/data/coefficient` | 通过 | 通过 | 0px |
| 前台 | 化验报告图片模板 | `/lab-report/image-template` | 通过 | 通过 | 0px |
| 前台 | 化验短信生成模板 | `/lab-report/sms-template` | 通过 | 通过 | 0px |
| 前台 | 排班考勤概览 | `/employee-attendance/schedules` | 通过 | 通过 | 0px |
| 前台 | 员工档案 | `/employee-attendance/employees` | 通过 | 通过 | 0px |
| 前台 | 考勤记录 | `/employee-attendance/records` | 通过 | 通过 | 0px |
| 前台 | 请假管理 | `/employee-attendance/leave` | 通过 | 通过 | 0px |
| 前台 | 提成与奖金 | `/employee-attendance/compensation` | 通过 | 通过 | 0px |
| 前台 | 工资统计 | `/employee-attendance/payroll` | 通过 | 通过 | 0px |
| 前台 | 预存款充值 | `/prepaid/recharges` | 通过 | 通过 | 0px |
| 前台 | 预存款客户 | `/prepaid/customers` | 通过 | 通过 | 0px |
| 前台 | 消费明细 | `/prepaid/consumptions` | 通过 | 通过 | 0px |
| 前台 | 转账结算 | `/prepaid/settlements` | 通过 | 通过 | 0px |
| 前台 | 支出账单 | `/finance/expenses` | 通过 | 通过 | 0px |
| 前台 | 收入账单 | `/finance/income` | 通过 | 通过 | 0px |
| 前台 | 未结款 | `/finance/unsettled` | 通过 | 通过 | 0px |
| 前台 | 月结款 | `/finance/monthly-settlement` | 通过 | 通过 | 0px |
| 前台 | 报表 | `/reports` | 通过 | 通过 | 0px |
| 前台 | 药品库存 | `/medicine-inventory/stock` | 通过 | 通过 | 0px |
| 前台 | 药品入库 | `/medicine-inventory/inbound` | 通过 | 通过 | 0px |
| 前台 | 药品出库 | `/medicine-inventory/outbound` | 通过 | 通过 | 0px |
| 前台 | 客户总览 | `/customers-overview` | 通过 | 通过 | 0px |
| 前台 | 黑名单 | `/blacklist` | 通过 | 通过 | 0px |

## 内部内容与附属界面

- 前台请假两标签、提成与奖金三标签、两类报表切换；后台库存三标签、待办两标签、账号管理两标签和 AI 配置四标签。财务六个内容页分别按路由验收。
- 前台账号设置两标签、复样和完成标记弹窗；仅查看和关闭，没有提交密码、权限或资金修改。
- 样品输入格的焦点已检查，实际灰蓝内边线和外侧焦点圈均生效。
- 其他业务弹窗、导出与权限状态由共用主题和对应组件测试覆盖；未在浏览器穷举所有数据与授权组合。

## 发现和修复

1. 前台资金页面、后台考勤列表被宽表格撑大：收紧面板和网格最小宽度，保留表格内部横向滚动。
2. 后台窄屏考勤汇总与客户筛选：调整小屏列数和字段宽度。
3. 后台库存明细日期筛选：隐式列原先为 350px，改用 minmax(0, 1fr)，在 390px 视口实际控件宽 182px，页面溢出 0px。
4. 手机保存按钮的红色渐变改为灰蓝纯色；更新提示与助手默认位置错开。
5. 样品格局部样式覆盖通用焦点：增加明确的表格焦点样式；已完成样品继续保留淡桃色标识。
6. 考勤旧测试使用八月夹具却取当前月份，修改前也失败 13 项；仅固定该测试文件的 Date 时钟，181 项重点回归和最终完整回归通过。

## 证据与环境

- 截图及状态：/private/tmp/yangshao-ui-qa/final-desktop/、final-mobile/、final-records.json、final-extras.json。
- 原始页面：/private/tmp/yangshao-ui-qa/before/；源码基线：/private/tmp/yangshao-ui-before-20261009/。
- 测试 JSON：/private/tmp/yangshao-ui-qa/final-tests.json；构建日志：frontend-build.log、admin-build.log。
- 原项目依赖目录反复缺失工具文件，最终测试和预览使用 /private/tmp/yangshao-ui-validation/ 独立副本，复制的是原项目最新界面源码；改动已保存在原项目。
- 前台预览：http://127.0.0.1:5183/data；后台预览：http://127.0.0.1:5184/admin/finance/income。

## 实际验证限制

- Mock 用于界面与重复操作验证，未操作生产资金、审批或权限数据。
- 前端偏好及模板同步接口原本仍依赖真实后端；未连接服务时可出现 HTTP 500 或模板同步提示。优化前已经存在，本轮未修改这些接口。
- 导出内容和相关组件业务版式保留，现有导出测试通过；未在浏览器下载全部业务数据组合。

## 浏览器批注修复（2026-10-09）

- 已完成样品默认隐藏检测值、样品金额与结款状态，保留原始数据；点击“查看加密数据”继续使用原有访问验证。再次标记已完成也会重新隐藏，切换账号或数据表会重置显示状态。
- 数据计算表的输入、计算结果与备注改为居中。
- 5 个相关测试文件、158 项测试通过；类型检查与前台构建通过。浏览器验证了隐藏→查看→再次标记后隐藏的流程，结果单元格实际 justify-content 为 center。
- 修复截图：/private/tmp/yangshao-completed-hidden-centered.png。
