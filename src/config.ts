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
import './wallet/embedded' // announces the SplitPay testnet wallet (EIP-6963) before wagmi looks for wallets

// RPC URLs come from the generated chain facts, never from memory.
const testnetRpc = requireChain(arcTestnet.id).rpcUrls[0]
const mainnetRpc = requireChain(arc.id).rpcUrls[0]

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, testnetRpc)
registerChain(arc.id, mainnetRpc)

// Arc mainnet is configured but unused unless VITE_SPLITPAY_CHAIN_ID=5042 (see src/lib/deployment.ts).
export const config = createConfig({
  chains: [arcTestnet, arc, mainnet], // Ethereum mainnet is only for ENS name resolution
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(testnetRpc),
    [arc.id]: http(mainnetRpc),
    [mainnet.id]: http(),
  },
})
