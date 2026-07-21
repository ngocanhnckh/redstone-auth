import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { CHANNELS, type CommandName, type Result } from '../core/ipc'
import { codeFor, groupDigits, millisRemaining } from '../core/totp'
import { AppError, type CodeTick } from '../core/types'
import { VaultStore } from './store'

const VAULT_FILENAME = 'vault.enc'

let mainWindow: BrowserWindow | null = null
let store: VaultStore
let tickTimer: NodeJS.Timeout | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 900,
    minHeight: 620,
    show: false,
    // Warm near-black matches --app-bg, so there is no white flash on launch.
    backgroundColor: '#15110D',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 22 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // Any attempt to navigate away or open a window is a bug or an attack.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * Codes are generated in main and pushed down every second. Secrets stay here;
 * the renderer only ever sees six digits and a countdown.
 */
function startTicking(): void {
  if (tickTimer) return
  const broadcast = (): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (!store.isUnlocked) return

    const now = Date.now()
    const ticks: CodeTick[] = store.all().map((account) => {
      const remainingMs = millisRemaining(account, now)
      const periodMs = account.period * 1000
      return {
        id: account.id,
        code: groupDigits(codeFor(account, now)),
        secondsRemaining:
          account.type === 'hotp' ? Number.POSITIVE_INFINITY : Math.ceil(remainingMs / 1000),
        progress: account.type === 'hotp' ? 0 : 1 - remainingMs / periodMs
      }
    })
    mainWindow.webContents.send(CHANNELS.tick, ticks)
  }

  broadcast()
  // 250ms keeps the countdown ring smooth without the renderer holding secrets.
  tickTimer = setInterval(broadcast, 250)
}

function stopTicking(): void {
  if (tickTimer) clearInterval(tickTimer)
  tickTimer = null
}

const handlers: { [K in CommandName]: (...args: never[]) => unknown } = {
  status: () => store.status(),

  create: (password: string) => {
    store.create(password)
    startTicking()
    return store.status()
  },

  unlock: (password: string) => {
    store.unlock(password)
    startTicking()
    return store.status()
  },

  lock: () => {
    stopTicking()
    store.lock()
    mainWindow?.webContents.send(CHANNELS.locked)
    return store.status()
  },

  changePassword: (current: string, next: string) => {
    store.changePassword(current, next)
    return store.status()
  },

  listAccounts: () => store.list(),
  importMigration: (uri: string) => store.importMigrationUri(uri),
  addAccount: (input: string, name?: string, issuer?: string) =>
    store.addManual(input, name, issuer),
  renameAccount: (id: string, name: string, issuer: string) => store.rename(id, name, issuer),
  deleteAccount: (id: string) => {
    store.remove(id)
    return null
  },
  bumpCounter: (id: string) => store.bumpCounter(id),

  exportBackup: async () => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
      title: 'Export encrypted backup',
      defaultPath: `redstone-backup-${new Date().toISOString().slice(0, 10)}.vault`,
      filters: [{ name: 'Redstone vault', extensions: ['vault'] }]
    })
    if (canceled || !filePath) return null
    store.exportBackup(filePath)
    return filePath
  },

  importBackup: async (password: string) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, {
      title: 'Restore from encrypted backup',
      properties: ['openFile'],
      filters: [{ name: 'Redstone vault', extensions: ['vault', 'enc', 'json'] }]
    })
    if (canceled || filePaths.length === 0) return null
    return store.importBackup(filePaths[0], password)
  },

  revealVaultLocation: () => {
    const path = join(app.getPath('userData'), VAULT_FILENAME)
    shell.showItemInFolder(path)
    return path
  }
}

function registerIpc(): void {
  ipcMain.handle(
    CHANNELS.invoke,
    async (_event, command: CommandName, args: unknown[]): Promise<Result<unknown>> => {
      const handler = handlers[command]
      if (!handler) {
        return { ok: false, code: 'NOT_FOUND', message: `Unknown command: ${command}` }
      }
      try {
        return { ok: true, value: await handler(...(args as never[])) }
      } catch (error) {
        if (error instanceof AppError) {
          return { ok: false, code: error.code, message: error.message }
        }
        return { ok: false, code: 'IO_ERROR', message: (error as Error).message }
      }
    }
  )
}

app.whenReady().then(() => {
  store = new VaultStore(join(app.getPath('userData'), VAULT_FILENAME))
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Locking on quit is the whole security model: secrets never outlive the process.
app.on('before-quit', () => {
  stopTicking()
  store?.lock()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
