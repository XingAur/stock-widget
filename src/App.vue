<template>
  <div class="app-shell" @mousedown="handleShellMouseDown">
    <TitleBar
      :title="assetTitle"
      :quant-active="stockStore.activeAssetType === 'quant'"
      @close="handleClose"
      @minimize="handleMinimize"
      @settings="openSettings"
      @toggle-asset-type="toggleAssetType"
      @toggle-quant="toggleQuant"
    />

    <main class="workspace" :class="{ 'detail-left': hasDetail && detailPosition === 'left', 'detail-right': hasDetail && detailPosition === 'right' }">
      <aside class="sidebar">
        <HomeView
          v-if="stockStore.activeAssetType === 'stock' || stockStore.activeAssetType === 'fund'"
          :selected-code="selectedCode"
          @select-detail="showDetail"
        />
        <MarketView v-else-if="stockStore.activeAssetType === 'market'" />
        <QuantView v-else />
      </aside>

      <section v-if="hasDetail" class="detail-panel" :class="{ 'panel-left': detailPosition === 'left', 'panel-right': detailPosition === 'right' }">
        <DetailView
          v-if="selectedDetail?.assetType === 'stock'"
          :code="selectedCode"
          @close="closeDetail"
        />
        <FundDetailView
          v-else-if="selectedDetail?.assetType === 'fund'"
          :code="selectedCode"
          @close="closeDetail"
        />
      </section>
    </main>

    <div v-if="showSettings" class="cl-backdrop cl-backdrop--contained settings-overlay" @click.self="closeSettings">
      <div
        ref="settingsDialogRef"
        class="cl-dialog cl-dialog--tall settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="应用设置"
        tabindex="-1"
        @keydown="handleSettingsKeydown"
      >
        <SettingsView @close="closeSettings" />
      </div>
    </div>

    <div v-if="updateState.visible" class="cl-backdrop cl-backdrop--contained update-overlay" @click.self="closeUpdateDialog">
      <div class="cl-dialog cl-dialog--sm update-dialog" role="dialog" aria-modal="true" aria-label="软件更新">
        <div class="cl-dialog__head">
          <h3 class="cl-dialog__title">软件更新</h3>
        </div>
        <template v-if="updateState.checking">
          <div class="cl-dialog__body update-status"><span class="cl-spinner"></span>正在检查更新…</div>
        </template>
        <template v-else-if="updateState.error">
          <div class="cl-dialog__body">
            <p class="update-status update-error">{{ updateState.error }}</p>
          </div>
          <div class="cl-dialog__foot update-actions">
            <button class="cl-btn cl-btn--ghost update-btn secondary" type="button" @click="closeUpdateDialog">关闭</button>
            <button class="cl-btn cl-btn--primary update-btn" type="button" @click="openReleasePage">手动打开下载页</button>
          </div>
        </template>
        <template v-else-if="updateInfo?.hasUpdate">
          <div class="cl-dialog__body">
            <p class="update-status">发现新版本 <strong class="update-version">v{{ updateInfo.latestVersion }}</strong>（当前 v{{ updateInfo.currentVersion }}）</p>
            <p class="update-notes cl-scroll">{{ updateInfo.notes }}</p>
            <div v-if="updateState.downloading" class="update-download">
              <span class="update-status">正在下载更新包…</span>
              <div class="cl-progress cl-progress--sm cl-progress--indeterminate"><div class="cl-progress__bar"></div></div>
            </div>
          </div>
          <div class="cl-dialog__foot update-actions">
            <button class="cl-btn cl-btn--ghost update-btn secondary" type="button" :disabled="updateState.downloading" @click="closeUpdateDialog">稍后再说</button>
            <button
              class="cl-btn cl-btn--primary update-btn"
              :class="{ 'is-loading': updateState.downloading }"
              type="button"
              :disabled="updateState.downloading || !updateInfo.downloadUrl"
              @click="startUpdate"
            >
              {{ updateState.downloading ? '下载中…' : '立即升级' }}
            </button>
          </div>
        </template>
        <template v-else>
          <div class="cl-dialog__body">
            <p class="update-status">已是最新版本 v{{ updateInfo?.currentVersion }}</p>
          </div>
          <div class="cl-dialog__foot update-actions">
            <button class="cl-btn cl-btn--primary update-btn" type="button" @click="closeUpdateDialog">好的</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { LogicalSize, PhysicalPosition } from '@tauri-apps/api/dpi'
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window'
import { anchoredWindowX } from './utils/windowGeometry'
import TitleBar from './components/TitleBar.vue'
import HomeView from './views/Home.vue'
import MarketView from './views/MarketView.vue'
import QuantView from './views/QuantView.vue'
import { useSettingsStore } from './stores/settings'
import { useStockStore } from './stores/stock'
import type { AssetType } from './api/stock'
import { getAssetTitle, getNextAssetType } from './utils/assets'
import { focusFirstModalControl, trapModalFocus } from './utils/modalFocus'
import { isTauriRuntime } from './utils/persistence'
import { lastWatchlistViewType, rememberWatchlistView } from './utils/market'
import { logError, logInfo } from './utils/logger'
import { startWindowDrag } from './utils/windowDrag'
import { kickWebViewPaint, onPageVisibilityChange, reloadIfAppShellMissing } from './utils/windowLifecycle'

