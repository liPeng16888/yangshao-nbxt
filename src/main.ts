import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { registerSW } from 'virtual:pwa-register'
import 'element-plus/dist/index.css'
import './styles/global.scss'
import '../shared/styles/ui.scss'
import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })
app.mount('#app')

if ('serviceWorker' in navigator) {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      window.dispatchEvent(new Event('ys-pwa-update-available'))
    }
  })
  window.addEventListener('ys-pwa-apply-update', () => {
    void updateSW(true)
  })
}
