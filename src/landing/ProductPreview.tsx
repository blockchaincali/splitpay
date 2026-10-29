import { useRef, useState, type CSSProperties } from 'react'
import { FlaskConical, Pause, Play } from 'lucide-react'
import { SCENES } from './PreviewScenes'
import { useInView, usePageVisible, usePrefersReducedMotion } from './hooks'

/** How long each of the five scenes plays before the walkthrough moves on. */
export const STEP_MS = 7000

export const PREVIEW_STEPS = [
  { id: 'create', title: 'Create a group', text: 'The organiser names the expense and enters the total to collect.' },
  { id: 'split', title: 'Choose the split', text: 'Split it equally, or set each person’s amount. Custom shares must add up to the total.' },
  { id: 'connect', title: 'Connect a wallet', text: 'Connect your own wallet and create the group. Creating it is one transaction and moves no money.' },
  { id: 'share', title: 'Share the group', text: 'Copy the link, send it on WhatsApp, or show a QR code.' },
  { id: 'track', title: 'Track payments', text: 'Friends open the link and pay their share. Progress fills in as the network confirms each payment.' },
] as const

/**
 * A looping, self-contained walkthrough of the real user journey, drawn with sample data.
 * It never connects a wallet, requests a signature, sends a transaction or touches the network.
 *
 * The step change is driven by the progress bar's own CSS animation (onAnimationEnd), so what you see and when it advances
 * cannot drift apart. Everything pauses while it is off screen, while the tab is in the background, and when the visitor
 * pauses it. With prefers-reduced-motion it does not play by itself at all: each scene shows its finished state and the
 * visitor moves between steps with the numbered buttons.
 */
export function ProductPreview() {
  const reduced = usePrefersReducedMotion()
  const [step, setStep] = useState(0)
  const [paused, setPaused] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const inView = useInView(stageRef)
  const visible = usePageVisible()
  const running = !reduced && !paused && inView && visible

  const Scene = SCENES[step]
  const current = PREVIEW_STEPS[step]
  const next = () => setStep((s) => (s + 1) % PREVIEW_STEPS.length)

  return (
    <div className="card !p-0 overflow-hidden">
      <div className="grid lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
        {/* Steps */}
        <div className="order-2 border-t p-4 sm:p-5 lg:order-1 lg:border-r lg:border-t-0 lg:p-6" style={{ borderColor: 'var(--border)' }}>
          <ol aria-label="Walkthrough steps" className="flex justify-center gap-2 lg:grid lg:justify-stretch lg:gap-1.5">
            {PREVIEW_STEPS.map((s, i) => {
              const active = i === step
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setStep(i)}
                    aria-current={active ? 'step' : undefined}
                    className="relative flex min-h-[44px] w-full items-start gap-0 rounded-2xl p-1 text-left lg:gap-3 lg:border lg:p-3"
                    style={{ borderColor: active ? 'var(--navy)' : 'transparent', background: active ? 'var(--surface-muted)' : 'transparent' }}
                  >
                    <span
                      className="grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold"
                      style={{ background: active ? 'var(--navy)' : '#fff', color: active ? '#fff' : 'var(--ink)', border: '1px solid var(--border)' }}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 self-center">
                      <span className="sr-only block font-semibold lg:not-sr-only">{s.title}</span>
                      {active ? <span className="mt-0.5 hidden text-sm lg:block" style={{ color: 'var(--ink-2)' }}>{s.text}</span> : null}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
          <p className="mt-4 text-center text-sm lg:hidden" style={{ color: 'var(--ink-2)' }}>
            <strong style={{ color: 'var(--ink)' }}>Step {step + 1}: {current.title}.</strong> {current.text}
          </p>
        </div>

        {/* Stage */}
        <div
          ref={stageRef}
          className="demo-stage order-1 p-4 sm:p-6 lg:order-2"
          data-running={running ? 'true' : 'false'}
          style={{ '--dur': `${STEP_MS}ms`, background: 'linear-gradient(160deg, #e6effa 0%, #f5f8fc 70%)' } as CSSProperties}
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="chip" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>
              <FlaskConical className="size-3.5" aria-hidden="true" /> Demonstration
            </span>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              Simulated with sample data. Nothing is connected or sent.
            </span>
          </div>

          <div className="overflow-hidden rounded-2xl border bg-[var(--bg)] shadow-sm" style={{ borderColor: 'var(--border)' }} aria-hidden="true">
            <div className="flex items-center gap-1.5 border-b bg-white px-3 py-2" style={{ borderColor: 'var(--border)' }}>
              <span className="size-2.5 rounded-full bg-[#e3eaf3]" />
              <span className="size-2.5 rounded-full bg-[#e3eaf3]" />
              <span className="size-2.5 rounded-full bg-[#e3eaf3]" />
              <span className="ml-2 truncate text-xs" style={{ color: 'var(--muted)' }}>SplitPay · demonstration</span>
            </div>
            <div className="h-[520px] overflow-hidden sm:h-[490px]">
              <Scene key={step} />
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            {reduced ? (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Reduced motion is on, so this does not play by itself. Use the numbered steps.</p>
            ) : (
              <>
                <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(11,31,58,0.12)' }} aria-hidden="true">
                  <div key={step} className="demo-timer h-full rounded-full" style={{ background: 'var(--navy)' }} onAnimationEnd={next} />
                </div>
                <button type="button" className="btn-ghost btn-sm !min-h-[40px]" onClick={() => setPaused((p) => !p)}>
                  {paused ? <Play className="size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}
                  {paused ? 'Play' : 'Pause'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
