import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { Menu, Plus, X } from 'lucide-react'
import { navigate, useLocation } from '@/lib/router'
import { NAV_ITEMS, ROUTE, goToSection, hrefFor, type NavItem } from '@/lib/siteLinks'
import { Logo } from './Brand'

const plainClick = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey

/** A real link that keeps working in a new tab, but navigates inside the app (and scrolls to sections) on a normal click. */
export function NavAnchor({ to, className, children, onNavigate }: { to: NavItem['to']; className?: string; children: ReactNode; onNavigate?: () => void }) {
  const { path } = useLocation()
  const active = 'route' in to && path === to.route
  return (
    <a
      href={hrefFor(to)}
      className={className}
      aria-current={active ? 'page' : undefined}
      onClick={(e) => {
        if (!plainClick(e)) return
        e.preventDefault()
        if ('route' in to) navigate(to.route)
        else goToSection(to.section, path)
        onNavigate?.()
      }}
    >
      {children}
    </a>
  )
}

const linkClass = 'inline-flex min-h-[44px] items-center rounded-xl px-3 text-sm font-semibold hover:bg-[var(--surface-muted)] aria-[current=page]:bg-[var(--surface-muted)]'

/**
 * Sticky site header. Desktop: brand, section links, wallet button and a prominent call to action.
 * Mobile: brand, compact wallet button and a menu button (disclosure pattern: aria-expanded + aria-controls,
 * Escape and outside click close it, and it closes after a choice, a route change, or growing to desktop width).
 */
export function SiteHeader({ wallet, walletCompact, extraItem }: { wallet: ReactNode; walletCompact: ReactNode; extraItem?: { route: string; label: string } }) {
  // The menu is open only for the page it was opened on, so any navigation closes it without an effect.
  const { path } = useLocation()
  const [openPath, setOpenPath] = useState<string | null>(null)
  const open = openPath === path
  const setOpen = (v: boolean) => setOpenPath(v ? path : null)
  const headerRef = useRef<HTMLElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = () => mq.matches && setOpenPath(null)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpenPath(null)
      buttonRef.current?.focus()
    }
    const onPointer = (e: PointerEvent) => {
      if (!headerRef.current?.contains(e.target as Node)) setOpenPath(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  const close = () => setOpenPath(null)

  return (
    <header ref={headerRef} className="sticky top-0 z-40 border-b backdrop-blur" style={{ borderColor: 'var(--border)', background: 'rgba(245,248,252,0.92)' }}>
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2.5">
        <a
          href={ROUTE.home}
          onClick={(e) => {
            if (!plainClick(e)) return
            e.preventDefault()
            navigate(ROUTE.home)
          }}
          className="flex min-h-[44px] items-center gap-2"
          aria-label="SplitPay home"
        >
          <Logo />
          <span className="display text-xl font-bold">SplitPay</span>
        </a>

        <nav aria-label="Main" className="ml-4 hidden items-center gap-1 lg:flex">
          {NAV_ITEMS.map((item) => (
            <NavAnchor key={item.label} to={item.to} className={linkClass}>
              {item.label}
            </NavAnchor>
          ))}
          {extraItem ? (
            <NavAnchor to={{ route: extraItem.route }} className={linkClass}>
              {extraItem.label}
            </NavAnchor>
          ) : null}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden lg:block">{wallet}</div>
          <NavAnchor to={{ route: ROUTE.create }} className="btn-primary btn-sm hidden lg:inline-flex">
            <Plus className="size-4" aria-hidden="true" /> Create a group
          </NavAnchor>
          <div className="lg:hidden">{walletCompact}</div>
          <button
            ref={buttonRef}
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-xl border bg-white lg:hidden"
            style={{ borderColor: 'var(--border)' }}
            aria-label="Menu"
            aria-expanded={open}
            aria-controls="site-menu"
            onClick={() => setOpen(!open)}
          >
            {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* An overlay under the header: opening or closing it never moves the page, so scrolling to a section stays exact. */}
      <nav
        id="site-menu"
        aria-label="Main menu"
        hidden={!open}
        className="absolute inset-x-0 top-full max-h-[calc(100dvh-64px)] overflow-y-auto border-b bg-white shadow-lg lg:hidden"
        style={{ borderColor: 'var(--border)' }}
      >
        <ul className="mx-auto grid max-w-5xl gap-1 px-4 py-3">
          {NAV_ITEMS.map((item) => (
            <li key={item.label}>
              <NavAnchor to={item.to} className={`${linkClass} w-full !min-h-[48px] text-base`} onNavigate={close}>
                {item.label}
              </NavAnchor>
            </li>
          ))}
          {extraItem ? (
            <li>
              <NavAnchor to={{ route: extraItem.route }} className={`${linkClass} w-full !min-h-[48px] text-base`} onNavigate={close}>
                {extraItem.label}
              </NavAnchor>
            </li>
          ) : null}
          <li className="pt-2">
            <NavAnchor to={{ route: ROUTE.create }} className="btn-primary" onNavigate={close}>
              <Plus className="size-4" aria-hidden="true" /> Create a group
            </NavAnchor>
          </li>
        </ul>
      </nav>
    </header>
  )
}
