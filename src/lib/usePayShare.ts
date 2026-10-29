import { useCallback, useState } from 'react'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { erc20Abi, parseEventLogs, type Address, type Hex, type PublicClient } from 'viem'
import { splitPayAbi } from './splitpayAbi'
import { SPLITPAY_ADDRESS, TARGET_CHAIN_ID, USDC } from './deployment'
import { friendlyError } from './errors'
import { logFailure } from './log'

export type PayStep =
  | 'idle'
  | 'switching'
  | 'allow-wallet'
  | 'allow-confirming'
  | 'pay-wallet'
  | 'pay-confirming'
  | 'done'
  | 'failed'

export interface PayReceipt {
  txHash: Hex
  amount: bigint
  name: string
  blockNumber: bigint
  totalAfter: bigint
  contributor: Address
}

/**
 * Allow-then-pay flow. "done" is only set after the payment transaction is mined with
 * status success AND its ContributionReceived event for this group and wallet is decoded.
 */
export function usePayShare(groupId: Hex) {
  const { address, chainId } = useAccount()
  const client = usePublicClient({ chainId: TARGET_CHAIN_ID }) as PublicClient | undefined
  const { writeContractAsync } = useWriteContract()
  const { switchChainAsync } = useSwitchChain()
  const [step, setStep] = useState<PayStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [allowHash, setAllowHash] = useState<Hex | null>(null)
  const [payHash, setPayHash] = useState<Hex | null>(null)
  const [receipt, setReceipt] = useState<PayReceipt | null>(null)

  const reset = useCallback(() => {
    setStep('idle')
    setError(null)
    setAllowHash(null)
    setPayHash(null)
    setReceipt(null)
  }, [])

  const pay = useCallback(
    async (amount: bigint, name: string) => {
      if (!address || !client || !SPLITPAY_ADDRESS || !USDC) return
      const contract = SPLITPAY_ADDRESS
      setError(null)
      setReceipt(null)
      setAllowHash(null)
      setPayHash(null)
      let stage = 'start'
      try {
        if (chainId !== TARGET_CHAIN_ID) {
          stage = 'switching'
          setStep('switching')
          await switchChainAsync({ chainId: TARGET_CHAIN_ID })
        }

        // 1) Allow exactly this amount (skipped when the wallet already allowed at least it).
        stage = 'reading-allowance'
        const current = await client.readContract({
          address: USDC.address as Address,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [address, SPLITPAY_ADDRESS],
        })
        if (current < amount) {
          setStep('allow-wallet')
          const hash = await writeContractAsync({
            address: USDC.address as Address,
            abi: erc20Abi,
            functionName: 'approve',
            args: [SPLITPAY_ADDRESS, amount],
            chainId: TARGET_CHAIN_ID,
          })
          setAllowHash(hash)
          setStep('allow-confirming')
          const r = await client.waitForTransactionReceipt({ hash, timeout: 120_000 })
          if (r.status !== 'success') throw new Error('The allowance transaction did not succeed.')
          const after = await client.readContract({
            address: USDC.address as Address,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [address, SPLITPAY_ADDRESS],
          })
          if (after < amount) throw new Error('allowance was set lower than the payment amount')
        }

        // 2) Dry-run the payment so a failure is explained before the wallet asks to sign.
        stage = 'simulating'
        await client.simulateContract({
          account: address,
          address: SPLITPAY_ADDRESS,
          abi: splitPayAbi,
          functionName: 'contribute',
          args: [groupId, amount, name],
        })

        // 3) Pay. The contract sends the USDC straight to the recipient.
        stage = 'pay-wallet'
        setStep('pay-wallet')
        const hash = await writeContractAsync({
          address: SPLITPAY_ADDRESS,
          abi: splitPayAbi,
          functionName: 'contribute',
          args: [groupId, amount, name],
          chainId: TARGET_CHAIN_ID,
        })
        setPayHash(hash)
        setStep('pay-confirming')
        const mined = await client.waitForTransactionReceipt({ hash, timeout: 120_000 })
        if (mined.status !== 'success') throw new Error('The payment transaction was reverted.')
        const events = parseEventLogs({ abi: splitPayAbi, eventName: 'ContributionReceived', logs: mined.logs })
        const mine = events.find(
          (e) =>
            e.address.toLowerCase() === contract.toLowerCase() &&
            e.args.groupId.toLowerCase() === groupId.toLowerCase() &&
            e.args.contributor.toLowerCase() === address.toLowerCase() &&
            e.args.amount === amount,
        )
        if (!mine) throw new Error('The payment was mined but its receipt event was not found.')
        setReceipt({
          txHash: hash,
          amount: mine.args.amount,
          name: mine.args.name,
          blockNumber: mined.blockNumber,
          totalAfter: mine.args.totalCollected,
          contributor: mine.args.contributor,
        })
        setStep('done')
      } catch (e) {
        const f = friendlyError(e, { stage })
        if (!f.cancelled) logFailure('pay', stage, e, { walletChainId: chainId, targetChainId: TARGET_CHAIN_ID })
        if (f.cancelled) {
          setStep('idle')
          setError(f.message)
        } else {
          setStep('failed')
          setError(f.message)
        }
      }
    },
    [address, chainId, client, groupId, switchChainAsync, writeContractAsync],
  )

  return { step, error, allowHash, payHash, receipt, pay, reset }
}
