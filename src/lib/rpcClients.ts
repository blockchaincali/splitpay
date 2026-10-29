import { createPublicClient, http, type PublicClient } from 'viem'
import { arc, arcTestnet } from 'viem/chains'
import { TARGET_CHAIN_ID } from './deployment'
import { RPC_TIMEOUT_MS, rpcUrlsFor } from './rpc'

const chain = TARGET_CHAIN_ID === arc.id ? arc : arcTestnet
let clients: PublicClient[] | null = null

/** The endpoint URLs, in the same order as endpointClients(). */
export const endpointUrls = (): string[] => rpcUrlsFor(chain)

/**
 * One client per known RPC endpoint, each with a single attempt and a timeout. The scanners retry and move to the next
 * endpoint themselves, and spread parallel requests across endpoints, so a flaky or rate-limited endpoint slows one window, not the whole scan.
 */
export function endpointClients(): PublicClient[] {
  clients ??= rpcUrlsFor(chain).map(
    (url) => createPublicClient({ chain, transport: http(url, { timeout: RPC_TIMEOUT_MS, retryCount: 0 }) }) as PublicClient,
  )
  return clients
}

/** Latest block number, trying each endpoint in turn. */
export async function headBlock(list: PublicClient[] = endpointClients()): Promise<bigint> {
  let last: unknown
  for (const c of list) {
    try {
      return await c.getBlockNumber()
    } catch (e) {
      last = e
    }
  }
  throw last instanceof Error ? last : new Error('No RPC endpoint answered.')
}
