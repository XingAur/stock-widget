import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'virtual:uno.css'
import App from './App.vue'
import './styles/global.css'
import { reloadIfAppShellMissing } from './utils/windowLifecycle'
import { logError } from './utils/logger'

const app = createApp(App)
app.use(createPinia())
app.config.errorHandler = (error, _instance, info) => {
  console.error('Vue error:', error, info)
  logError(`Vue 渲染错误（${info}）`, error)
  queueMicrotask(() => {
    reloadIfAppShellMissing()
  })
}
app.mount('#app')