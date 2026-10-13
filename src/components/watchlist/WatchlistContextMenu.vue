<template>
  <div
    v-if="visible"
    ref="menuEl"
    class="cl-menu context-menu"
    role="menu"
    :style="{ left: position.left + 'px', top: position.top + 'px' }"
    @click.stop
  >
    <button
      v-for="action in actions"
      :key="action.key"
      class="cl-menu__item context-menu-item"
      type="button"
      role="menuitem"
      :disabled="action.disabled"
      @click="$emit('action', action.key)"
    >
      {{ action.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  x: number
  y: number
  actions: { key: string; label: string; disabled?: boolean }[]
}>()

defineEmits<{
  action: [key: string]
}>()

/** 菜单与窗口边缘的最小间距 */
const EDGE_GAP = 8
const menuEl = ref<HTMLElement | null>(null)
const position = ref({ left: props.x, top: props.y })

// 菜单尺寸由样式决定（coolove-ui 的 .cl-menu），渲染后按实际宽高收进窗口，避免样式调整后定位失效
watch(() => [props.visible, props.x, props.y, props.actions.length] as const, async ([visible]) => {
  position.value = { left: props.x, top: props.y }
  if (!visible) return
  await nextTick()
  const rect = menuEl.value?.getBoundingClientRect()
  if (!rect) return
  position.value = {
    left: Math.max(EDGE_GAP, Math.min(props.x, window.innerWidth - rect.width - EDGE_GAP)),
    top: Math.max(EDGE_GAP, Math.min(props.y, window.innerHeight - rect.height - EDGE_GAP))
  }
}, { immediate: true })
</script>
