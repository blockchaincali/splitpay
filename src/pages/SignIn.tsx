import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Mail } from 'lucide-react'
import { api, ApiError } from '@/api/client'
import { useSession } from '@/account/SessionProvider'
import { navigate, useLocation } from '@/lib/router'
import { Notice, Spinner } from '@/components/ui'

interface OutboxRes {
  messages: { id: number; subject: string; body: string }[]
}

export function SignIn() {
  const { user, refresh } = useSession()
  const { search } = useLocation()
  const next = search.get('next') && search.get('next')!.startsWith('/') ? search.get('next')! : '/dashboard'
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [delivery, setDelivery] = useState<string>('')

  const outbox = useQuery({
    queryKey: ['outbox', email],
    queryFn: () => api.get<OutboxRes>(`/dev/outbox?email=${encodeURIComponent(email)}`),
    enabled: step === 'code' && delivery === 'dev-outbox',
    retry: false,
  })
  const devCode = /(\d{6})/.exec(outbox.data?.messages[0]?.body ?? '')?.[1]

  if (user) {
    return (
      <div className="card mx-auto max-w-md text-center">
        <h1 className="display text-2xl font-bold">You are signed in</h1>
        <p className="mt-2" style={{ color: 'var(--ink-2)' }}>{user.email}</p>
        <button type="button" className="btn-primary mt-4" onClick={() => navigate(next)}>Continue</button>
      </div>
    )
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-md gap-5">
      <div>
        <h1 className="display text-3xl font-bold">{step === 'email' ? 'Sign in or create an account' : 'Check your email'}</h1>
        <p className="hint">
          {step === 'email'
            ? 'Your account keeps your groups and invitations on every device. Your wallet stays yours.'
            : `We sent a 6-digit code to ${email}. It expires in 10 minutes.`}
        </p>
      </div>

      <form
        className="card grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            if (step === 'email') {
              const r = await api.post<{ delivery: string }>('/auth/email/start', { email })
              setDelivery(r.delivery)
              setStep('code')
            } else {
              await api.post('/auth/email/verify', { email, code })
              await refresh()
              navigate(next)
            }
          })
        }}
      >
        {step === 'email' ? (
          <div>
            <label className="label" htmlFor="email">Email address</label>
            <input id="email" type="email" className="input" autoComplete="email" inputMode="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        ) : (
          <>
            <div>
              <label className="label" htmlFor="code">6-digit code</label>
              <input id="code" className="input display text-2xl tracking-widest tabular-nums" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            </div>
            {delivery === 'dev-outbox' ? (
              <Notice tone="warn" title="Development mode: no email is sent">
                {devCode ? (
                  <>Your code is <strong className="mono tabular-nums">{devCode}</strong>. <button type="button" className="underline" onClick={() => setCode(devCode)}>Use it</button></>
                ) : (
                  'Looking for your code…'
                )}
              </Notice>
            ) : null}
          </>
        )}
        {error ? <p className="error-text" role="alert">{error}</p> : null}
        <button type="submit" className="btn-primary" disabled={busy || (step === 'code' && code.length !== 6)}>
          {busy ? <Spinner /> : <Mail className="size-4" aria-hidden="true" />} {step === 'email' ? 'Email me a code' : 'Verify and continue'}
        </button>
        {step === 'code' ? (
          <button type="button" className="btn-ghost" onClick={() => { setStep('email'); setCode(''); setError(null) }}>Use a different email</button>
        ) : null}
      </form>

    </div>
  )
}
