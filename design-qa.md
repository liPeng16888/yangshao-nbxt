# 方案 3 手机端样品信息与检测数据 Design QA

## Comparison target

- Source visual truth:
  - 基础：`/Users/zhangpengfei/.codex/generated_images/01a01def-6727-7052-bf46-1ca8b8fa3c5c/exec-4b23288c-57ff-455d-82ed-ddb8934a7fa9.png`
  - 客户：`/Users/zhangpengfei/.codex/generated_images/01a01def-6727-7052-bf46-1ca8b8fa3c5c/exec-739031e9-a469-4060-aedb-a19395197d06.png`
  - 结算：`/Users/zhangpengfei/.codex/generated_images/01a01def-6727-7052-bf46-1ca8b8fa3c5c/exec-6617207b-e523-41b9-affa-e3e584af2d30.png`
- Browser implementation captures:
  - `/private/tmp/yangshao-scheme3-basic.png`
  - `/private/tmp/yangshao-scheme3-customers.png`
  - `/private/tmp/yangshao-scheme3-settlement.png`
- Combined side-by-side evidence: `/private/tmp/yangshao-scheme3-all-compare.png`
- Route: `http://127.0.0.1:5173/data`
- Browser: Codex In-app Browser
- CSS viewport: `390 x 844`
- Source pixels: `853 x 1844`; displayed at `390 x 844` for normalized comparison.
- Implementation pixels: `390 x 844`; device scale evidence is 1 CSS pixel to 1 screenshot pixel.
- States: 样品 001 的样品信息已展开，分别选中基础、客户、结算。

## Findings

- 无 P0 / P1 / P2 问题。
- [P3] 真实页面保留了现有的“9 项计算参数”和水份、灼烧计算组，因此首屏纵向起点与概念稿不同。这是已有业务结构，不属于本次样品信息改版范围。
- [P3] 客户概念图重复出现了备注；主选定稿已把备注放在基础页。实现保持备注单一归属于基础页，避免两个页签重复编辑同一字段。

## Required fidelity surfaces

- Fonts and typography: 沿用现有中文系统字体和页面字号层级；页签 14px/600，字段值保持 16px，无截断或异常换行。
- Spacing and layout rhythm: 三等分页签、44px 点击高度、10px 面板内边距与选定稿一致；客户面板高 159px，结算面板高 108.39px，无水平溢出。
- Colors and visual tokens: 沿用现有深蓝、白色、冷灰边框和蓝色激活下划线，与概念稿的语义层级一致。
- Image quality and asset fidelity: 本区域不含需新增的图片素材；品牌标识和现有图标继续由原项目组件渲染，无占位图、手工 SVG 或绘制替代。
- Copy and content: 基础只含编号、样品名称、化验元素、备注；客户只含付款客户和数据接收客户；结算只含样品金额、结款状态及自动保存提示。

## Interaction and accessibility evidence

- 三个页签都使用 `role="tab"`、`aria-selected`、`aria-controls`，内容使用 `role="tabpanel"`和 `aria-labelledby`。
- 页签高度均为 44px；客户选择器和四个添加/复制按钮均为 44px 高，按钮为 `44 x 44px`。
- 结算两个控件均为 44px 高，两列各 159px；页面水平溢出为 0px。
- 已验证基础→客户→结算→基础切换，且每次只渲染当前面板字段。
- 浏览器控制台 error 日志为 0。

## Full-view and focused comparison evidence

- Full-view: 三组 390 x 844 手机页面在同一比较图中与各自概念稿并排，确认页签层级、表单分组、控件密度和折叠计算区衔接一致。
- Focused region: 并排图中的样品信息区域均以 390px 宽度显示，字段、标签、按钮边界可清晰辨认，因此无需额外裁剪放大。

## Comparison history

- Iteration 1: 同时对比基础、客户、结算三个状态；未发现可操作的 P0 / P1 / P2 问题，因此未需要视觉修复循环。

## Implementation checklist

- [x] 基础 / 客户 / 结算三页签可交互。
- [x] 每个样品独立保存当前页签，重新打开样品回到基础。
- [x] 原有编辑、自动保存、只读、完成数据脱敏和客户操作继续复用。
- [x] 390 x 844 真实浏览器下无水平溢出、无控制台错误。

## Follow-up polish

- 可在用户实机长文本数据下再检查客户名和动态样品金额标签的截断表现。

