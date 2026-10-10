export function aiClient(audience: 'frontend' | 'admin', base = '/api') {
  return async function request<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
    const token = localStorage.getItem(audience === 'admin' ? 'ys_admin_token' : 'ys_token')
    const multipart = options.body instanceof FormData
    const response = await fetch(`${base.replace(/\/$/, '')}${path}`, {
      method: options.method || 'GET', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.body !== undefined && !multipart ? { 'Content-Type': 'application/json' } : {}) },
      body: options.body === undefined ? undefined : multipart ? options.body as FormData : JSON.stringify(options.body), signal: options.signal
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      const message = typeof data?.message === 'string' ? data.message : typeof data?.message?.message === 'string' ? data.message.message : 'AI 服务暂时不可用，请检查后端服务和配置'
      throw new Error(message)
    }
    return data as T
  }
}
export function currentAiGrants(audience: 'frontend' | 'admin') {
  if (audience === 'admin') return {}
  try {
    const sessions = JSON.parse(localStorage.getItem('ys_access_guard_group_sessions') || '{}') as Record<string, { expiresAt?: number; token?: string; features?: string[] }>
    const grants: Record<string, string> = {}
    for (const session of Object.values(sessions)) {
      if (session?.token && (session.expiresAt || 0) > Date.now() && Array.isArray(session.features)) {
        for (const feature of session.features) grants[feature] = session.token
      }
    }
    return grants
  } catch { return {} }
}
