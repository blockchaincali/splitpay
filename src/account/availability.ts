import { useQuery } from '@tanstack/react-query'

/**
 * Accounts (email sign-in, invitations, reminders, the NGN sandbox) are an optional extra.
 * SplitPay is wallet-first: creating a group, paying and seeing "Your groups" never need them.
 *
 * They are offered only when BOTH are true:
 *  1. the build was made with VITE_ACCOUNTS_ENABLED=true, and
 *  2. the API answers its health check right now.
 * On a static host there is no API, so nothing about accounts is shown and nothing is requested.
 */
export const ACCOUNTS_FLAG = import.meta.env.VITE_ACCOUNTS_ENABLED === 'true'

const HEALTH_TIMEOUT_MS = 4000

/**
 * True only if /api/health answers JSON of exactly the shape the SplitPay API returns.
 * A static host that rewrites unknown paths to index.html answers 200 with HTML, which must count as "no server".
 * Never throws.
 */
export async function checkAccountsApi(signal?: AbortSignal): Promise<boolean> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS)
  signal?.addEventListener('abort', () => ctrl.abort(), { once: true })
  try {
    const res = await fetch('/api/health', { headers: { Accept: 'application/json' }, signal: ctrl.signal, cache: 'no-store' })
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('application/json')) return false
    const body = (await res.json()) as { ok?: unknown; service?: unknown } | null
    return body?.ok === true && body?.service === 'splitpay-api'
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export interface AccountsAvailability {
  /** The build asked for accounts. */
  enabled: boolean
  /** Waiting for the first health answer. */
  checking: boolean
  /** Safe to show account features and call the API. */
  available: boolean
}

export function useAccountsAvailable(): AccountsAvailability {
  const q = useQuery({
    queryKey: ['accounts-health'],
    queryFn: ({ signal }) => checkAccountsApi(signal),
    enabled: ACCOUNTS_FLAG,
    retry: false,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
  return { enabled: ACCOUNTS_FLAG, checking: ACCOUNTS_FLAG && q.isPending, available: ACCOUNTS_FLAG && q.data === true }
}
