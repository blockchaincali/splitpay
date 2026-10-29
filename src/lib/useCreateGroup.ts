import { useCallback, useState } from 'react'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { encodeAbiParameters, keccak256, parseEventLogs, toHex, type Address, type Hex, type PublicClient } from 'viem'
import { splitPayAbi } from './splitpayAbi'
import { SPLITPAY_ADDRESS, TARGET_CHAIN_ID } from './deployment'
import { friendlyError } from './errors'
import { logFailure } from './log'
import { hashMetaText } from './metadata'
import { saveStoredGroup } from './localGroups'

export type CreateStep = 'idle' | 'switching' | 'wallet' | 'confirming' | 'done' | 'failed'

export interface CreatedResult {
  groupId: Hex
  txHash: Hex
  blockNumber: bigint
  text: string
}

export interface CreateInput {
  recipient: Address
  target: bigint
  deadline: number
  /** Exact JSON text (see serializeMeta). Its hash is committed onchain. */
  metaText: string
}

/** Group IDs are keccak256(creator, salt), so nobody else can claim an ID you chose. */
export function deriveGroupId(creator: Address, salt: Hex): Hex {
  return keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }], [creator, salt]))
}

export function randomSalt(): Hex {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return toHex(bytes)
}

export function useCreateGroup() {
  const { address, chainId } = useAccount()
  const client = usePublicClient({ chainId: TARGET_CHAIN_ID }) as PublicClient | undefined
  const { writeContractAsync } = useWriteContract()
  const { switchChainAsync } = useSwitchChain()
  const [step, setStep] = useState<CreateStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<Hex | null>(null)
  const [result, setResult] = useState<CreatedResult | null>(null)

  const create = useCallback(
    async (input: CreateInput) => {
      if (!address || !client || !SPLITPAY_ADDRESS) return
      const contract = SPLITPAY_ADDRESS
      setError(null)
      setResult(null)
      setTxHash(null)
      let stage = 'start'
      try {
        if (chainId !== TARGET_CHAIN_ID) {
          stage = 'switching'
          setStep('switching')
          await switchChainAsync({ chainId: TARGET_CHAIN_ID })
        }
        const salt = randomSalt()
        const expectedId = deriveGroupId(address, salt)
        const args = [salt, input.recipient, input.target, BigInt(input.deadline), hashMetaText(input.metaText)] as const
        stage = 'simulating'
        await client.simulateContract({
          account: address,
          address: SPLITPAY_ADDRESS,
          abi: splitPayAbi,
          functionName: 'createGroup',
          args,
        })
        stage = 'wallet'
        setStep('wallet')
        const hash = await writeContractAsync({
          address: SPLITPAY_ADDRESS,
          abi: splitPayAbi,
          functionName: 'createGroup',
          args,
          chainId: TARGET_CHAIN_ID,
        })
        setTxHash(hash)
        stage = 'confirming'
        setStep('confirming')
        const mined = await client.waitForTransactionReceipt({ hash, timeout: 120_000 })
        if (mined.status !== 'success') throw new Error('The transaction was reverted.')
        const created = parseEventLogs({ abi: splitPayAbi, eventName: 'GroupCreated', logs: mined.logs }).find(
          (e) => e.address.toLowerCase() === contract.toLowerCase() && e.args.groupId === expectedId,
        )
        if (!created) throw new Error('The group was mined but its creation event was not found.')
        saveStoredGroup({ groupId: expectedId, text: input.metaText, block: mined.blockNumber.toString() })
        setResult({ groupId: expectedId, txHash: hash, blockNumber: mined.blockNumber, text: input.metaText })
        setStep('done')
      } catch (e) {
        const f = friendlyError(e, { stage })
        if (!f.cancelled) logFailure('createGroup', stage, e, { walletChainId: chainId, targetChainId: TARGET_CHAIN_ID })
        setStep(f.cancelled ? 'idle' : 'failed')
        setError(f.message)
      }
    },
    [address, chainId, client, switchChainAsync, writeContractAsync],
  )

  const reset = useCallback(() => {
    setStep('idle')
    setError(null)
    setTxHash(null)
    setResult(null)
  }, [])

  return { step, error, txHash, result, create, reset }
}