const DetailView = defineAsyncComponent(() => import('./views/Detail.vue'))
const FundDetailView = defineAsyncComponent(() => import('./views/FundDetail.vue'))
const SettingsView = defineAsyncComponent(() => import('./views/Settings.vue'))

const stockStore = useStockStore()
const settingsStore = useSettingsStore()

const COMPACT_SIZE = { width: 280, height: 480 }
const EXPANDED_SIZE = { width: 900, height: 480 }
const DETAIL_WIDTH = 620
const QUANT_WIDE_SIZE = { width: 720, height: 480 }

interface DetailSelection {
  assetType: AssetType
  code: string
}

const selectedDetail = ref<DetailSelection | null>(null)
const selectedCode = computed(() => selectedDetail.value?.code ?? '')
const detailPosition = ref<'left' | 'right'>('right')
let activeExpansionDirection: 'left' | 'right' | null = null
let windowResizeQueue: Promise<void> = Promise.resolve()
const showSettings = ref(false)
const settingsDialogRef = ref<HTMLElement | null>(null)
const hasDetail = computed(() => Boolean(selectedDetail.value))
const assetTitle = computed(() => getAssetTitle(stockStore.activeAssetType))
let settingsTrigger: HTMLElement | null = null
let stopVisibility: (() => void) | null = null
let unlistenWindowRestored: (() => void) | null = null
let unlistenCheckUpdate: (() => void) | null = null

interface UpdateCheckInfo {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  releaseUrl: string
  downloadUrl: string | null
  notes: string
}

const updateInfo = ref<UpdateCheckInfo | null>(null)
const updateState = ref<{ visible: boolean; checking: boolean; downloading: boolean; error: string }>({
  visible: false,
  checking: false,
  downloading: false,
  error: ''
})

async function openUpdateDialog(): Promise<void> {
  updateState.value = { visible: true, checking: true, downloading: false, error: '' }
  logInfo('开始检查更新')
  try {
    updateInfo.value = await invoke<UpdateCheckInfo>('check_update')
    logInfo(`检查更新完成：最新 v${updateInfo.value.latestVersion}`)
  } catch (error) {
    updateState.value = { visible: true, checking: false, downloading: false, error: error instanceof Error ? error.message : String(error) }
    logError('检查更新失败', error)
    return
  }
  updateState.value = { visible: true, checking: false, downloading: false, error: '' }
}

function closeUpdateDialog(): void {
  if (!updateState.value.downloading) {
    updateState.value = { ...updateState.value, visible: false }
  }
}

async function startUpdate(): Promise<void> {
  const url = updateInfo.value?.downloadUrl
  if (!url || updateState.value.downloading) {
    return
  }

  updateState.value = { ...updateState.value, downloading: true }
  try {
    const installerPath = await invoke<string>('download_update', { url })
    await invoke('run_installer', { path: installerPath })
  } catch (error) {
    updateState.value = { ...updateState.value, downloading: false, error: error instanceof Error ? error.message : String(error) }
    logError('下载/启动更新失败', error)
  }
}

async function openReleasePage(): Promise<void> {
  const url = updateInfo.value?.releaseUrl || 'https://github.com/XingAur/stock-widget/releases/latest'
  try {
    await invoke('open_release_page', { url })
    closeUpdateDialog()
  } catch (error) {
    logError('打开下载页失败', error)
  }
}
let resumeTimer: ReturnType<typeof setTimeout> | null = null

