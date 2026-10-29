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
