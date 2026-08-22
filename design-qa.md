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
