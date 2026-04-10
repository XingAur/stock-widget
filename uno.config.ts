import { defineConfig, presetUno, presetAttributify, presetIcons } from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons()
  ],
  theme: {
    colors: {
      primary: '#007aff',
      success: '#34c759',
      danger: '#ff3b30',
      warning: '#ff9500',
      dark: {
        bg: 'rgba(30, 30, 30, 0.85)',
        card: 'rgba(45, 45, 45, 0.9)',
        border: 'rgba(255, 255, 255, 0.1)'
      },
      light: {
        bg: 'rgba(255, 255, 255, 0.85)',
        card: 'rgba(245, 245, 245, 0.9)',
        border: 'rgba(0, 0, 0, 0.1)'
      }
    }
  }
})