## 检测数据页签扩展（2026-08-22）

### Comparison target

- Source visual truth: `/Users/zhangpengfei/.codex/generated_images/01a01def-6727-7052-bf46-1ca8b8fa3c5c/exec-4b23288c-57ff-455d-82ed-ddb8934a7fa9.png`，复用已选方案 3 的页签、蓝色激活线、面板边框与间距语言。
- Implementation screenshot: `/private/tmp/yangshao-calculation-tabs.png`。
- Combined side-by-side evidence: `/private/tmp/yangshao-calculation-tabs-compare.png`。
- Route: `http://127.0.0.1:5173/data`，Codex In-app Browser。
- Viewport: `390 x 844` CSS px；implementation 为 `390 x 844`、device scale 1。source 原始 `853 x 1844`，对比页按比例归一化到 `390 x 844`。
- State: 样品 001 展开，“检测数据”展开，“金属元素”页签选中。

### Findings

- 无 P0 / P1 / P2 问题。
- 五个页签在 390px 视口内等宽排列，每个约 `67.6 x 44px`，没有换行、裁切或页面横向溢出。
- “其他元素”已改为“微量元素”，并与“比重/白度”按用户确认顺序互换。

### Required fidelity surfaces

- Fonts and typography: 延续方案 3 的系统中文字体、600 字重和蓝色激活态；五页签使用 12px 单行标签以适配 390px 宽度，正文输入与结果字号保持原组件层级。
- Spacing and layout rhythm: 检测数据使用同一折叠卡片、44px 页签、10px 面板内边距；字段两列、结果卡片三列，未产生挤压或额外空白区。
- Colors and visual tokens: 沿用方案 3 的深蓝标题、冷灰边框、淡蓝结果底色与蓝色激活线，无新色系漂移。
- Image quality and asset fidelity: 检测数据区域不需要新增图片资产；品牌与现有页面资产保持原样，未增加占位素材。
- Copy and content: 页签顺序精确为“金属元素、微量元素、比重/白度、水份、灼烧”；每个面板只展示所属输入与计算结果。

### Interaction and accessibility evidence

- 五页签均使用 `role="tab"`、`aria-selected`、`aria-controls`；当前内容使用 `role="tabpanel"` 和 `aria-labelledby`。
- 已逐项点击五个页签并验证字段映射：金属 5 项、微量 5 项、比重/白度 2 项、水份 4 项、灼烧 3 项；计算结果随页签一并切换。
- 当前可编辑样品的所有检测输入均保持 enabled；原有输入、失焦提交、自动保存、只读与脱敏逻辑继续复用。
- 页面水平溢出 `0px`；浏览器控制台 error 为 0。现有 Element Plus checkbox 弃用提示仍为 warning，不是本次改动引入。

### Full-view and focused comparison evidence

- Full-view: 并排图同时显示方案 3 样品信息参考和检测数据实现，确认折叠卡片、页签层级、蓝色激活线与表单密度一致。
- Focused region: implementation 截图将检测数据区域置于 390px 视口中央，五页签文字、两列输入和三列结果均清晰可辨，因此无需额外裁剪。

### Comparison history

- Iteration 2: 首次并排比较未发现可操作的 P0 / P1 / P2 问题；五页签一次通过，无需视觉修复循环。

### Implementation checklist

- [x] 五个检测数据分组已合并为一个折叠区和五个页签。
- [x] “微量元素”重命名及页签顺序调整完成。
- [x] 每个样品独立记录当前检测页签，重新打开样品回到“金属元素”。
- [x] 原输入、结果、自动保存、只读和脱敏逻辑不变。
- [x] 390 x 844 真实浏览器下无横向溢出、无控制台 error。

final result: passed

## 复样逐条折叠与同版计算界面（2026-08-22）

### Comparison target

- Source visual truth: `/private/tmp/yangshao-mobile-retest-qa/source-parent-calculation.png`，取自同一页面原始样品的“检测数据”计算面板。
- Implementation screenshot: `/private/tmp/yangshao-mobile-retest-qa/implementation-retest-calculation.png`。
- Final interaction screenshot: `/private/tmp/yangshao-mobile-retest-qa/final-mobile-retests.png`。
- Combined side-by-side evidence: `/private/tmp/yangshao-mobile-retest-qa/retest-calculation-compare.png`。
- Route: `http://127.0.0.1:5173/data`，Codex In-app Browser。
- CSS viewport: `551 x 882`；页面 `body`、根节点和视口宽度均为 `551px`，横向溢出为 `0px`。
- State: 样品 001 含复样1、复样2；复样1收起、复样2展开，“金属元素”页签选中。

