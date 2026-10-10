export type FeishuAudience = 'frontend' | 'admin'
export function safeFeishuReturn(value: unknown): string | null {
  return typeof value === 'string' && /^\/ai\/feishu\/(bind|access)#proof=[A-Za-z0-9_-]{20,100}$/.test(value) ? value : null
}
export function rememberFeishuReturn(audience: FeishuAudience, value: string) {
  const target = safeFeishuReturn(value)
  if (!target) return
  try { sessionStorage.setItem(`ys_feishu_return_${audience}`, JSON.stringify({ target, expiresAt: Date.now() + 10 * 60000 })) } catch {}
}
export function feishuLoginReturn(audience: FeishuAudience, consume = false) {
  try {
    const key = `ys_feishu_return_${audience}`, value = JSON.parse(sessionStorage.getItem(key) || 'null')
    const target = value?.expiresAt > Date.now() ? safeFeishuReturn(value.target) : null
    if (consume || !target) sessionStorage.removeItem(key)
    return target || '/data'
  } catch { return '/data' }
}
