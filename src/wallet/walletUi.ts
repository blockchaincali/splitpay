import { useSyncExternalStore } from 'react'
import type { ConfirmRequest } from './embedded'

export type DialogState =
  | { kind: 'closed' }
  | { kind: 'chooser' }
  | { kind: 'create' }
  | { kind: 'unlock' }
  | { kind: 'manage' }

let state: DialogState = { kind: 'closed' }
let confirmReq: { req: ConfirmRequest; resolve: (ok: boolean) => void } | null = null
let unlockWaiter: { resolve: () => void; reject: (e: Error) => void } | null = null
const subs = new Set<() => void>()
const notify = () => subs.forEach((s) => s())

export const subscribe = (cb: () => void) => {
  subs.add(cb)
  return () => subs.delete(cb)
}

export const useDialog = () => useSyncExternalStore(subscribe, () => state)
export const useConfirm = () => useSyncExternalStore(subscribe, () => confirmReq)

export function openDialog(next: DialogState) {
  state = next
  notify()
}
export const openConnectChooser = () => openDialog({ kind: 'chooser' })
export function closeDialog() {
  state = { kind: 'closed' }
  if (unlockWaiter) {
    unlockWaiter.reject(new Error('cancelled'))
    unlockWaiter = null
  }
  notify()
}

/** Called by the wallet provider when a dapp asks for accounts while locked. */
export function requestUnlockUi(hasVault: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    unlockWaiter = { resolve, reject }
    openDialog({ kind: hasVault ? 'unlock' : 'create' })
  })
}
export function unlockDone() {
  unlockWaiter?.resolve()
  unlockWaiter = null
}

export function askConfirm(req: ConfirmRequest): Promise<boolean> {
  return new Promise((resolve) => {
    confirmReq = {
      req,
      resolve: (ok) => {
        confirmReq = null
        notify()
        resolve(ok)
      },
    }
    notify()
  })
}
