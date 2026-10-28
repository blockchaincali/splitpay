import { useCallback, useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { api, ApiError } from '@/api/client'
import { EMBEDDED_RDNS } from '@/wallet/embedded'
import { useSession } from './SessionProvider'

/** Proves ownership of the connected wallet by signing a server challenge (no transaction, no cost). */
export function useLinkWallet() {
  const { address, connector } = useAccount()
  const connectorId = connector?.id
  const { user, wallets, refresh } = useSession()
  const { signMessageAsync } = useSignMessage()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const linked = Boolean(address && wallets.some((w) => w.address.toLowerCase() === address.toLowerCase()))

  const link = useCallback(async () => {
    if (!address || !user) return false
    setBusy(true)
    setError(null)
    try {
      const { message } = await api.post<{ message: string }>('/wallets/challenge', { address })
      const signature = await signMessageAsync({ message })
      await api.post('/wallets/link', { address, signature, kind: connectorId === EMBEDDED_RDNS ? 'embedded' : 'external' })
      await refresh()
      return true
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The wallet did not sign. Nothing was linked.')
      return false
    } finally {
      setBusy(false)
    }
  }, [address, user, signMessageAsync, refresh, connectorId])

  return { link, linked, busy, error, address }
}
