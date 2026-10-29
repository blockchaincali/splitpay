import {
  BaseError,
  ContractFunctionRevertedError,
  HttpRequestError,
  SwitchChainError,
  TimeoutError,
  UserRejectedRequestError,
  WebSocketRequestError,
} from 'viem'
import { fmtUsdcLabel } from './money'

export interface FriendlyError {
  /** True when the person simply cancelled in their wallet. Not shown as an error. */
  cancelled: boolean
  message: string
}

const NETWORK_MESSAGE = 'Network issue. Check your connection and try again.'
const SWITCH_MESSAGE = 'Your wallet could not switch to the Arc network. Add the network in your wallet, then try again.'

/** True when the RPC endpoint itself could not be reached or did not answer in time. */
export function isTransportError(error: unknown): boolean {
  if (error instanceof BaseError) {
    return !!error.walk((e) => e instanceof HttpRequestError || e instanceof TimeoutError || e instanceof WebSocketRequestError)
  }
  const text = (error instanceof Error ? error.message : String(error)).toLowerCase()
  return /failed to fetch|networkerror|network request failed|load failed|timed out|took too long/.test(text)
}

/**
 * Turn wallet, RPC and contract errors into plain-language text.
 * `stage` lets a failed network switch be told apart from a failing RPC connection.
 */
export function friendlyError(error: unknown, opts: { stage?: string } = {}): FriendlyError {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) {
      return { cancelled: true, message: 'You cancelled the request in your wallet. Nothing was sent.' }
    }
    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError)
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName
      const args = reverted.data?.args ?? []
      switch (name) {
        case 'GroupExpired':
          return { cancelled: false, message: 'The deadline for this group has passed, so it no longer accepts payments.' }
        case 'TargetExceeded': {
          const left = typeof args[1] === 'bigint' ? args[1] : null
          return {
            cancelled: false,
            message:
              left === null
                ? 'That is more than this group still needs.'
                : left === 0n
                  ? 'This group is already fully paid.'
                  : `That is more than this group still needs. Only ${fmtUsdcLabel(left)} is left.`,
          }
        }
        case 'RecipientCannotContribute':
          return { cancelled: false, message: 'The person receiving the money cannot pay into their own group.' }
        case 'NameTooLong':
          return { cancelled: false, message: 'That nickname is too long. Keep it to 24 bytes or fewer.' }
        case 'GroupNotFound':
          return { cancelled: false, message: 'This group was not found on the network.' }
        case 'InvalidAmount':
          return { cancelled: false, message: 'Enter an amount above zero.' }
        case 'GroupAlreadyExists':
          return { cancelled: false, message: 'A group with this ID already exists. Please try again.' }
        case 'InvalidDeadline':
          return { cancelled: false, message: 'The deadline must be in the future.' }
        case 'InvalidRecipient':
          return { cancelled: false, message: 'That receiving wallet address cannot be used.' }
        default:
          break
      }
    }
  }
  if (error instanceof BaseError && error.walk((e) => e instanceof SwitchChainError))
    return { cancelled: false, message: SWITCH_MESSAGE }
  if (isTransportError(error)) return { cancelled: false, message: NETWORK_MESSAGE }
  const text = (error instanceof Error ? error.message : String(error)).toLowerCase()
  if (text.includes('user rejected') || text.includes('user denied'))
    return { cancelled: true, message: 'You cancelled the request in your wallet. Nothing was sent.' }
  if (text.includes('allowance'))
    return { cancelled: false, message: 'The wallet has not allowed this exact amount yet. Please try again.' }
  if (text.includes('exceeds balance') || text.includes('insufficient'))
    return {
      cancelled: false,
      message: 'Your wallet does not have enough USDC for this payment plus network fees.',
    }
  if (opts.stage === 'switching') return { cancelled: false, message: SWITCH_MESSAGE }
  return { cancelled: false, message: 'Something went wrong. Nothing was charged unless a transaction link is shown.' }
}
