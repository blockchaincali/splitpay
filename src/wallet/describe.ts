import { decodeFunctionData, erc20Abi, type Address, type Hex } from 'viem'
import { splitPayAbi } from '@/lib/splitpayAbi'
import { SPLITPAY_ADDRESS, USDC } from '@/lib/deployment'
import { fmtUsdcLabel } from '@/lib/money'

export interface Described {
  title: string
  lines: string[]
}

/** Plain-language summary of what the wallet is about to sign. Unknown calls are shown as unknown. */
export function describeRequest(kind: 'transaction', to?: Address, data?: Hex): Described {
  const target = to?.toLowerCase()
  try {
    if (target && USDC && target === USDC.address.toLowerCase() && data) {
      const d = decodeFunctionData({ abi: erc20Abi, data })
      if (d.functionName === 'approve') {
        const [spender, amount] = d.args as [Address, bigint]
        const mine = spender.toLowerCase() === SPLITPAY_ADDRESS?.toLowerCase()
        return {
          title: 'Allow a payment',
          lines: [`Allow ${mine ? 'the SplitPay contract' : spender} to use exactly ${fmtUsdcLabel(amount)} from this wallet.`, 'This is not unlimited. The allowance is used up by the payment.'],
        }
      }
    }
    if (target && target === SPLITPAY_ADDRESS?.toLowerCase() && data) {
      const d = decodeFunctionData({ abi: splitPayAbi, data })
      if (d.functionName === 'contribute') {
        const [, amount, name] = d.args as [Hex, bigint, string]
        return {
          title: 'Send your payment',
          lines: [`Pay ${fmtUsdcLabel(amount)} in USDC. It goes straight to the group's receiving wallet.`, name ? `Public nickname: ${name}. Anyone can see it onchain.` : 'No nickname will be published.'],
        }
      }
      if (d.functionName === 'createGroup') {
        const [, recipient, target2] = d.args as [Hex, Address, bigint, bigint, Hex]
        return { title: 'Create a payment group', lines: [`Goal ${fmtUsdcLabel(target2)}.`, `Receiving wallet ${recipient}. It cannot be changed later.`] }
      }
    }
  } catch {
    // fall through to the generic summary
  }
  return { title: `Confirm ${kind}`, lines: [`Contract: ${to ?? 'unknown'}`, 'SplitPay does not recognise this request. Only continue if you started it.'] }
}
