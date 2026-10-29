export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="9" fill="#0b1f3a" />
      <path d="M16 6a10 10 0 1 0 10 10H16V6Z" fill="#fff" />
      <path d="M19 6.4A10 10 0 0 1 25.6 13H19V6.4Z" fill="#12b3a4" />
    </svg>
  )
}
