/** Addresses are hex and may be checksummed (mixed case) or lower case; they are the same address either way. */
export const normAddress = (a: string | null | undefined): string => (a ?? '').trim().toLowerCase()

export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normAddress(a)
  return x !== '' && x === normAddress(b)
}
