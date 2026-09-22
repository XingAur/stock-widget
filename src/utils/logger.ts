import { invoke } from '@tauri-apps/api/core'
import { isTauriRuntime } from './persistence'

type LogLevel = 'INFO' | 'WARN' | 'ERROR'

function write(level: LogLevel, message: string): void {
  if (!isTauriRuntime()) {
    return
  }

  void invoke('append_log', { level, message }).catch(() => {
    // 日志失败不影响主流程
  })
}

export function logInfo(message: string): void {
  write('INFO', message)
}

export function logWarn(message: string): void {
  write('WARN', message)
}

export function logError(message: string, error?: unknown): void {
  const detail = error instanceof Error
    ? `${message}：${error.message}`
    : error
      ? `${message}：${String(error)}`
      : message
  write('ERROR', detail)
}
