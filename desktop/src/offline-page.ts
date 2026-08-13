import type { DesktopTargetConfig } from './config.js'
import { isAllowedNavigation } from './security-policy.js'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function renderOfflinePage(target: DesktopTargetConfig): string {
  const productName = escapeHtml(target.productName)
  const entryUrl = escapeHtml(target.entryUrl)

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'">
    <title>${productName}</title>
    <style>
      :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f5f7fa; color: #303133; }
      main { width: min(520px, calc(100vw - 48px)); padding: 44px; border: 1px solid #dcdfe6; border-radius: 14px; background: #fff; text-align: center; box-shadow: 0 12px 30px rgb(0 0 0 / 8%); }
      h1 { margin: 0 0 14px; font-size: 25px; }
      p { margin: 0 0 28px; color: #606266; line-height: 1.7; }
      a { display: inline-block; padding: 11px 28px; border-radius: 7px; background: #c62828; color: #fff; font-weight: 600; text-decoration: none; }
    </style>
  </head>
  <body>
    <main>
      <h1>网络或服务器不可用</h1>
      <p>请检查网络连接，或稍后重试。</p>
      <a href="${entryUrl}">重试</a>
    </main>
  </body>
</html>`
}

export function createOfflinePageDataUrl(target: DesktopTargetConfig): string {
  return `data:text/html;charset=UTF-8,${encodeURIComponent(renderOfflinePage(target))}`
}

export function shouldShowOfflinePage(
  isMainFrame: boolean,
  errorCode: number,
  validatedUrl: string,
  target: DesktopTargetConfig,
): boolean {
  return (
    isMainFrame &&
    errorCode !== -3 &&
    isAllowedNavigation(validatedUrl, target)
  )
}
