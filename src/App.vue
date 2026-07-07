<template>
  <div class="app-shell">
    <TitleBar @close="handleClose" @minimize="handleMinimize" @settings="showSettings = true" />

    <main class="workspace" :class="{ 'detail-left': hasDetail && detailPosition === 'left', 'detail-right': hasDetail && detailPosition === 'right' }">
      <aside class="sidebar">
        <HomeView
          :selected-code="selectedCode"
          @select="showStockDetail"
          @asset-type-change="handleAssetTypeChange"
        />
      </aside>

      <section v-if="hasDetail" class="detail-panel" :class="{ 'panel-left': detailPosition === 'left', 'panel-right': detailPosition === 'right' }">
        <DetailView :code="selectedCode" @close="closeDetail" />
      </section>
    </main>

    <div v-if="showSettings" class="settings-overlay" @click.self="showSettings = false">
      <div class="settings-dialog">
        <SettingsView @close="showSettings = false" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, computed, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { LogicalSize, PhysicalPosition } from '@tauri-apps/api/dpi'
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window'
import TitleBar from './components/TitleBar.vue'
import HomeView from './views/Home.vue'
import { useSettingsStore } from './stores/settings'
import { useStockStore } from './stores/stock'
import type { AssetType } from './api/stock'

const DetailView = defineAsyncComponent(() => import('./views/Detail.vue'))
const SettingsView = defineAsyncComponent(() => import('./views/Settings.vue'))

const stockStore = useStockStore()
const settingsStore = useSettingsStore()

const COMPACT_SIZE = { width: 280, height: 480 }
const EXPANDED_SIZE = { width: 900, height: 480 }
const DETAIL_WIDTH = 620

const selectedCode = ref('')
const detailPosition = ref<'left' | 'right'>('right')
const showSettings = ref(false)
const hasDetail = computed(() => Boolean(selectedCode.value))

function showStockDetail(code: string) {
  void openDetail(code)
}

function handleAssetTypeChange(assetType: AssetType) {
  if (assetType === 'fund' && hasDetail.value) {
    void closeDetail()
  }
}

async function determineDetailPosition(): Promise<'left' | 'right'> {
  try {
    const appWindow = getCurrentWindow()
    const scaleFactor = await appWindow.scaleFactor()
    const position = await appWindow.outerPosition()
    const size = await appWindow.outerSize()
    const windowLeftEdge = position.x
    const windowRightEdge = position.x + size.width
    const monitor = await currentMonitor()
    const monitorLeft = monitor?.workArea.position.x ?? 0
    const monitorRight = monitor ? monitor.workArea.position.x + monitor.workArea.size.width : Number.POSITIVE_INFINITY
    const requiredWidth = new LogicalSize(DETAIL_WIDTH, 0).toPhysical(scaleFactor).width

    const rightAvailable = monitorRight - windowRightEdge
    const leftAvailable = windowLeftEdge - monitorLeft

    if (rightAvailable >= requiredWidth) {
      return 'right'
    }

    if (leftAvailable >= requiredWidth) {
      return 'left'
    }

    return rightAvailable >= leftAvailable ? 'right' : 'left'
  } catch {
    return 'right'
  }
}

async function openDetail(code: string) {
  if (!code) {
    return
  }

  if (selectedCode.value === code) {
    await closeDetail()
    return
  }

  if (hasDetail.value) {
    selectedCode.value = code
    return
  }

  const nextDetailPosition = await determineDetailPosition()
  detailPosition.value = nextDetailPosition
  selectedCode.value = code
  await syncWindowSize(true, nextDetailPosition)
}

async function closeDetail() {
  const closingPosition = detailPosition.value
  selectedCode.value = ''
  await syncWindowSize(false, closingPosition)
}

async function syncWindowSize(nextHasDetail = hasDetail.value, targetDetailPosition = detailPosition.value) {
  const appWindow = getCurrentWindow()
  const targetWidth = nextHasDetail ? EXPANDED_SIZE.width : COMPACT_SIZE.width

  try {
    await appWindow.setMinSize(new LogicalSize(COMPACT_SIZE.width, COMPACT_SIZE.height))
    const scaleFactor = await appWindow.scaleFactor()
    const currentSize = await appWindow.innerSize()
    const currentLogicalSize = currentSize.toLogical(scaleFactor)
    const currentPosition = await appWindow.outerPosition()
    const targetPhysicalWidth = new LogicalSize(targetWidth, currentLogicalSize.height).toPhysical(scaleFactor).width
    const widthDelta = targetPhysicalWidth - currentSize.width
    const shouldAnchorWidgetSide = (nextHasDetail && targetDetailPosition === 'left') || (!nextHasDetail && targetDetailPosition === 'left')

    if (shouldAnchorWidgetSide && widthDelta !== 0) {
      await appWindow.setPosition(new PhysicalPosition(currentPosition.x - widthDelta, currentPosition.y))
    }

    await appWindow.setSize(new LogicalSize(targetWidth, currentLogicalSize.height))
  } catch (error) {
    console.error('Sync window size error:', error)
  }
}

async function handleClose() {
  try {
    await invoke('close_window')
  } catch (error) {
    console.error('Close window error:', error)
  }
}

async function handleMinimize() {
  const command = settingsStore.settings.minimizeToTray ? 'minimize_to_tray' : 'minimize_window'

  try {
    await invoke(command)
  } catch (error) {
    console.error('Minimize window error:', error)
  }
}

watch(() => [...stockStore.watchList], (watchList) => {
  if (!selectedCode.value) {
    return
  }

  if (!watchList.includes(selectedCode.value)) {
    selectedCode.value = ''
  }
})

onMounted(async () => {
  settingsStore.load()
  try {
    await invoke('set_always_on_top', { enabled: settingsStore.settings.alwaysOnTop })
  } catch (error) {
    console.error('Apply always on top setting error:', error)
  }
  await stockStore.init()
})
</script>

<style scoped>
.app-shell {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.workspace {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: row;
  overflow: hidden;
}

.workspace.detail-left {
  flex-direction: row-reverse;
}

.sidebar {
  height: 100%;
  flex: 0 0 280px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--border-color);
  background: var(--window-bg);
}

.detail-panel {
  height: 100%;
  flex: 1 1 auto;
  min-width: 620px;
  background: var(--window-bg);
}

.detail-panel.panel-right {
  border-left: 1px solid var(--border-color);
}

.detail-panel.panel-left {
  border-right: 1px solid var(--border-color);
}

.settings-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 100;
}

.settings-dialog {
  width: min(440px, 100%);
  height: min(640px, 100%);
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 22px;
  background: var(--solid-bg);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
}

@media (max-width: 860px) {
  .workspace {
    position: relative;
    display: block;
  }

  .sidebar {
    width: 100%;
    min-width: 0;
    flex: none;
    border-right: none;
  }

  .detail-panel,
  .detail-panel.panel-right,
  .detail-panel.panel-left {
    position: absolute;
    inset: 0;
    min-width: 0;
    border: none;
    background: var(--window-bg);
  }
}

</style>