### Findings

- 无 P0 / P1 / P2 问题。
- 复样集合保留总折叠层，每组复样改为独立紧凑行，默认收起；一次只展开一组，避免多组计算表同时占据手机首屏。
- 展开的复样沿用原样品五页签计算结构；嵌套区域仅因父卡片内边距而略窄，字段、结果和操作无裁切。

### Required fidelity surfaces

- Fonts and typography: 复用原样品系统中文字体、深蓝标题、12px 页签和计算结果层级；“复样1、复样2”序号稳定可辨。
- Spacing and layout rhythm: 单组收起时只保留紧凑标题行；展开后为五页签、两列输入、三列结果，与原样品计算面板一致。
- Colors and visual tokens: 继续使用现有白底、冷灰边框、淡蓝结果块、蓝色激活线和绿色 ACTIVE 状态，无新增色系漂移。
- Image quality and asset fidelity: 本区域不需要新增图片资产；全部图标、状态和按钮继续由现有项目组件渲染。
- Copy and content: 复样页签顺序精确为“金属元素、微量元素、比重/白度、水份、灼烧”；展开区继续显示创建时间、参数快照、保存时间及删除/作废动作。

### Interaction and accessibility evidence

- 外层“复样记录（2）”控制集合显隐；内层每条复样都有独立按钮、展开/收起文字和方向符号。
- 已验证复样1展开时复样2自动收起，复样2展开时页面仅保留一个计算面板。
- 五个计算页签继续使用 `role="tab"`、`aria-selected`、`aria-controls`，面板使用 `role="tabpanel"`。
- 新建或高亮复样会自动展开对应行并定位首个可用输入；普通手动切换不会重复消费旧高亮。
- 可编辑、待处理锁定、只读、完成数据脱敏、VOID、删除与作废语义继续复用原复样状态机。
- 浏览器中当前金属页签包含 5 个输入和 5 个结果；微量元素页签字段映射已逐项验证。
- 控制台 error 为 0；页面横向溢出为 0px。

### Full-view and focused comparison evidence

- Full-view: `/private/tmp/yangshao-mobile-retest-qa/final-full-page.png` 覆盖手机端整页，确认复样区位于原样品计算组之后且未挤压底部导航。
- Focused region: `/private/tmp/yangshao-mobile-retest-qa/final-mobile-retests.png` 清晰显示两条复样、单开状态、元信息、操作按钮和完整金属计算面板。
- Side-by-side: `/private/tmp/yangshao-mobile-retest-qa/retest-calculation-compare.png` 证明复样与原样品使用相同页签顺序、两列输入、三列结果和视觉令牌。

### Comparison history

- Iteration 1: 首次浏览器对照即满足折叠密度、单开规则和同版计算布局，无需额外视觉修复。

### Implementation checklist

- [x] 复样1、复样2……分别显示为紧凑折叠行。
- [x] 一次只展开一组复样；集合关闭时所有内层复样归位为收起。
- [x] 展开后显示与原样品一致的五页签输入与计算结果。
- [x] 新建/高亮复样自动展开并聚焦；删除、作废、只读和脱敏不回退。
- [x] 浏览器无横向溢出、无控制台 error。

final result: passed

## 全项目界面优化验收（2026-10-09）

本节是本轮最新验收；其余内容保留为既有手机交互的历史记录。

### Comparison target

- Source visual truth: `/Users/zhangpengfei/.codex/generated_images/01a11e98-8c19-7e12-b788-e9d29a2441b5/exec-8db2f509-6068-4836-9e2f-8b668f18fabf.png`，用户认可的组件细节画板。
- Implementation: 前台 `http://127.0.0.1:5183/data`，后台 `http://127.0.0.1:5184/admin/finance/income`，Codex 内置浏览器。
- 实现截图：`/private/tmp/yangshao-ui-qa/final-desktop/frontend-data.png`、`final-desktop/admin-finance-income.png`、`final-mobile/frontend-data.png`。
- 桌面 CSS 视口及截图：1440 × 1024；手机：390 × 844，截图与 CSS 尺寸一致，密度按 1 比较。
- 参考原始像素：1322 × 1190；这是组件画板，因此按局部组件对比，并非将画板双栏布局复制到业务页面。保留真实菜单、完整表格列和操作顺序。
- 状态：主账号、浅色主题、演示样品及财务数据。真实业务数据内容按现有接口呈现。

