import type { AccountView, CodeTick } from '@core/types'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { listItem } from '../lib/motion'
import { CodeDisplay, CodePlaceholder } from './CodeDisplay'

interface Props {
  account: AccountView
  tick: CodeTick | undefined
  row: number
  size: 'lead' | 'compact'
  index: number
  onCopy: (code: string, account: AccountView) => void
  onRename: (account: AccountView) => void
  onDelete: (account: AccountView) => void
}

const EXPIRING_AT_SECONDS = 5

export function AccountTile({
  account,
  tick,
  row,
  size,
  index,
  onCopy,
  onRename,
  onDelete
}: Props): React.JSX.Element {
  const [flashKey, setFlashKey] = useState(0)
  const [showFlash, setShowFlash] = useState(false)

  const expiring = tick !== undefined && tick.secondsRemaining <= EXPIRING_AT_SECONDS
  const isLead = size === 'lead'

  useEffect(() => {
    if (!showFlash) return
    const timer = setTimeout(() => setShowFlash(false), 800)
    return () => clearTimeout(timer)
  }, [showFlash, flashKey])

  const copy = (): void => {
    if (!tick) return
    onCopy(tick.code.replace(/\s/g, ''), account)
    setFlashKey((key) => key + 1)
    setShowFlash(true)
  }

  return (
    <motion.article
      variants={listItem}
      layout
      onClick={copy}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          copy()
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Copy code for ${account.issuer || account.name}`}
      className={`glass-inset glass-inset-hover group relative overflow-hidden rounded-[20px] border border-[var(--app-border)] outline-none focus-visible:border-[rgb(var(--primary-soft))] ${
        isLead ? 'p-7' : 'p-5'
      }`}
    >
      {/* the drain: recedes as the period runs out, behind everything else */}
      {tick && account.type === 'totp' && (
        <>
          <div
            className={`drain ${expiring ? 'drain--expiring' : ''}`}
            style={{
              transform: `scaleX(${Math.max(0, 1 - tick.progress)})`,
              opacity: isLead ? 0.55 : 0.4
            }}
          />
          <div
            className={`drain-bar ${expiring ? 'drain-bar--expiring' : ''}`}
            style={{ transform: `scaleX(${Math.max(0, 1 - tick.progress)})` }}
          />
        </>
      )}

      {showFlash && <span key={flashKey} className="copy-flash" />}

      <div className="relative">
        <div className="mb-3 flex items-baseline gap-3">
          <span className="index-numeral">{String(index + 1).padStart(2, '0')}</span>
          <span
            className={`truncate font-medium ${isLead ? 'text-[1.05rem]' : 'text-[0.9rem]'}`}
            style={{ color: 'var(--app-text)' }}
          >
            {account.issuer || account.name}
          </span>
        </div>

        {tick ? (
          <CodeDisplay code={tick.code} row={row} expiring={expiring} size={size} />
        ) : (
          <CodePlaceholder size={size} />
        )}

        <div className="mt-3 flex items-center justify-between gap-4">
          <span
            className="truncate text-[0.78rem]"
            style={{ color: 'var(--app-text-soft)' }}
          >
            {account.issuer ? account.name : account.type.toUpperCase()}
          </span>

          {tick && account.type === 'totp' && (
            <span
              className="mono shrink-0 text-[0.72rem] tabular-nums"
              style={{ color: expiring ? 'var(--color-amber)' : 'var(--app-text-faint)' }}
            >
              {tick.secondsRemaining}s
            </span>
          )}
        </div>

        {/* Actions stay hidden until hover so the wall of codes reads clean. */}
        <div className="pointer-events-none absolute -top-1 -right-1 flex gap-1 opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
          <TileAction label="Rename" onClick={() => onRename(account)}>
            ✎
          </TileAction>
          <TileAction label="Delete" onClick={() => onDelete(account)}>
            ✕
          </TileAction>
        </div>
      </div>
    </motion.article>
  )
}

function TileAction({
  label,
  onClick,
  children
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className="glass-btn h-7 w-7 text-[0.7rem] leading-none"
      style={{ color: 'var(--app-text-soft)' }}
    >
      {children}
    </button>
  )
}
