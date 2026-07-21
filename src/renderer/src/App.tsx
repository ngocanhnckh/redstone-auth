import type { AccountView } from '@core/types'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Atmosphere } from './components/Atmosphere'
import { ImportPanel } from './components/ImportPanel'
import { Modal } from './components/Modal'
import { SettingsPanel } from './components/SettingsPanel'
import { Toasts, type ToastMessage } from './components/Toast'
import { VaultScreen } from './components/VaultScreen'
import { LockScreen } from './components/LockScreen'
import { api, errorMessage } from './lib/api'
import { ease } from './lib/motion'
import { useVault } from './lib/useVault'
import { decodeImage } from './lib/qr'

type Theme = 'dark' | 'light'

export function App(): React.JSX.Element {
  const { ready, status, accounts, ticks, refresh } = useVault()
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('redstone:theme') as Theme) ?? 'dark'
  )

  const [importOpen, setImportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [renaming, setRenaming] = useState<AccountView | null>(null)
  const [deleting, setDeleting] = useState<AccountView | null>(null)
  const [dragging, setDragging] = useState(false)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const toastId = useRef(0)

  const unlocked = status?.unlocked === true

  const notify = useCallback((text: string, tone: ToastMessage['tone'] = 'neutral') => {
    const id = ++toastId.current
    setToasts((current) => [...current, { id, text, tone }])
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 3200)
  }, [])

  useEffect(() => {
    localStorage.setItem('redstone:theme', theme)
  }, [theme])

  // Drag a QR screenshot anywhere onto the window and it imports.
  useEffect(() => {
    if (!unlocked) return

    const onDragOver = (event: DragEvent): void => {
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
      setDragging(true)
    }
    const onDragLeave = (event: DragEvent): void => {
      if (event.relatedTarget === null) setDragging(false)
    }
    const onDrop = async (event: DragEvent): Promise<void> => {
      event.preventDefault()
      setDragging(false)
      const file = Array.from(event.dataTransfer?.files ?? []).find((candidate) =>
        candidate.type.startsWith('image/')
      )
      if (!file) return
      try {
        const text = await decodeImage(file)
        const result = await api.importMigration(text)
        await refresh()
        notify(
          result.imported > 0
            ? `Imported ${result.imported} account${result.imported === 1 ? '' : 's'}.`
            : 'Those accounts were already in your vault.'
        )
      } catch (failure) {
        notify(errorMessage(failure), 'alert')
      }
    }

    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [unlocked, refresh, notify])

  const copyCode = useCallback(
    (code: string, account: AccountView) => {
      void navigator.clipboard.writeText(code)
      notify(`${account.issuer || account.name} copied`)
      if (account.type === 'hotp') void api.bumpCounter(account.id)
    },
    [notify]
  )

  return (
    <div data-app data-theme={theme} className="grain relative h-full" style={{ background: 'var(--app-bg)' }}>
      <Atmosphere intense={dragging || !unlocked} />

      <div className="titlebar-drag relative z-20 h-11" />

      <div className="relative h-[calc(100%-2.75rem)]">
        <AnimatePresence mode="wait">
          {!ready ? (
            <motion.div key="boot" className="h-full" />
          ) : unlocked ? (
            <motion.div
              key="vault"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.55, ease }}
              className="h-full"
            >
              <VaultScreen
                accounts={accounts}
                ticks={ticks}
                onImport={() => setImportOpen(true)}
                onSettings={() => setSettingsOpen(true)}
                onLock={() => void api.lock().then(refresh)}
                onCopy={copyCode}
                onRename={setRenaming}
                onDelete={setDeleting}
              />
            </motion.div>
          ) : (
            <motion.div
              key="lock"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.5, ease }}
              className="h-full"
            >
              <LockScreen isFirstRun={status?.exists === false} onUnlocked={refresh} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease }}
            className="drop-veil flex items-center justify-center"
          >
            <p className="display text-[clamp(2rem,5vw,3.6rem)]" style={{ color: 'var(--color-bone)' }}>
              Drop to import
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <ImportPanel
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(summary) => {
          void refresh()
          notify(summary)
        }}
      />

      <SettingsPanel
        open={settingsOpen}
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
        onClose={() => setSettingsOpen(false)}
        onNotify={notify}
        onVaultChanged={refresh}
      />

      <RenameDialog
        account={renaming}
        onClose={() => setRenaming(null)}
        onSaved={(message) => {
          void refresh()
          notify(message)
        }}
        onError={(message) => notify(message, 'alert')}
      />

      <DeleteDialog
        account={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={(message) => {
          void refresh()
          notify(message)
        }}
        onError={(message) => notify(message, 'alert')}
      />

      <Toasts messages={toasts} />
    </div>
  )
}

