import { useEffect, useState } from 'react'
import { QrCode, Send, Share2 } from 'lucide-react'
import QRCode from 'qrcode'
import { buildShareLink } from '@/lib/share'
import { CopyButton, copyText } from './ui'

export function ShareLinkCard({ path, title }: { path: string; title: string }) {
  const [link, setLink] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [showQr, setShowQr] = useState(false)

  // Resolve once (and whenever the path changes) so Copy/Share work straight from a tap.
  useEffect(() => {
    let live = true
    void buildShareLink(path).then((l) => {
      if (live) setLink(l)
    })
    return () => {
      live = false
    }
  }, [path])

  useEffect(() => {
    if (!link || !showQr) return
    QRCode.toDataURL(link, { margin: 1, width: 240, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(null))
  }, [link, showQr])

  const message = `Please pay your share for "${title}" with USDC: ${link ?? ''}`
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <section className="card" aria-labelledby="share-title">
      <h2 id="share-title" className="display text-xl font-bold">Share this link</h2>
      <p className="hint">Send it to your group. Everyone can open it on their phone and pay their share.</p>

      <div className="mt-3 flex items-center gap-1 rounded-2xl border bg-white pl-3" style={{ borderColor: 'var(--border)' }}>
        <input
          readOnly
          aria-label="Share link"
          className="mono min-h-[48px] min-w-0 flex-1 bg-transparent text-xs outline-none"
          value={link ?? 'Preparing link…'}
          onFocus={(e) => e.currentTarget.select()}
        />
        {link ? <CopyButton text={link} label="Copy share link" /> : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <a
          className={`btn-primary btn-sm ${link ? '' : 'pointer-events-none opacity-50'}`}
          href={link ? `https://wa.me/?text=${encodeURIComponent(message)}` : undefined}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Send className="size-4" aria-hidden="true" /> WhatsApp
        </a>
        <button
          type="button"
          className="btn-ghost btn-sm"
          disabled={!link}
          onClick={() => {
            if (!link) return
            const fallback = () => void copyText(link, 'Link copied')
            if (canShare) {
              navigator.share({ title, text: `Please pay your share for "${title}"`, url: link }).catch(fallback)
            } else {
              fallback()
            }
          }}
        >
          <Share2 className="size-4" aria-hidden="true" /> {canShare ? 'Share' : 'Copy link'}
        </button>
      </div>

      <button type="button" className="btn-ghost btn-sm mt-2 w-full" disabled={!link} onClick={() => setShowQr((v) => !v)} aria-expanded={showQr}>
        <QrCode className="size-4" aria-hidden="true" /> {showQr ? 'Hide QR code' : 'Show QR code'}
      </button>
      {showQr && qr ? (
        <img src={qr} alt={`QR code for the ${title} payment link`} className="mx-auto mt-3 size-48 rounded-2xl border p-2" style={{ borderColor: 'var(--border)' }} />
      ) : null}
    </section>
  )
}