function clearResumeTimer() {
  if (resumeTimer !== null) {
    clearTimeout(resumeTimer)
    resumeTimer = null
  }
}

async function resumeAfterHidden() {
  kickWebViewPaint()
  if (reloadIfAppShellMissing()) {
    return
  }

  stockStore.startAutoRefresh()
  await stockStore.refreshAll()
}

function scheduleResume() {
  clearResumeTimer()
  resumeTimer = setTimeout(() => {
    resumeTimer = null
    void resumeAfterHidden()
  }, 80)
}

function openSettings() {
  settingsTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
  showSettings.value = true
  void nextTick(() => focusFirstModalControl(settingsDialogRef.value))
}

function closeSettings() {
  showSettings.value = false
  void nextTick(() => {
    settingsTrigger?.focus()
    settingsTrigger = null
  })
}

function handleSettingsKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeSettings()
    return
  }
  trapModalFocus(event, settingsDialogRef.value)
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && showSettings.value) {
    event.preventDefault()
    closeSettings()
  }
}

function handleShellMouseDown(event: MouseEvent) {
  if (showSettings.value) {
    return
  }
  void startWindowDrag(event)
}

function showDetail(selection: DetailSelection) {
  void openDetail(selection)
}

function handleAssetTypeChange(assetType: AssetType) {
  if (selectedDetail.value && selectedDetail.value.assetType !== assetType) {
    void closeDetail()
  }
}

function toggleAssetType() {
  const nextAssetType = getNextAssetType(stockStore.activeAssetType)
  stockStore.setActiveAssetType(nextAssetType)
  handleAssetTypeChange(nextAssetType)
}

const quantExpandDirection = ref<'left' | 'right'>('right')

async function openQuantWide(): Promise<void> {
  const direction = await determineDetailPosition(QUANT_WIDE_SIZE.width)
  quantExpandDirection.value = direction
  await syncWindowSize(false, direction, true)
}

function toggleQuant() {
  const nextAssetType: AssetType = stockStore.activeAssetType === 'quant'
    ? lastWatchlistViewType()
    : 'quant'
  stockStore.setActiveAssetType(nextAssetType)
  if (nextAssetType !== 'quant') {
    handleAssetTypeChange(nextAssetType)
  }
}

