import type { DesktopTargetConfig } from './config.js'
import type { LoadingFailureReason } from './loading-coordinator.js'
import { isAllowedNavigation } from './security-policy.js'

const failureSummaries: Record<LoadingFailureReason, string> = {
  timeout: '连接服务器超时，请检查网络后重试。',
  load: '无法加载服务器页面，请检查网络后重试。',
  'render-process-gone': '页面运行进程已意外退出，请重试恢复。',
  unresponsive: '页面暂时无响应，请重试恢复。',
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function renderOfflinePage(
  target: DesktopTargetConfig,
  reason: LoadingFailureReason = 'load',
): string {
  const productName = escapeHtml(target.productName)
  const entryUrl = escapeHtml(target.entryUrl)
  const summary = failureSummaries[reason]

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
      nav { display: flex; justify-content: center; gap: 12px; }
      a { display: inline-block; min-width: 92px; padding: 11px 24px; border-radius: 7px; background: #c62828; color: #fff; font-weight: 600; text-decoration: none; }
      a.secondary { border: 1px solid #dcdfe6; background: #fff; color: #606266; }
    </style>
  </head>
  <body>
    <main>
      <h1>网络或服务器不可用</h1>
      <p>${summary}</p>
      <nav><a href="${entryUrl}">重试</a><a class="secondary" href="#exit">退出</a></nav>
    </main>
  </body>
</html>`
}

export function createOfflinePageDataUrl(
  target: DesktopTargetConfig,
  reason: LoadingFailureReason = 'load',
): string {
  return `data:text/html;charset=UTF-8,${encodeURIComponent(renderOfflinePage(target, reason))}`
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
