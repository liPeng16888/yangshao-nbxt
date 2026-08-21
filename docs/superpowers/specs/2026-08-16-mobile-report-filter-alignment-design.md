# 手机版报表筛选文字居中设计

## 目标与范围

只修正客户前端手机版报表筛选抽屉内的分段按钮文字对齐。统计维度的“收入数据统计 / 开支数据统计”和时间范围的“日报 / 周报 / 月报 / 筛选日期”都应在至少 44px 的按钮内水平、垂直居中。桌面报表、筛选状态、查询事件、Store、API 和服务端均不改变。

## 根因

`MobileReportFilter.vue` 将 `.el-radio-button__inner` 设为 `min-height: 44px` 且上下内边距为 0，但 Element Plus 实际仍渲染为 `inline-block`，没有垂直对齐容器。浏览器测量确认文字水平方向已居中，垂直方向停留在按钮顶部。

## 采用方案

在 `MobileReportFilter.vue` 的局部深层样式中，把 `.el-radio-button__inner` 改为 `inline-flex`，并使用 `align-items: center`、`justify-content: center`。保留现有 44px 最小高度、自动换行和按钮网格，不使用固定行高或增加上下内边距，避免多行文字和窄屏布局发生回归。

## 测试与验收

- 先在现有 `MobileReportFilter` 组件测试中增加真实 Element Plus 按钮内部布局断言，并确认旧实现失败。
- 最小样式修改后确认统计维度和时间范围的实际按钮均为 Flex 双向居中且高度不低于 44px。
- 运行报表聚焦测试、类型检查和生产构建。
- 在当前 `/reports` 手机页面复验文字垂直中心与无横向溢出。
