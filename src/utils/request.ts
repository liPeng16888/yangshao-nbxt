import axios from 'axios'
import { ElMessage } from 'element-plus'

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000
})

request.interceptors.request.use((config) => {
  const token = localStorage.getItem('ys_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const status = error?.response?.status
    const data = error?.response?.data
    const rawMessage = data?.message
    const code = data?.code || (rawMessage && typeof rawMessage === 'object' ? rawMessage.code : undefined)
    const message =
      typeof rawMessage === 'string'
        ? rawMessage
        : typeof rawMessage?.message === 'string'
          ? rawMessage.message
          : typeof data?.error === 'string'
            ? data.error
            : error?.message || '请求失败'
    if (status === 401) {
      localStorage.removeItem('ys_token')
      localStorage.removeItem('ys_user')
      localStorage.removeItem('ys_access_guard_group_sessions')
      ElMessage.error(message)
      window.location.href = '/login'
      return Promise.reject(error)
    }
    if (status === 403 && code === 'ACCESS_GRANT_INVALID') {
      localStorage.removeItem('ys_access_guard_group_sessions')
    }
    ElMessage.error(message)
    return Promise.reject(error)
  }
)

export const useMocks = import.meta.env.VITE_USE_MOCKS === 'true' || (import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS !== 'false')

export default request
