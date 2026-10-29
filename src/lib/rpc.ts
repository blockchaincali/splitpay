import { fallback, http, type Chain, type Transport } from 'viem'
import { requireChain } from '@/onchain-facts'

export const RPC_TIMEOUT_MS = 10_000
export const RPC_RETRY_COUNT = 2
export const RPC_RETRY_DELAY_MS = 300

/**
 * Every known public endpoint for a chain, primary first, duplicates removed.
 * The primary comes from the generated chain facts; the extras come from viem's own chain definition.
 */
export function rpcUrlsFor(chain: Chain, factsChainId: number = chain.id): string[] {
  const urls = [...requireChain(factsChainId).rpcUrls, ...chain.rpcUrls.default.http]
  return [...new Set(urls)]
}

export interface RpcTransportOptions {
  timeout?: number
  retryCount?: number
  retryDelay?: number
}

/**
 * One http transport per URL, wrapped in viem's fallback. A dropped connection, timeout, 429 or 5xx on one
 * endpoint is retried and then moves on to the next. Contract reverts are NOT retried or failed over, so a real
 * revert still reaches the caller with its error name intact.
 */
export function buildRpcTransport(urls: readonly string[], opts: RpcTransportOptions = {}): Transport {
  const { timeout = RPC_TIMEOUT_MS, retryCount = RPC_RETRY_COUNT, retryDelay = RPC_RETRY_DELAY_MS } = opts
  const transports = urls.map((url) => http(url, { timeout, retryCount, retryDelay }))
  return transports.length === 1 ? transports[0] : fallback(transports, { rank: false, retryCount: 0 })
}

export function transportForChain(chain: Chain, factsChainId: number = chain.id): Transport {
  return buildRpcTransport(rpcUrlsFor(chain, factsChainId))
}

export interface EndpointProbe {
  host: string
  /** "ok": CORS request answered. "cors": reachable but the browser refused to expose the answer. "blocked": no connection at all (offline, DNS, firewall, extension, content blocker). */
  result: 'ok' | 'cors' | 'blocked'
  status?: number
  ms: number
}

const PROBE_BODY = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })

/**
 * Tell apart why a browser cannot reach an RPC endpoint. Sends only eth_chainId (public, read-only) to each URL.
 * A normal request that fails but a no-cors request that succeeds means CORS; both failing means the connection
 * itself is blocked before it reaches the server.
 */
export async function probeEndpoints(urls: readonly string[], timeoutMs = 5_000, fetchImpl: typeof fetch = fetch): Promise<EndpointProbe[]> {
  const one = async (url: string): Promise<EndpointProbe> => {
    const host = new URL(url).hostname
    const t0 = Date.now()
    const withTimeout = (init: RequestInit) => fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
    try {
      const r = await withTimeout({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: PROBE_BODY })
      return { host, result: 'ok', status: r.status, ms: Date.now() - t0 }
    } catch {
      try {
        await withTimeout({ method: 'POST', mode: 'no-cors', body: PROBE_BODY })
        return { host, result: 'cors', ms: Date.now() - t0 }
      } catch {
        return { host, result: 'blocked', ms: Date.now() - t0 }
      }
    }
  }
  return Promise.all(urls.map(one))
}

/** Probe the endpoints for a chain and print the outcome. Called only after a transport failure. */
export async function logEndpointProbe(chain: Chain, factsChainId: number = chain.id): Promise<void> {
  try {
    console.error('[splitpay] RPC endpoint probe', await probeEndpoints(rpcUrlsFor(chain, factsChainId)))
  } catch {
    /* diagnostics must never throw */
  }
}
