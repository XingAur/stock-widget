<template>
  <div
    v-if="visible"
    class="cl-menu context-menu"
    role="menu"
    :style="{ left: x + 'px', top: y + 'px' }"
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
