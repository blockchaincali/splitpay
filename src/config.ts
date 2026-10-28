/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arc, arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { requireChain } from '@/onchain-facts'
import { registerChain } from './tracing'
import { transportForChain } from './lib/rpc'

// RPC URLs come from the generated chain facts, never from memory.
const testnetRpc = requireChain(arcTestnet.id).rpcUrls[0]
const mainnetRpc = requireChain(arc.id).rpcUrls[0]

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, testnetRpc)
registerChain(arc.id, mainnetRpc)

// Mainnet keeps its original single-endpoint transport on purpose; only testnet gets RPC failover.
// Arc mainnet is configured but unused unless VITE_SPLITPAY_CHAIN_ID=5042 (see src/lib/deployment.ts).
export const config = createConfig({
  chains: [arcTestnet, arc, mainnet], // Ethereum mainnet is only for ENS name resolution
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: transportForChain(arcTestnet),
    [arc.id]: http(mainnetRpc),
    [mainnet.id]: http(),
  },
})