### Full-view and focused evidence

- 同一输入中的整体比较：`/private/tmp/yangshao-ui-qa/final-reference-comparison.jpg`。
- 样品表等宽局部比较：`/private/tmp/yangshao-ui-qa/final-table-comparison.jpg`；参考表格及实现表格分别按 646px 宽显示，便于检查字号、网格、分组、输入焦点。
- 焦点原图：`/private/tmp/yangshao-ui-qa/after/frontend-cell-focus.png`。实际焦点阴影为灰蓝 1px 内边线和 2px 外圈。
- 菜单覆盖与各状态记录：`docs/ui-optimization-verification-2026-10-09.md`。

### Findings and comparison history

1. [P2，已修复] 原始资金与考勤列表将宽表格撑到页面外，收紧网格最小宽度并保留内部滚动；最终 49 个入口在桌面、手机合计 98 个视图中页面溢出均为 0px。
2. [P2，已修复] 后台手机考勤汇总、客户筛选及库存明细日期筛选超出内容区；调整列数与字段网格。库存日期控件由隐式 350px 列改为实际 182px，两个明细标签页复验均为 0px 溢出。
3. [P2，已修复] 手机保存动作仍有红色渐变，更新提示与助手默认位置重叠；改用灰蓝纯色，并错开提示位置。最终手机图已复查。
4. [P2，已修复] 样品格局部样式会覆盖通用输入焦点；增加表格专用焦点并通过真实点击与计算样式确认生效。
5. 以上修复后重新截图并与参考整体及局部比较，未发现新的可操作 P0／P1／P2 视觉问题。

### Required fidelity surfaces

- Fonts/typography：两端使用统一的系统中文字体与 Inter 回退；正文、表头、参数、数字及状态有稳定层级，无大面积浅色正文。
- Spacing/layout：保留密集样品多行块、原有菜单顺序和字段；按钮自然宽度，表格区域滚动，手机控件保持既有操作结构。
- Colors/tokens：雾白、白色、深灰与灰蓝主色；成功、警告、错误保留低饱和语义色。已完成样品保留既有淡桃色约定。
- Image/asset fidelity：图标来自现有 Element Plus 图标库，已有品牌与图片保留；并行工作已有的助手形象及拖动功能未被替换。图表由 ECharts 实际数据渲染。
- Copy/content：沿用业务文案、表格列、金额精度与单位；画板中的局部示意不用于删减真实字段。

### Interactions and verification

- 两端登录、记住账号、退出后恢复和快捷登录实际通过。
- 内部标签、两类报表与图表类型切换、账号设置、复样及完成标记弹窗已检查；没有提交密码、权限或资金变更。
- 145 个前台、后台及共用测试文件，1655 项通过；两端类型检查与构建通过。
- 浏览器未记录新的未捕获控制台 error。演示环境中前端偏好／模板同步仍依赖真实后端，既有 HTTP 500／同步提示与生产联调限制已在验收记录单独列明。
- 未在浏览器穷举每个权限、数据、导出组合；相关现有组件测试已通过。

### Follow-up polish

- [P3] 正式环境的超长客户名、极端大金额和真实触摸设备，可继续进行数据与实机覆盖。

### Implementation checklist

- [x] 共用色彩、控件、表格及图表规范已应用到两端。
- [x] 全部菜单入口及主要内部标签已复查。
- [x] 上述 P2 问题均已修复并复验。
- [x] 原有登录记忆、权限及业务行为通过回归。

final result: passed

## 2026-10-10 陶印字标替换验收

### Source and implementation

