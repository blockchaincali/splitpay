import { useState, type ReactNode } from 'react'
import { Check, Copy, ExternalLink, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { buildAddressExplorerUrl, buildTxExplorerUrl } from '@/onchain-facts'
import { TARGET_CHAIN_ID } from '@/lib/deployment'
import { shortAddress, shortHash } from '@/lib/money'

export function Spinner({ className = 'size-4' }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin`} aria-hidden="true" />
}

export async function copyText(text: string, okMessage = 'Copied') {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(okMessage)
    return true
  } catch {
    toast.error('Could not copy. Select the text and copy it manually.')
    return false
  }
}

export function CopyButton({ text, label, className = '' }: { text: string; label: string; className?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      aria-label={label}
      className={`inline-flex size-11 items-center justify-center rounded-xl hover:bg-slate-100 ${className}`}
      onClick={() => {
        void copyText(text).then((ok) => {
          if (!ok) return
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        })
      }}
    >
      {done ? <Check className="size-4" style={{ color: 'var(--success)' }} /> : <Copy className="size-4" />}
    </button>
  )
}

export function AddressChip({ address, label }: { address: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label ? <span style={{ color: 'var(--muted)' }}>{label}</span> : null}
      <a
        className="mono text-sm underline decoration-dotted underline-offset-4"
        href={buildAddressExplorerUrl(TARGET_CHAIN_ID, address)}
        target="_blank"
        rel="noopener noreferrer"
        title={address}
      >
        {shortAddress(address)}
        <span className="sr-only"> (opens block explorer in a new tab)</span>
      </a>
    </span>
  )
}

export function TxLink({ hash, children }: { hash: string; children?: ReactNode }) {
  return (
    <a
      className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold underline underline-offset-4"
      style={{ color: 'var(--teal-ink)' }}
      href={buildTxExplorerUrl(TARGET_CHAIN_ID, hash)}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children ?? <span className="mono">{shortHash(hash)}</span>}
      <ExternalLink className="size-3.5" aria-hidden="true" />
      <span className="sr-only">View transaction on the block explorer (opens in a new tab)</span>
    </a>
  )
}

export function Chip({ tone, children }: { tone: 'teal' | 'navy' | 'warn' | 'danger' | 'success' | 'muted'; children: ReactNode }) {
  const styles: Record<string, { bg: string; fg: string }> = {
    teal: { bg: 'var(--teal-soft)', fg: 'var(--teal-ink)' },
    navy: { bg: 'var(--navy)', fg: '#fff' },
    warn: { bg: 'var(--warn-soft)', fg: 'var(--warn)' },
    danger: { bg: 'var(--danger-soft)', fg: 'var(--danger)' },
    success: { bg: '#e3f5ea', fg: 'var(--success)' },
    muted: { bg: 'var(--surface-muted)', fg: 'var(--ink-2)' },
  }
  const s = styles[tone]
  return (
    <span className="chip" style={{ background: s.bg, color: s.fg }}>
      {children}
    </span>
  )
}

export function Notice({ tone = 'muted', title, children }: { tone?: 'warn' | 'danger' | 'muted' | 'teal'; title?: string; children: ReactNode }) {
  const bg = { warn: 'var(--warn-soft)', danger: 'var(--danger-soft)', muted: 'var(--surface-muted)', teal: 'var(--teal-soft)' }[tone]
  const fg = { warn: 'var(--warn)', danger: 'var(--danger)', muted: 'var(--ink-2)', teal: 'var(--teal-ink)' }[tone]
  return (
    <div
      className="rounded-2xl p-4 text-sm"
      style={{ background: bg, color: fg }}
      role={tone === 'danger' ? 'alert' : undefined}
    >
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <div>{children}</div>
    </div>
  )
}