function RenameDialog({
  account,
  onClose,
  onSaved,
  onError
}: {
  account: AccountView | null
  onClose: () => void
  onSaved: (message: string) => void
  onError: (message: string) => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [issuer, setIssuer] = useState('')

  useEffect(() => {
    setName(account?.name ?? '')
    setIssuer(account?.issuer ?? '')
  }, [account])

  const save = async (): Promise<void> => {
    if (!account) return
    try {
      await api.renameAccount(account.id, name, issuer)
      onSaved('Account renamed.')
      onClose()
    } catch (failure) {
      onError(errorMessage(failure))
    }
  }

  return (
    <Modal open={account !== null} onClose={onClose} kicker="Edit" title="Rename account" width={480}>
      <label className="index-numeral mb-2 block" htmlFor="rename-issuer">
        PROVIDER
      </label>
      <input
        id="rename-issuer"
        className="field mb-4"
        value={issuer}
        onChange={(event) => setIssuer(event.target.value)}
        placeholder="GitHub"
      />
      <label className="index-numeral mb-2 block" htmlFor="rename-name">
        ACCOUNT
      </label>
      <input
        id="rename-name"
        className="field"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="octocat"
      />
      <p className="mt-4 text-[0.78rem]" style={{ color: 'var(--app-text-faint)' }}>
        The secret itself is never editable — delete and re-import to replace it.
      </p>
      <button
        type="button"
        onClick={() => void save()}
        className="glass-btn glass-btn--clay mt-5 w-full px-6 py-3 text-[0.74rem] tracking-[0.2em] uppercase"
      >
        Save
      </button>
    </Modal>
  )
}

function DeleteDialog({
  account,
  onClose,
  onDeleted,
  onError
}: {
  account: AccountView | null
  onClose: () => void
  onDeleted: (message: string) => void
  onError: (message: string) => void
}): React.JSX.Element {
  const remove = async (): Promise<void> => {
    if (!account) return
    try {
      await api.deleteAccount(account.id)
      onDeleted(`Removed ${account.issuer || account.name}.`)
      onClose()
    } catch (failure) {
      onError(errorMessage(failure))
    }
  }

  return (
    <Modal open={account !== null} onClose={onClose} kicker="Careful" title="Delete this account?" width={460}>
      <p className="mb-6 text-[0.9rem] leading-relaxed" style={{ color: 'var(--app-text-soft)' }}>
        <strong style={{ color: 'var(--app-text)' }}>
          {account?.issuer ? `${account.issuer} — ${account.name}` : account?.name}
        </strong>{' '}
        will be erased from this vault. If you have no other copy of this secret, you will lose
        access to that account.
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="glass-btn flex-1 px-5 py-3 text-[0.74rem] tracking-[0.18em] uppercase">
          Keep it
        </button>
        <button
          type="button"
          onClick={() => void remove()}
          className="glass-btn glass-btn--clay flex-1 px-5 py-3 text-[0.74rem] tracking-[0.18em] uppercase"
        >
          Delete
        </button>
      </div>
    </Modal>
  )
}