async function determineDetailPosition(requiredLogicalWidth = DETAIL_WIDTH): Promise<'left' | 'right'> {
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
    const requiredWidth = new LogicalSize(requiredLogicalWidth, 0).toPhysical(scaleFactor).width

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

async function openDetail(selection: DetailSelection) {
  if (!selection.code) {
    return
  }

  if (
    selectedDetail.value?.assetType === selection.assetType
    && selectedDetail.value.code === selection.code
  ) {
    await closeDetail()
    return
  }

  if (hasDetail.value) {
    selectedDetail.value = selection
    return
  }

  const nextDetailPosition = await determineDetailPosition()
  detailPosition.value = nextDetailPosition
  selectedDetail.value = selection
  await syncWindowSize(true, nextDetailPosition)
}

async function closeDetail() {
  const closingPosition = detailPosition.value
  selectedDetail.value = null
  await syncWindowSize(false, closingPosition)
}

async function syncWindowSize(
  nextHasDetail = hasDetail.value,
  targetDetailPosition = detailPosition.value,
  wide = false
) {
  const targetWidth = wide ? QUANT_WIDE_SIZE.width : nextHasDetail ? EXPANDED_SIZE.width : COMPACT_SIZE.width
  windowResizeQueue = windowResizeQueue.then(async () => {
    try {
      const appWindow = getCurrentWindow()
      await appWindow.setMinSize(new LogicalSize(COMPACT_SIZE.width, COMPACT_SIZE.height))
      const scaleFactor = await appWindow.scaleFactor()
      const currentSize = await appWindow.innerSize()
      const currentLogicalSize = currentSize.toLogical(scaleFactor)
      const currentPosition = await appWindow.outerPosition()
      const targetPhysicalWidth = new LogicalSize(targetWidth, currentLogicalSize.height).toPhysical(scaleFactor).width
      const widthDelta = targetPhysicalWidth - currentSize.width
      const direction = widthDelta < 0
        ? activeExpansionDirection ?? targetDetailPosition
        : targetDetailPosition
      const targetX = anchoredWindowX(currentPosition.x, currentSize.width, targetPhysicalWidth, direction)
      // 收起时先缩小，避免把尚未收起的大窗暂时移出屏幕。
      if (widthDelta < 0) {
        await appWindow.setSize(new LogicalSize(targetWidth, currentLogicalSize.height))
      }
      if (targetX !== currentPosition.x) {
        await appWindow.setPosition(new PhysicalPosition(targetX, currentPosition.y))
      }
      if (widthDelta >= 0) {
        await appWindow.setSize(new LogicalSize(targetWidth, currentLogicalSize.height))
      }
      activeExpansionDirection = targetWidth > COMPACT_SIZE.width ? direction : null
    } catch (error) {
      console.error('Sync window size error:', error)
    }
  })
  await windowResizeQueue
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

watch(() => stockStore.activeAssetType, (nextAssetType) => {
  rememberWatchlistView(nextAssetType)
  if ((nextAssetType === 'market' || nextAssetType === 'quant') && selectedDetail.value) {
    void closeDetail()
  }
  if (nextAssetType === 'quant') {
    void openQuantWide()
  } else {
    void syncWindowSize(hasDetail.value, detailPosition.value)
  }
})

watch(() => [...stockStore.watchList], (watchList) => {
  if (selectedDetail.value?.assetType !== 'stock') {
    return
  }

  if (!watchList.includes(selectedCode.value)) {
    void closeDetail()
  }
})

watch(() => [...stockStore.fundWatchList], (fundWatchList) => {
  if (selectedDetail.value?.assetType !== 'fund') {
    return
  }

  if (!fundWatchList.includes(selectedCode.value)) {
    void closeDetail()
  }
})

onMounted(async () => {
  window.addEventListener('keydown', handleGlobalKeydown)
  await settingsStore.load()
  try {
    await invoke('set_always_on_top', { enabled: settingsStore.settings.alwaysOnTop })
  } catch (error) {
    console.error('Apply always on top setting error:', error)
  }
  await stockStore.init()

  stopVisibility = onPageVisibilityChange((visible) => {
    if (!visible) {
      clearResumeTimer()
      stockStore.stopAutoRefresh()
      return
    }

    scheduleResume()
  })

  if (isTauriRuntime()) {
    try {
      unlistenWindowRestored = await getCurrentWindow().listen('window-restored', () => {
        scheduleResume()
      })
    } catch (error) {
      console.error('Listen window-restored error:', error)
    }
    try {
      unlistenCheckUpdate = await getCurrentWindow().listen('tray-check-update', () => {
        void openUpdateDialog()
      })
    } catch (error) {
      logError('注册检查更新监听失败', error)
    }
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  stopVisibility?.()
  unlistenWindowRestored?.()
  unlistenCheckUpdate?.()
  clearResumeTimer()
  stockStore.stopAutoRefresh()
})
</script>

<style scoped>
.app-shell {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 整个窗口只有 #app 一层玻璃（.cl-window），内部区域不再叠加底色 */
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
}

.workspace.detail-right .sidebar {
  border-right: 1px solid var(--divider-color);
}

.workspace.detail-left .sidebar {
  border-left: 1px solid var(--divider-color);
}

.detail-panel {
  height: 100%;
  flex: 1 1 auto;
  min-width: 620px;
}

.update-status {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-sm);
  line-height: 1.5;
  color: var(--text-secondary);
}

.update-version {
  color: var(--accent-text);
}

.update-error {
  color: var(--c-err-text);
}

.update-notes {
  margin: 10px 0 0;
  max-height: 180px;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  font-size: var(--fs-xs);
  line-height: 1.6;
  color: var(--text-muted);
  white-space: pre-line;
  user-select: text;
}

.update-download {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
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
  }

  .workspace.detail-left .sidebar,
  .workspace.detail-right .sidebar {
    border: none;
  }

  /* 窄窗口里详情盖在列表上，需要一层底色遮住下面的卡片 */
  .detail-panel {
    position: absolute;
    inset: 0;
    min-width: 0;
    background: var(--solid-bg);
  }
}
</style>
