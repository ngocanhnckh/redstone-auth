import type { AccountView, CodeTick, VaultStatus } from '@core/types'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api'

export interface VaultState {
  ready: boolean
  status: VaultStatus | null
  accounts: AccountView[]
  ticks: Record<string, CodeTick>
  refresh: () => Promise<void>
  setAccounts: (accounts: AccountView[]) => void
}

/**
 * Owns everything the renderer knows about the vault: the lock state, the
 * account list, and the per-second code broadcast from the main process.
 */
export function useVault(): VaultState {
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [accounts, setAccounts] = useState<AccountView[]>([])
  const [ticks, setTicks] = useState<Record<string, CodeTick>>({})

  const refresh = useCallback(async () => {
    const next = await api.status()
    setStatus(next)
    setAccounts(next.unlocked ? await api.listAccounts() : [])
    if (!next.unlocked) setTicks({})
  }, [])

  useEffect(() => {
    void refresh()

    const offTick = api.onTick((incoming) => {
      setTicks(Object.fromEntries(incoming.map((tick) => [tick.id, tick])))
    })
    const offLocked = api.onLocked(() => {
      setAccounts([])
      setTicks({})
      setStatus((current) => (current ? { ...current, unlocked: false, accountCount: 0 } : current))
    })

    return () => {
      offTick()
      offLocked()
    }
  }, [refresh])

  return useMemo(
    () => ({ ready: status !== null, status, accounts, ticks, refresh, setAccounts }),
    [status, accounts, ticks, refresh]
  )
}
