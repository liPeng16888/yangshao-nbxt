import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getMe, login, logout, register, updatePassword } from '@/api/auth'
import type { AuthUser, LoginPayload, RegisterPayload, UpdatePasswordPayload } from '@/types/auth'

const tokenKey = 'ys_token'
const userKey = 'ys_user'

function readStoredUser() {
  const raw = localStorage.getItem(userKey)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem(tokenKey) || '')
  const user = ref<AuthUser | null>(readStoredUser())
  const loading = ref(false)

  const isLoggedIn = computed(() => Boolean(token.value && user.value))

  function persist(nextToken: string, nextUser: AuthUser) {
    token.value = nextToken
    user.value = nextUser
    localStorage.setItem(tokenKey, nextToken)
    localStorage.setItem(userKey, JSON.stringify(nextUser))
  }

  async function loginWithPassword(payload: LoginPayload) {
    loading.value = true
    try {
      const response = await login(payload)
      persist(response.token, response.user)
      return response
    } finally {
      loading.value = false
    }
  }

  async function registerWithInvite(payload: RegisterPayload) {
    loading.value = true
    try {
      const response = await register(payload)
      persist(response.token, response.user)
      return response
    } finally {
      loading.value = false
    }
  }

  async function refreshUser() {
    if (!token.value) return null
    user.value = await getMe()
    localStorage.setItem(userKey, JSON.stringify(user.value))
    return user.value
  }

  async function logoutCurrentUser() {
    await logout()
    token.value = ''
    user.value = null
    localStorage.removeItem(tokenKey)
    localStorage.removeItem(userKey)
  }

  async function updateCurrentPassword(payload: UpdatePasswordPayload) {
    return updatePassword(payload)
  }

  return {
    token,
    user,
    loading,
    isLoggedIn,
    loginWithPassword,
    registerWithInvite,
    refreshUser,
    updateCurrentPassword,
    logoutCurrentUser
  }
})
