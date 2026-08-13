import type { DesktopTargetConfig } from './config.js'
import { loadingIconDataUrls } from './loading-icons.js'
export { loadingIconDataUrls } from './loading-icons.js'

export type LoadingMode = 'startup' | 'reload' | 'recovery'

const loadingMessages: Record<LoadingMode, string> = {
  startup: '正在连接服务器',
  reload: '正在刷新',
  recovery: '正在重新连接服务器',
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function renderLoadingPage(
  target: DesktopTargetConfig,
  mode: LoadingMode,
): string {
  const productName = escapeHtml(target.productName)
  const message = loadingMessages[mode]
  const iconDataUrl = loadingIconDataUrls[target.key]

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
      main { text-align: center; }
      .mark { width: 84px; height: 84px; margin: 0 auto 22px; display: block; object-fit: contain; }
      h1 { margin: 0 0 14px; font-size: 25px; font-weight: 650; }
      p { margin: 0; color: #606266; font-size: 16px; }
      .pulse { display: inline-flex; gap: 6px; margin-top: 22px; }
      .pulse span { width: 7px; height: 7px; border-radius: 50%; background: #9e2a22; opacity: .65; }
    </style>
  </head>
  <body>
    <main>
      <img class="mark" src="${iconDataUrl}" alt="">
      <h1>${productName}</h1>
      <p>${message}</p>
      <div class="pulse" aria-hidden="true"><span></span><span></span><span></span></div>
    </main>
  </body>
</html>`
}

export function createLoadingPageDataUrl(
  target: DesktopTargetConfig,
  mode: LoadingMode,
): string {
  return `data:text/html;charset=UTF-8,${encodeURIComponent(renderLoadingPage(target, mode))}`
}
