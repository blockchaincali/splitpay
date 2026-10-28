import { arc, arcTestnet } from 'viem/chains'
import { isAddress, type Address } from 'viem'
import { getUsdc, requireChain } from '@/onchain-facts'
import { usdcDecimalsFor } from '@/onchain-money'

/**
 * The one Arc network this build talks to. Arc Testnet unless VITE_SPLITPAY_CHAIN_ID is set to 5042
 * (Arc mainnet, real USDC). Leave it unset for testnet; see docs/MAINNET_CHECKLIST.md before changing it.
 */
export type TargetChainId = typeof arc.id | typeof arcTestnet.id
export const TARGET_CHAIN_ID: TargetChainId = Number(import.meta.env.VITE_SPLITPAY_CHAIN_ID) === arc.id ? arc.id : arcTestnet.id
export const IS_MAINNET = TARGET_CHAIN_ID === arc.id

export const TARGET_CHAIN = requireChain(TARGET_CHAIN_ID)
export const USDC = getUsdc(TARGET_CHAIN_ID)
export const USDC_DECIMALS_ONCHAIN = usdcDecimalsFor(TARGET_CHAIN_ID)

const rawAddress = import.meta.env.VITE_SPLITPAY_ADDRESS as string | undefined
export const SPLITPAY_ADDRESS: Address | undefined =
  rawAddress && isAddress(rawAddress) ? rawAddress : undefined

const rawBlock = Number(import.meta.env.VITE_SPLITPAY_DEPLOY_BLOCK ?? 0)
export const DEPLOY_BLOCK = BigInt(Number.isFinite(rawBlock) && rawBlock > 0 ? rawBlock : 0)

export const FAUCET_URL = 'https://faucet.circle.com'
