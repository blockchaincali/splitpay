import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAccountsAvailable } from './availability'

interface Me {
  user: { id: number; email: string } | null
  wallets?: { address: string; kind: string }[]
}

interface SessionValue {
  user: Me['user']
  wallets: { address: string; kind: string }[]
  loading: boolean
  /** True when the server could not be reached (the on-chain app still works without it). */
  offline: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const { available } = useAccountsAvailable()
  const q = useQuery({ queryKey: ['me'], queryFn: () => api.get<Me>('/auth/me'), enabled: available, retry: 1, staleTime: 30_000 })
  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ['me'] })
  }, [qc])
  const signOut = useCallback(async () => {
    await api.post('/auth/logout')
    qc.clear()
    await qc.invalidateQueries({ queryKey: ['me'] })
  }, [qc])
  const value = useMemo<SessionValue>(
    () => ({
      user: available ? (q.data?.user ?? null) : null,
      wallets: available ? (q.data?.wallets ?? []) : [],
      loading: available && q.isLoading,
      offline: available && q.isError,
      refresh,
      signOut,
    }),
    [available, q.data, q.isLoading, q.isError, refresh, signOut],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession(): SessionValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSession must be used inside SessionProvider')
  return v
}
