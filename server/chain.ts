import { createPublicClient, http, type Address, type Hex } from 'viem'
import { config } from './config'
import { splitPayAbi } from '../src/lib/splitpayAbi'

export interface OnchainGroup {
  creator: Address
  recipient: Address
  target: bigint
  deadline: bigint
  collected: bigint
  metadataHash: Hex
}

/** Read-only view of Arc. Swappable in tests. */
export interface ChainReader {
  getGroup(groupId: Hex): Promise<OnchainGroup | null>
  contributionOf(groupId: Hex, wallet: Address): Promise<bigint>
}

export function arcReader(): ChainReader {
  const client = createPublicClient({ transport: http(config.rpcUrl) })
  return {
    async getGroup(groupId) {
      try {
        const [creator, recipient, target, deadline, collected, metadataHash] = await client.readContract({
          address: config.contract,
          abi: splitPayAbi,
          functionName: 'getGroup',
          args: [groupId],
        })
        return { creator, recipient, target, deadline: BigInt(deadline), collected, metadataHash }
      } catch (e) {
        if (String((e as Error).message).includes('GroupNotFound')) return null
        throw e
      }
    },
    contributionOf: (groupId, wallet) =>
      client.readContract({ address: config.contract, abi: splitPayAbi, functionName: 'contributionOf', args: [groupId, wallet] }),
  }
}
