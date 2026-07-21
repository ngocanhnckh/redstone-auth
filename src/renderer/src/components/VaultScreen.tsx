import type { AccountView, CodeTick } from '@core/types'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { ease, listContainer } from '../lib/motion'
import { AccountTile } from './AccountTile'

interface Props {
  accounts: AccountView[]
  ticks: Record<string, CodeTick>
  onImport: () => void
  onSettings: () => void
  onLock: () => void
  onCopy: (code: string, account: AccountView) => void
  onRename: (account: AccountView) => void
  onDelete: (account: AccountView) => void
}

/**
 * Asymmetric two-column composition: a narrow index rail against a bento of
 * code tiles. The first match is the lead — oversized numerals, generous
 * space — and the rest fall into a varied grid rather than uniform cards.
 */
export function VaultScreen({
  accounts,
  ticks,
  onImport,
  onSettings,
  onLock,
  onCopy,
  onRename,
  onDelete
}: Props): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [issuerFilter, setIssuerFilter] = useState<string | null>(null)

  const issuers = useMemo(() => {
    const counts = new Map<string, number>()
    for (const account of accounts) {
      const key = account.issuer || account.name
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [accounts])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return accounts.filter((account) => {
      const label = `${account.issuer} ${account.name}`.toLowerCase()
      if (issuerFilter && (account.issuer || account.name) !== issuerFilter) return false
      return needle === '' || label.includes(needle)
    })
  }, [accounts, query, issuerFilter])

  const [lead, ...rest] = filtered
  const layout = useMemo(() => planLayout(rest.length), [rest.length])

  return (
    <div className="relative z-10 flex h-full gap-6 px-6 pt-3 pb-6">
      {/* ── index rail ─────────────────────────────────────────────── */}
      <aside className="glass-surface flex w-[268px] shrink-0 flex-col rounded-[24px] border border-[var(--app-border)] p-5">
        <div className="mb-6">
          <p className="kicker mb-1.5">Vault</p>
          <p className="display text-[1.9rem]" style={{ color: 'var(--app-text)' }}>
            {accounts.length}{' '}
            <span className="display-italic text-[1.1rem]" style={{ color: 'var(--app-text-soft)' }}>
              {accounts.length === 1 ? 'account' : 'accounts'}
            </span>
          </p>
        </div>

        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          className="field mb-5 py-2.5 text-[0.85rem]"
          aria-label="Search accounts"
        />

        <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
          <p className="index-numeral mb-3">INDEX</p>
          <ul>
            <IndexRow
              numeral="00"
              label="All accounts"
              count={accounts.length}
              active={issuerFilter === null}
              onClick={() => setIssuerFilter(null)}
            />
            {issuers.map(([issuer, count], index) => (
              <IndexRow
                key={issuer}
                numeral={String(index + 1).padStart(2, '0')}
                label={issuer}
                count={count}
                active={issuerFilter === issuer}
                onClick={() => setIssuerFilter(issuerFilter === issuer ? null : issuer)}
              />
            ))}
          </ul>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onImport}
            className="glass-btn glass-btn--clay px-5 py-3 text-[0.74rem] tracking-[0.2em] uppercase"
          >
            Import
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onSettings}
              className="glass-btn flex-1 px-4 py-2.5 text-[0.72rem] tracking-[0.16em] uppercase"
            >
              Settings
            </button>
            <button
              type="button"
              onClick={onLock}
              className="glass-btn flex-1 px-4 py-2.5 text-[0.72rem] tracking-[0.16em] uppercase"
            >
              Lock
            </button>
          </div>
        </div>
      </aside>

      {/* ── the wall of codes ──────────────────────────────────────── */}
      <main className="min-w-0 flex-1 overflow-y-auto no-scrollbar">
        {accounts.length === 0 ? (
          <EmptyState onImport={onImport} />
        ) : filtered.length === 0 ? (
          <NoMatches query={query} />
        ) : (
          <motion.div
            variants={listContainer}
            initial="hidden"
            animate="show"
            className="grid grid-cols-3 gap-4 pb-4"
          >
            <AnimatePresence mode="popLayout">
              {lead && (
                <div key={lead.id} className="col-span-2">
                  <AccountTile
                    account={lead}
                    tick={ticks[lead.id]}
                    row={0}
                    index={0}
                    size="lead"
                    onCopy={onCopy}
                    onRename={onRename}
                    onDelete={onDelete}
                  />
                </div>
              )}
              {rest.map((account, position) => (
                <div
                  key={account.id}
                  className={layout[position] === 2 ? 'col-span-2' : ''}
                >
                  <AccountTile
                    account={account}
                    tick={ticks[account.id]}
                    row={Math.floor(position / 3) + 1}
                    index={position + 1}
                    size="compact"
                    onCopy={onCopy}
                    onRename={onRename}
                    onDelete={onDelete}
                  />
                </div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </main>
    </div>
  )
}

const COLUMNS = 3
const LEAD_SPAN = 2

/**
 * Decides which tiles run wide. A wide tile only ever starts a row, so the
 * grid stays varied without leaving holes — the trap of naively spanning
 * every Nth cell. Returns a span (1 or 2) per tile.
 */
function planLayout(count: number): number[] {
  const spans: number[] = []
  // The lead tile has already consumed two columns of the first row.
  let column = LEAD_SPAN % COLUMNS
  let sinceWide = 1

  for (let index = 0; index < count; index += 1) {
    const remaining = count - index
    const wide = column === 0 && sinceWide >= 3 && remaining > 1
    spans.push(wide ? 2 : 1)
    sinceWide = wide ? 0 : sinceWide + 1
    column = (column + (wide ? 2 : 1)) % COLUMNS
  }
  return spans
}

function IndexRow({
  numeral,
  label,
  count,
  active,
  onClick
}: {
  numeral: string
  label: string
  count: number
  active: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="glass-inset-hover flex w-full items-baseline gap-3 rounded-lg px-2 py-2 text-left"
      >
        <span className="index-numeral shrink-0">{numeral}</span>
        <span
          className="min-w-0 flex-1 truncate text-[0.85rem]"
          style={{ color: active ? 'var(--color-clay-2)' : 'var(--app-text-soft)' }}
        >
          {label}
        </span>
        <span className="mono shrink-0 text-[0.7rem]" style={{ color: 'var(--app-text-faint)' }}>
          {count}
        </span>
      </button>
    </li>
  )
}

function EmptyState({ onImport }: { onImport: () => void }): React.JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease }}
      className="flex h-full max-w-[640px] flex-col justify-center"
    >
      <p className="kicker mb-5">Empty vault</p>
      <h2 className="display mb-6 text-[clamp(2.6rem,5.5vw,4.4rem)]" style={{ color: 'var(--app-text)' }}>
        Nothing to
        <br />
        <span className="display-italic" style={{ color: 'var(--color-clay-2)' }}>
          protect yet.
        </span>
      </h2>
      <p className="mb-8 max-w-[420px] text-[0.95rem] leading-relaxed" style={{ color: 'var(--app-text-soft)' }}>
        Open Google Authenticator, choose <em>Transfer accounts → Export accounts</em>, and bring the
        QR code here. Everything is decoded and stored on this machine only.
      </p>
      <button
        type="button"
        onClick={onImport}
        className="glass-btn glass-btn--clay w-fit px-8 py-4 text-[0.78rem] tracking-[0.22em] uppercase"
      >
        Import from Google Authenticator
      </button>
    </motion.div>
  )
}

function NoMatches({ query }: { query: string }): React.JSX.Element {
  return (
    <div className="flex h-full flex-col justify-center">
      <p className="kicker mb-4">No matches</p>
      <p className="display text-[2.4rem]" style={{ color: 'var(--app-text-soft)' }}>
        Nothing matches “{query}”.
      </p>
    </div>
  )
}
