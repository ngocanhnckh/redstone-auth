/** The contract between main and renderer. Types only — imported by both sides. */

import type {
  AccountView,
  AppErrorCode,
  CodeTick,
  ImportResult,
  VaultStatus
} from './types'

export const CHANNELS = {
  invoke: 'redstone:invoke',
  tick: 'redstone:tick',
  locked: 'redstone:locked'
} as const

/**
 * Every handler returns this envelope. Electron mangles thrown errors into
 * "Error invoking remote method …", which loses the error code the UI needs,
 * so failures travel as data instead.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; code: AppErrorCode; message: string }

export interface Commands {
  status: { args: []; result: VaultStatus }
  create: { args: [password: string]; result: VaultStatus }
  unlock: { args: [password: string]; result: VaultStatus }
  lock: { args: []; result: VaultStatus }
  changePassword: { args: [current: string, next: string]; result: VaultStatus }
  listAccounts: { args: []; result: AccountView[] }
  importMigration: { args: [uri: string]; result: ImportResult }
  addAccount: { args: [input: string, name?: string, issuer?: string]; result: AccountView }
  renameAccount: { args: [id: string, name: string, issuer: string]; result: AccountView }
  deleteAccount: { args: [id: string]; result: null }
  bumpCounter: { args: [id: string]; result: number }
  exportBackup: { args: []; result: string | null }
  importBackup: { args: [password: string]; result: ImportResult | null }
  revealVaultLocation: { args: []; result: string }
}

export type CommandName = keyof Commands

/** The surface exposed on `window.redstone` by the preload script. */
export interface RedstoneApi {
  status(): Promise<VaultStatus>
  create(password: string): Promise<VaultStatus>
  unlock(password: string): Promise<VaultStatus>
  lock(): Promise<VaultStatus>
  changePassword(current: string, next: string): Promise<VaultStatus>
  listAccounts(): Promise<AccountView[]>
  importMigration(uri: string): Promise<ImportResult>
  addAccount(input: string, name?: string, issuer?: string): Promise<AccountView>
  renameAccount(id: string, name: string, issuer: string): Promise<AccountView>
  deleteAccount(id: string): Promise<null>
  bumpCounter(id: string): Promise<number>
  exportBackup(): Promise<string | null>
  importBackup(password: string): Promise<ImportResult | null>
  revealVaultLocation(): Promise<string>
  /** Subscribes to the once-per-second code broadcast. Returns an unsubscribe function. */
  onTick(listener: (ticks: CodeTick[]) => void): () => void
  /** Fires when the vault locks for any reason. */
  onLocked(listener: () => void): () => void
}

/** What a rejected command throws in the renderer. */
export interface IpcFailure {
  code: AppErrorCode
  message: string
}

export function isIpcFailure(error: unknown): error is IpcFailure {
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error
}
