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
    const message = error?.response?.data?.message || error?.message || '请求失败'
    if (status === 401) {
      localStorage.removeItem('ys_token')
      localStorage.removeItem('ys_user')
      window.location.href = '/login'
      return Promise.reject(error)
    }
    ElMessage.error(message)
    return Promise.reject(error)
  }
)

export const useMocks = import.meta.env.VITE_USE_MOCKS !== 'false'

export default request
