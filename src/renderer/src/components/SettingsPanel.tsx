import { useState } from 'react'
import { api, errorMessage } from '../lib/api'
import { Modal } from './Modal'

interface Props {
  open: boolean
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  onClose: () => void
  onNotify: (message: string, tone?: 'neutral' | 'alert') => void
  onVaultChanged: () => void
}

export function SettingsPanel({
  open,
  theme,
  onToggleTheme,
  onClose,
  onNotify,
  onVaultChanged
}: Props): React.JSX.Element {
  const [currentPassword, setCurrentPassword] = useState('')
  const [nextPassword, setNextPassword] = useState('')
  const [restorePassword, setRestorePassword] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await action()
    } catch (failure) {
      onNotify(errorMessage(failure), 'alert')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} kicker="Settings" title="Vault & appearance" width={600}>
      <Section numeral="01" title="Appearance">
        <div className="flex items-center justify-between">
          <p className="text-[0.88rem]" style={{ color: 'var(--app-text-soft)' }}>
            Currently {theme === 'dark' ? 'dark' : 'light'}. Glass is tuned for both.
          </p>
          <button type="button" onClick={onToggleTheme} className="glass-btn px-5 py-2.5 text-[0.72rem] tracking-[0.16em] uppercase">
            Switch to {theme === 'dark' ? 'light' : 'dark'}
          </button>
        </div>
      </Section>

      <Section numeral="02" title="Encrypted backup">
        <p className="mb-4 text-[0.85rem] leading-relaxed" style={{ color: 'var(--app-text-soft)' }}>
          The backup uses the same AES-256-GCM format as your vault and is unreadable without your
          master password.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const path = await api.exportBackup()
                if (path) onNotify(`Backup written to ${path}`)
              })
            }
            className="glass-btn px-5 py-2.5 text-[0.72rem] tracking-[0.16em] uppercase"
          >
            Export backup
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const path = await api.revealVaultLocation()
                onNotify(`Vault lives at ${path}`)
              })
            }
            className="glass-btn px-5 py-2.5 text-[0.72rem] tracking-[0.16em] uppercase"
          >
            Reveal vault file
          </button>
        </div>

        <label className="index-numeral mt-5 mb-2 block" htmlFor="restore-password">
          RESTORE — PASSWORD OF THE BACKUP FILE
        </label>
        <div className="flex gap-2">
          <input
            id="restore-password"
            type="password"
            className="field field--mono py-2.5"
            placeholder="••••••••"
            value={restorePassword}
            onChange={(event) => setRestorePassword(event.target.value)}
          />
          <button
            type="button"
            disabled={busy || restorePassword.length === 0}
            onClick={() =>
              run(async () => {
                const result = await api.importBackup(restorePassword)
                setRestorePassword('')
                if (result) {
                  onNotify(`Restored ${result.imported} of ${result.total} accounts.`)
                  onVaultChanged()
                }
              })
            }
            className="glass-btn shrink-0 px-5 text-[0.72rem] tracking-[0.16em] uppercase"
          >
            Choose file
          </button>
        </div>
      </Section>

      <Section numeral="03" title="Master password">
        <div className="flex flex-col gap-2">
          <input
            type="password"
            className="field field--mono py-2.5"
            placeholder="Current password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
          <input
            type="password"
            className="field field--mono py-2.5"
            placeholder="New password (8+ characters)"
            value={nextPassword}
            onChange={(event) => setNextPassword(event.target.value)}
          />
          <button
            type="button"
            disabled={busy || currentPassword.length === 0 || nextPassword.length === 0}
            onClick={() =>
              run(async () => {
                await api.changePassword(currentPassword, nextPassword)
                setCurrentPassword('')
                setNextPassword('')
                onNotify('Master password changed. The vault was re-encrypted.')
              })
            }
            className="glass-btn glass-btn--clay mt-1 px-5 py-2.5 text-[0.72rem] tracking-[0.16em] uppercase"
          >
            Change password
          </button>
        </div>
      </Section>
    </Modal>
  )
}

function Section({
  numeral,
  title,
  children
}: {
  numeral: string
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="mb-8 border-t pt-5 first:border-t-0 first:pt-0" style={{ borderColor: 'var(--app-border)' }}>
      <div className="mb-3 flex items-baseline gap-3">
        <span className="index-numeral">{numeral}</span>
        <h3 className="text-[0.95rem] font-medium" style={{ color: 'var(--app-text)' }}>
          {title}
        </h3>
      </div>
      {children}
    </section>
  )
}