- Source visual truth：用户选定第一款，`/Users/zhangpengfei/.codex/generated_images/01a11e98-8c19-7e12-b788-e9d29a2441b5/exec-088e0264-452f-4900-8f1c-002b81549fd8.png`，1536 × 1024 的 LOGO 应用画板。
- 实现：前台 `http://127.0.0.1:5183/reports`，后台 `http://127.0.0.1:5184/admin/data`，以及各自登录页。
- 实现截图：`/private/tmp/yangshao-logo-qa/` 中 `frontend-sidebar.png`、`admin-sidebar.png`、`frontend-login.png`、`admin-login.png`、`frontend-mobile-login.png`、`admin-mobile-login.png`、`frontend-mobile-header.png`、`frontend-mobile-drawer.png`、两端 `*-collapsed.png`。
- 前台桌面截图 1280 × 720，后台桌面 1625 × 984；手机 CSS 视口与截图均为 390 × 844，密度按 1 比较。沿用当前桌面视口，未为截图改变桌面布局。
- 参考是应用画板，不是整页业务页面；只比较标志及侧栏／登录标题区，保留现有业务布局和文字。桌面侧栏保留原有 40px 槽位，移动端为 32px，登录为 48px。
- 状态：浅色、演示主账号、既有账号记忆。参考输入框为空，实现使用用户已保存的演示登录信息并显示原有快捷登录区域，此差异是现有功能，未删除或改动。

### Full-view and focused evidence

- 同一输入中的整体参考／实现对照：`/private/tmp/yangshao-logo-qa/reference-vs-implementation.jpg`。画板缩到 940px 宽，实际侧栏和登录卡片按原始像素裁切、未拉伸；不据此声称整页像素一致。
- 局部对照：`/private/tmp/yangshao-logo-qa/focused-logo-comparison.png`，将选定大图形和真实标题区放在同一比较输入中。
- 用户查看图：`/private/tmp/yangshao-logo-qa/actual-logo-preview.png`，来自真实页面截图。

### Findings and comparison history

- 未发现标志替换后的可操作 P0／P1／P2 问题。图形保留选定的陶土底形、几何笔画和右侧断笔，两端复用同一透明 PNG，无占位文字、CSS 绘图或手工 SVG 替代。
- 手机前台登录页首次检查时，原 24px 标题将末尾「统」单独换行；将手机标题降为 22px 后重新捕获 `frontend-mobile-login.png`，390px 下标题完整一行，副标题正常换行，无溢出。属于标志附近的排版微调。
- 共用 PNG 保留图形内留白，所以可见陶印比元素槽位略小；实际 32／40／48px 下笔画清楚，边缘没有白底或明显光晕，不增加裁切遮罩。

### Required fidelity surfaces

- Fonts/typography：继续使用现有系统中文字体，前台手机标题 22px，后台标题 24px；既有副标题与表单字号保留。画板的展示字体不用于覆盖系统字体。
- Spacing/layout：两端标志与标题垂直居中；前台沿用原有 48px 图标槽位，后台增加 48px 标志与 12px 间距。侧栏折叠、移动导航、登录卡片与操作顺序正常。
- Colors/tokens：低饱和陶土色标志与原有雾白、白色、灰蓝控件协调；旧标记背景与边框已移除，不形成双重底形。
- Image quality/asset fidelity：1254 × 1254 RGBA，alpha 范围 0–255；两端导入并打包同一图片，32／40／48px 浏览器显示清晰，图片加载成功。
- Copy/content：品牌名称和业务文案保持原样；登录／注册、记住账号、清除和快捷登录均保留，未将画板说明或英文口号加入业务页面。

### Interactions and verification

- 两端展开／折叠侧栏、退出登录、快捷登录通过；前台移动抽屉正常打开并显示同一标志。
- 两端桌面及 390px 手机登录页页面横向溢出均为 0px，登录标志加载成功。前台手机顶部和抽屉均为 32px、加载成功。
- `AppLayout.test.ts` 8 项、`AppMobileShell.test.ts` 5 项、`useRememberedLogin.test.ts` 11 项，共 24 项通过；没有为单纯标志替换新增镜像测试。
- 两端 `vue-tsc --noEmit` 与 Vite 构建通过；手机字号微调后前台构建再次通过；`git diff --check` 通过。
- 两端最后一轮浏览器控制台 error 列表为空。预览环境的前台偏好接口仍有既有未配置响应，未在此视觉任务中改动接口。
- 已恢复两端登录状态、清除临时手机视口覆盖，并保持本地预览；未提交、部署、修改权限或业务数据。

### Follow-up polish

- 无需要阻断交付的视觉差异。 favicon／PWA 桌面图标不属于此次侧栏与登录标志替换范围。

### Implementation checklist

- [x] 用户选择第一款后执行替换。
- [x] 透明图片保存到项目内，由两端共用。
- [x] 桌面、手机与折叠状态复查。
- [x] 保留登录记忆与原有业务操作。

final result: passed
