import { reactive, ref } from 'vue'

type Credentials = { account: string; password: string }
export type LoginArea = 'frontend' | 'admin'

const storageKeys: Record<LoginArea, string> = {
  frontend: 'ys_remembered_login_v1',
  admin: 'ys_admin_remembered_login_v1'
}

function readCredentials(area: LoginArea): Credentials | null {
  try {
    const raw = localStorage.getItem(storageKeys[area])
    if (!raw) return null
    const value = JSON.parse(raw)
    if (
      value?.version === 1 &&
      typeof value.account === 'string' && value.account.trim() &&
      typeof value.password === 'string' && value.password
    ) return { account: value.account, password: value.password }
  } catch {
    // A damaged record or unavailable browser storage must not prevent login.
  }
  return null
}

export function useRememberedLogin(area: LoginArea) {
  const savedCredentials = ref(readCredentials(area))
  const rememberCredentials = ref(Boolean(savedCredentials.value))
  const form = reactive<Credentials>({
    account: savedCredentials.value?.account ?? '',
    password: savedCredentials.value?.password ?? ''
  })

  function forgetCredentials() {
    try {
      localStorage.removeItem(storageKeys[area])
    } catch {
      return false
    }
    savedCredentials.value = null
    rememberCredentials.value = false
    return true
  }

  function saveAfterLogin(credentials: Credentials) {
    if (!rememberCredentials.value) return forgetCredentials()
    try {
      const saved = { account: credentials.account.trim(), password: credentials.password }
      localStorage.setItem(storageKeys[area], JSON.stringify({ version: 1, ...saved }))
      savedCredentials.value = saved
      return true
    } catch {
      return false
    }
  }

  function prepareQuickLogin() {
    if (!savedCredentials.value) return false
    Object.assign(form, savedCredentials.value)
    rememberCredentials.value = true
    return true
  }

  return { form, savedCredentials, rememberCredentials, forgetCredentials, saveAfterLogin, prepareQuickLogin }
}
