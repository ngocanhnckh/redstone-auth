import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, type CommandName, type RedstoneApi, type Result } from '../core/ipc'
import type { CodeTick } from '../core/types'

/** Sends a command and unwraps the Result envelope into a value or a throw. */
async function invoke<T>(command: CommandName, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(CHANNELS.invoke, command, args)) as Result<T>
  if (result.ok) return result.value
  throw { code: result.code, message: result.message }
}

function subscribe(channel: string, listener: (...args: never[]) => void): () => void {
  const wrapped = (_event: unknown, ...args: unknown[]): void => listener(...(args as never[]))
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

const api: RedstoneApi = {
  status: () => invoke('status'),
  create: (password) => invoke('create', password),
  unlock: (password) => invoke('unlock', password),
  lock: () => invoke('lock'),
  changePassword: (current, next) => invoke('changePassword', current, next),
  listAccounts: () => invoke('listAccounts'),
  importMigration: (uri) => invoke('importMigration', uri),
  addAccount: (input, name, issuer) => invoke('addAccount', input, name, issuer),
  renameAccount: (id, name, issuer) => invoke('renameAccount', id, name, issuer),
  deleteAccount: (id) => invoke('deleteAccount', id),
  bumpCounter: (id) => invoke('bumpCounter', id),
  exportBackup: () => invoke('exportBackup'),
  importBackup: (password) => invoke('importBackup', password),
  revealVaultLocation: () => invoke('revealVaultLocation'),
  onTick: (listener) => subscribe(CHANNELS.tick, listener as (...args: never[]) => void),
  onLocked: (listener) => subscribe(CHANNELS.locked, listener as (...args: never[]) => void)
}

contextBridge.exposeInMainWorld('redstone', api)

export type { CodeTick }
