<template>
  <div class="app-container" :class="{ 'mini-mode': isMiniMode }">
    <TitleBar @close="handleClose" @minimize="handleMinimize" @settings="showSettings = true" />
    <main class="main-content">
      <HomeView v-if="!showDetail && !showSettings" @select="showStockDetail" />
      <DetailView v-if="showDetail" :code="currentDetailCode" @back="showDetail = false" />
      <SettingsView v-if="showSettings" @close="showSettings = false" />
    </main>
    <MiniWidget v-if="isMiniMode" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, provide } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useStockStore } from './stores/stock'
import { useSettingsStore } from './stores/settings'
import TitleBar from './components/TitleBar.vue'
import HomeView from './views/Home.vue'
import DetailView from './views/Detail.vue'
import SettingsView from './views/Settings.vue'
import MiniWidget from './components/MiniWidget.vue'

const stockStore = useStockStore()
const settingsStore = useSettingsStore()

const showDetail = ref(false)
const showSettings = ref(false)
const currentDetailCode = ref('')
const isMiniMode = ref(false)

// 显示股票详情
function showStockDetail(code: string) {
  currentDetailCode.value = code
  showDetail.value = true
}

// 关闭窗口
async function handleClose() {
  try {
    await invoke('close_window')
  } catch (e) {
    console.error('Close window error:', e)
  }
}

// 最小化窗口
async function handleMinimize() {
  if (settingsStore.settings.minimizeToTray) {
    try {
      await invoke('minimize_to_tray')
    } catch (e) {
      console.error('Minimize to tray error:', e)
    }
  } else {
    try {
      await invoke('minimize_window')
    } catch (e) {
      console.error('Minimize window error:', e)
    }
  }
}

// 提供全局状态
provide('isMiniMode', isMiniMode)

onMounted(async () => {
  await stockStore.init()
  settingsStore.load()

  // 监听恢复窗口事件
  // const { listen } = await import('@tauri-apps/api/event')
  // await listen('restore-window', () => {
  //   isMiniMode.value = false
  // })
})
</script>

<style scoped>
.app-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.main-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>