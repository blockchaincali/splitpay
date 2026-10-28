import { useSyncExternalStore } from 'react'

/** Tiny History-API router. Paths and queries (not hashes) carry shareable state. */
const NAV_EVENT = 'splitpay:navigate'

function subscribe(cb: () => void) {
  window.addEventListener('popstate', cb)
  window.addEventListener(NAV_EVENT, cb)
  return () => {
    window.removeEventListener('popstate', cb)
    window.removeEventListener(NAV_EVENT, cb)
  }
}

const snapshot = () => window.location.pathname + window.location.search

export function useLocation() {
  const full = useSyncExternalStore(subscribe, snapshot, snapshot)
  const url = new URL(full, window.location.origin)
  return { path: url.pathname, search: url.searchParams }
}

export function navigate(to: string, opts?: { replace?: boolean }) {
  if (opts?.replace) window.history.replaceState(null, '', to)
  else window.history.pushState(null, '', to)
  window.dispatchEvent(new Event(NAV_EVENT))
  window.scrollTo({ top: 0 })
}

/** Match "/g/:id" style patterns. Returns params or null. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/').filter(Boolean)
  const b = path.split('/').filter(Boolean)
  if (a.length !== b.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i])
    else if (a[i] !== b[i]) return null
  }
  return params
}
