export function renderFindPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'">
    <title>查找</title>
    <style>
      :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 18px; background: #f5f7fa; color: #303133; }
      main { display: grid; grid-template-columns: minmax(180px, 1fr) auto auto auto; gap: 8px; align-items: center; }
      input, button { height: 34px; border: 1px solid #c0c4cc; border-radius: 6px; font: inherit; }
      input { min-width: 0; padding: 0 10px; background: #fff; }
      button { min-width: 58px; padding: 0 12px; background: #fff; cursor: default; }
      output { grid-column: 1 / -1; min-height: 18px; color: #606266; font-size: 13px; }
    </style>
  </head>
  <body>
    <main>
      <input id="query" type="search" maxlength="200" autocomplete="off" aria-label="查找内容">
      <button id="previous" type="button">上一个</button>
      <button id="next" type="button">下一个</button>
      <button id="close" type="button">关闭</button>
      <output id="result" aria-live="polite"></output>
    </main>
  </body>
</html>`
}

export function createFindPageDataUrl(): string {
  return `data:text/html;charset=UTF-8,${encodeURIComponent(renderFindPage())}`
}
