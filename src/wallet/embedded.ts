/**
 * SplitPay testnet wallet: an in-browser wallet so a new user can try SplitPay without a browser extension.
 *
 * What it is: a private key generated on this device, encrypted with the user's PIN (PBKDF2 + AES-GCM) and kept
 * in this browser's storage. SplitPay's servers never see it, so it is non-custodial.
 * What it is not: a production wallet. A 6-digit PIN does not protect against someone who copies the browser
 * storage, so it is TESTNET ONLY and refuses to run on Arc mainnet. For real funds use a hardware or
 * extension wallet today, and Circle's passkey wallets once configured (see docs/INTEGRATIONS_RESEARCH.md).
 */
import { createWalletClient, getAddress, http, type Address, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { requireChain } from '@/onchain-facts'
import { IS_MAINNET, TARGET_CHAIN_ID } from '@/lib/deployment'
import { describeRequest } from './describe'

const STORAGE_KEY = 'splitpay:embedded-wallet:v1'
const ITERATIONS = 310_000
export const EMBEDDED_RDNS = 'app.splitpay.embedded'

interface Vault {
  v: 1
  address: Address
  salt: string
  iv: string
  data: string
  iterations: number
}

let account: PrivateKeyAccount | null = null

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function deriveKey(pin: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

function readVault(): Vault | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Vault) : null
  } catch {
    return null
  }
}

export const embeddedAvailable = () => !IS_MAINNET
export const hasVault = () => readVault() !== null
export const vaultAddress = (): Address | null => readVault()?.address ?? null
export const isUnlocked = () => account !== null
export const unlockedAddress = (): Address | null => account?.address ?? null

export function validPin(pin: string): boolean {
  return /^\d{6}$/.test(pin)
}

export async function createVault(pin: string): Promise<Address> {
  if (!embeddedAvailable()) throw new Error('The SplitPay testnet wallet is disabled on mainnet.')
  if (!validPin(pin)) throw new Error('Choose a 6-digit PIN.')
  if (hasVault()) throw new Error('A wallet already exists on this device.')
  const key = generatePrivateKey()
  const acct = privateKeyToAccount(key)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deriveKey(pin, salt, ITERATIONS), new TextEncoder().encode(key))
  const vault: Vault = { v: 1, address: acct.address, salt: b64(salt), iv: b64(iv), data: b64(new Uint8Array(enc)), iterations: ITERATIONS }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vault))
  account = acct
  emit('accountsChanged', [acct.address])
  return acct.address
}

async function decryptKey(pin: string): Promise<Hex> {
  const vault = readVault()
  if (!vault) throw new Error('No wallet on this device.')
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(vault.iv) as BufferSource },
      await deriveKey(pin, unb64(vault.salt), vault.iterations),
      unb64(vault.data),
    )
    return new TextDecoder().decode(plain) as Hex
  } catch {
    throw new Error('Wrong PIN.')
  }
}

export async function unlock(pin: string): Promise<Address> {
  const acct = privateKeyToAccount(await decryptKey(pin))
  account = acct
  emit('accountsChanged', [acct.address])
  return acct.address
}

export function lock() {
  account = null
  emit('accountsChanged', [])
}

/** Recovery key export so the user can move the wallet elsewhere. Requires the PIN again. */
export const exportKey = (pin: string) => decryptKey(pin)

export function deleteVault() {
  localStorage.removeItem(STORAGE_KEY)
  lock()
}

// ---- EIP-1193 provider -------------------------------------------------------------------------------------

type Listener = (...args: unknown[]) => void
const listeners = new Map<string, Set<Listener>>()
function emit(event: string, ...args: unknown[]) {
  listeners.get(event)?.forEach((l) => l(...args))
}

export interface ConfirmRequest {
  title: string
  lines: string[]
}
let confirmHandler: ((r: ConfirmRequest) => Promise<boolean>) | null = null
let unlockHandler: (() => Promise<void>) | null = null
export const setConfirmHandler = (fn: typeof confirmHandler) => (confirmHandler = fn)
export const setUnlockHandler = (fn: typeof unlockHandler) => (unlockHandler = fn)

