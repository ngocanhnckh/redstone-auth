import { motion } from 'motion/react'
import { useState, type FormEvent } from 'react'
import { api, errorMessage } from '../lib/api'
import { ease, riseVariants } from '../lib/motion'

interface Props {
  /** No vault on disk yet — collect a new master password instead of unlocking. */
  isFirstRun: boolean
  onUnlocked: () => void
}

/**
 * The front door. Type is the design here: one oversized display headline
 * bleeding off the left edge, a mono kicker, and a single field.
 */
export function LockScreen({ isFirstRun, onUnlocked }: Props): React.JSX.Element {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setError(null)

    if (isFirstRun && password !== confirmation) {
      setError('Those passwords do not match.')
      return
    }

    setBusy(true)
    try {
      if (isFirstRun) await api.create(password)
      else await api.unlock(password)
      setPassword('')
      setConfirmation('')
      onUnlocked()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative z-10 flex h-full items-center">
      <div className="w-full max-w-[1100px] px-[7vw]">
        <motion.p custom={0} variants={riseVariants} initial="hidden" animate="show" className="kicker mb-7">
          {isFirstRun ? 'First run — set a master password' : 'Locked'}
        </motion.p>

        <h1 className="display mb-10 text-[clamp(3.4rem,9.5vw,8.2rem)]">
          <span className="wipe-mask">
            <motion.span custom={1} variants={riseVariants} initial="hidden" animate="show" className="block">
              Redstone
            </motion.span>
          </span>
          <span className="wipe-mask">
            <motion.span
              custom={2}
              variants={riseVariants}
              initial="hidden"
              animate="show"
              className="display-italic block"
              style={{ color: 'var(--color-clay-2)' }}
            >
              authenticator
            </motion.span>
          </span>
        </h1>

        <motion.form
          custom={3}
          variants={riseVariants}
          initial="hidden"
          animate="show"
          onSubmit={submit}
          className="max-w-[520px]"
        >
          <div className="glass-surface rounded-[22px] border border-[var(--app-border)] p-5">
            <label className="index-numeral mb-2 block" htmlFor="master">
              MASTER PASSWORD
            </label>
            <input
              id="master"
              type="password"
              autoFocus
              className="field field--mono"
              placeholder="••••••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />

            {isFirstRun && (
              <>
                <label className="index-numeral mt-4 mb-2 block" htmlFor="confirm">
                  CONFIRM
                </label>
                <input
                  id="confirm"
                  type="password"
                  className="field field--mono"
                  placeholder="••••••••••••"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </>
            )}

            <button
              type="submit"
              disabled={busy || password.length === 0}
              className="glass-btn glass-btn--clay mt-5 w-full px-6 py-3.5 text-[0.82rem] font-medium tracking-[0.2em] uppercase"
            >
              {busy ? 'Working…' : isFirstRun ? 'Create vault' : 'Unlock'}
            </button>
          </div>

          <div className="mt-4 min-h-[1.4rem]">
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease }}
                className="mono text-[0.78rem]"
                style={{ color: 'var(--color-clay-2)' }}
              >
                {error}
              </motion.p>
            )}
          </div>

          <p className="mt-6 max-w-[440px] text-[0.82rem] leading-relaxed" style={{ color: 'var(--app-text-faint)' }}>
            {isFirstRun
              ? 'This password encrypts your vault with AES-256-GCM. It is never stored anywhere — if you lose it, the vault cannot be recovered.'
              : 'Your codes are generated locally. Nothing is ever sent anywhere.'}
          </p>
        </motion.form>
      </div>
    </div>
  )
}
