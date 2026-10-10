# 仰韶化验室 LOGO

用户从三款独立设计中选定第一款「陶印字标」，沿用低饱和陶土色、几何化「仰」字与右侧矿物切面断笔。

素材：`shared/assets/yangshao-logo-seal.png`，1254 × 1254 RGBA，透明背景。前后台共用 `shared/BrandLogo.vue`，避免分别维护图片。桌面侧栏沿用 40px 槽位，移动顶部和抽屉为 32px，登录页为 48px；不改变原有导航或登录操作。素材内部保留透明留白，按原比例显示。

选定展示图：`/Users/zhangpengfei/.codex/generated_images/01a11e98-8c19-7e12-b788-e9d29a2441b5/exec-088e0264-452f-4900-8f1c-002b81549fd8.png`。

使用内置 Image Gen 提取独立图片，设置 `transparent_background: true`，未使用 CLI。完整素材提示词如下：

```text
Use case: background-extraction. Asset type: approved production logo PNG with alpha.
Extract the EXACT approved terracotta "仰" seal logo from the supplied concept board, the LARGE standalone mark at the upper left, roughly x=84–258 and y=246–420 of the 1536x1024 reference. It is a softly squared muted clay-red tile with the existing custom cream geometric 仰-derived strokes, including the distinctive broken mineral-cut shapes on the right. Preserve that EXACT silhouette, negative-space geometry, stroke positions, corner shape and muted #a95d55 clay color. Do not reinterpret the lettering, change the letterform, add ornament, redesign, or copy the nearby wordmark.
Output ONLY this one standalone logo centered on a 1024x1024 genuinely transparent canvas, with the square mark occupying about 96% of width and height. Transparent pixels outside the tile's rounded corners and narrow outer margin; the white/cream strokes INSIDE the tile remain solid. No concept board, no titles, no Chinese wordmark beside it, no text labels, no black/white variant, no multiple logos. Smooth crisp antialiased edges, flat restrained clay fill keeping only the subtle shading present in the approved reference, no drop shadow, no white halo, no baked checkerboard, no surrounding background.
This is extraction of the selected approved logo for a 32px sidebar and 48px login header, not a new style proposal.
```

工具实际输出为 1254 × 1254，前台和后台构建均可正确解析共用图片，包括后台 `/admin/` 路径。图片已保存到项目内，不依赖生成目录运行。

验证：前后台类型检查与构建通过；导航与记住登录的三个现有测试文件共 24 项通过。内置浏览器检查两端展开／折叠侧栏、桌面和 390 × 844 手机登录页、前台手机顶部与抽屉，图片均加载成功，无页面横向溢出。两端退出后快捷登录通过，登录状态已恢复，预览继续运行。视觉对照和完整验收见项目根目录 `design-qa.md` 的 2026-10-10 记录。