class RpcError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message)
  }
}

const rpcUrl = () => requireChain(TARGET_CHAIN_ID).rpcUrls[0]

async function forward(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(rpcUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const json = (await res.json()) as { result?: unknown; error?: { code: number; message: string } }
  if (json.error) throw new RpcError(json.error.code, json.error.message)
  return json.result
}

async function requireUnlocked(): Promise<PrivateKeyAccount> {
  if (!account && unlockHandler) await unlockHandler()
  if (!account) throw new RpcError(4100, 'The SplitPay wallet is locked.')
  return account
}

async function confirm(req: ConfirmRequest) {
  if (!confirmHandler) throw new RpcError(4001, 'No confirmation screen is available.')
  if (!(await confirmHandler(req))) throw new RpcError(4001, 'User rejected the request.')
}

async function request({ method, params = [] }: { method: string; params?: unknown[] }): Promise<unknown> {
  switch (method) {
    case 'eth_requestAccounts':
      return [(await requireUnlocked()).address]
    case 'eth_accounts':
      return account ? [account.address] : []
    case 'eth_chainId':
      return `0x${TARGET_CHAIN_ID.toString(16)}`
    case 'net_version':
      return String(TARGET_CHAIN_ID)
    case 'wallet_switchEthereumChain': {
      const wanted = (params[0] as { chainId?: string } | undefined)?.chainId
      if (wanted && parseInt(wanted, 16) !== TARGET_CHAIN_ID) throw new RpcError(4902, 'This wallet only supports Arc Testnet.')
      return null
    }
    case 'wallet_getPermissions':
    case 'wallet_requestPermissions':
      return account ? [{ parentCapability: 'eth_accounts' }] : []
    case 'wallet_revokePermissions':
      return null
    case 'eth_sendTransaction': {
      const acct = await requireUnlocked()
      const tx = (params[0] ?? {}) as { to?: Address; data?: Hex; value?: Hex }
      await confirm(describeRequest('transaction', tx.to, tx.data))
      const wallet = createWalletClient({ account: acct, chain: arcTestnet, transport: http(rpcUrl()) })
      return wallet.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : undefined })
    }
    case 'personal_sign': {
      const acct = await requireUnlocked()
      const hex = params[0] as Hex
      const text = new TextDecoder().decode(Uint8Array.from((hex.slice(2).match(/.{2}/g) ?? []).map((b) => parseInt(b, 16))))
      await confirm({ title: 'Sign a message', lines: [text.slice(0, 600), 'Signing does not send a transaction or cost anything.'] })
      return acct.signMessage({ message: { raw: hex } })
    }
    default:
      return forward(method, params)
  }
}

export const embeddedProvider = {
  isSplitPayWallet: true,
  request,
  on(event: string, l: Listener) {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event)!.add(l)
    return embeddedProvider
  },
  removeListener(event: string, l: Listener) {
    listeners.get(event)?.delete(l)
    return embeddedProvider
  },
}

/** Announce through EIP-6963 so wagmi discovers it as a normal wallet. Does not touch window.ethereum. */
function announce() {
  if (!embeddedAvailable()) return
  const icon =
    'data:image/svg+xml;base64,' +
    btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#0b1f3a"/><path d="M16 6a10 10 0 1 0 10 10H16V6Z" fill="#fff"/><path d="M19 6.4A10 10 0 0 1 25.6 13H19V6.4Z" fill="#12b3a4"/></svg>')
  window.dispatchEvent(
    new CustomEvent('eip6963:announceProvider', {
      detail: Object.freeze({ info: { uuid: 'splitpay-embedded', name: 'SplitPay testnet wallet', icon, rdns: EMBEDDED_RDNS }, provider: embeddedProvider }),
    }),
  )
}

if (typeof window !== 'undefined') {
  window.addEventListener('eip6963:requestProvider', announce)
  announce()
}

export const checksum = (a: string) => getAddress(a)
