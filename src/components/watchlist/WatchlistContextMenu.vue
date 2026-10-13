<template>
  <div
    v-if="visible"
    class="context-menu"
    :style="{ left: x + 'px', top: y + 'px' }"
    @click.stop
  >
    <button
      v-for="action in actions"
      :key="action.key"
      class="context-menu-item"
      type="button"
      :disabled="action.disabled"
      @click="$emit('action', action.key)"
    >
      {{ action.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  visible: boolean
  x: number
  y: number
  actions: { key: string; label: string; disabled?: boolean }[]
}>()

defineEmits<{
  action: [key: string]
}>()
</script>

<style scoped>
.context-menu{position:fixed;z-index:40;width:132px;padding:6px;border:1px solid var(--border-color);border-radius:12px;background:var(--solid-bg);box-shadow:0 18px 48px rgba(0,0,0,.34);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
.context-menu-item{width:100%;display:flex;align-items:center;height:34px;padding:0 10px;border:none;border-radius:8px;background:transparent;color:var(--text-primary);font-size:13px;text-align:left;cursor:pointer}
.context-menu-item:hover:not(:disabled){background:rgba(255,255,255,.06)}
.context-menu-item:disabled{color:var(--text-muted);cursor:not-allowed}
</style>
