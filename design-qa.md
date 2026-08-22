# 方案 3 手机端样品信息 Design QA

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

final result: passed
