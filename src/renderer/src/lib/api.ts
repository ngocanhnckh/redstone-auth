import type { RedstoneApi } from '@core/ipc'
import { isIpcFailure } from '@core/ipc'

declare global {
  interface Window {
    redstone: RedstoneApi
  }
}

export const api: RedstoneApi = window.redstone

/** Turns any thrown value into something worth showing a person. */
export function errorMessage(error: unknown): string {
  if (isIpcFailure(error)) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong.'
}

export function errorCode(error: unknown): string | null {
  return isIpcFailure(error) ? error.code : null
}
