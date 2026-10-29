import { IS_MAINNET } from './deployment'
import { navigate } from './router'

/** Ids of the landing-page sections. The nav, footer and Home all use these, so a link can never point at a missing section. */
export const SECTION = {
  how: 'how-it-works',
  features: 'features',
  testnet: 'testnet',
} as const
export type SectionId = (typeof SECTION)[keyof typeof SECTION]

/** Real routes of the app (see src/App.tsx). */
export const ROUTE = {
  home: '/',
  create: '/new',
  groups: '/dashboard',
} as const

export const REPO_URL = 'https://github.com/blockchaincali/splitpay'
export const DOCS_URL = `${REPO_URL}/tree/main/docs`
export const SECURITY_REVIEW_URL = `${REPO_URL}/blob/main/docs/SECURITY_REVIEW.md`

export interface NavItem {
  label: string
  /** An app route, or a section on the home page. */
  to: { route: string } | { section: SectionId }
}

/** Header links, in order. The footer reuses them. */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'How it works', to: { section: SECTION.how } },
  { label: 'Features', to: { section: SECTION.features } },
  { label: IS_MAINNET ? 'Network' : 'Testnet', to: { section: SECTION.testnet } },
  { label: 'My groups', to: { route: ROUTE.groups } },
]

export const hrefFor = (to: NavItem['to']): string => ('route' in to ? to.route : `/#${to.section}`)

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Scroll to a section, move keyboard focus there, and keep the URL shareable. Returns false if the section is not on the page. */
export function scrollToSection(id: SectionId, opts: { updateUrl?: boolean } = {}): boolean {
  const el = document.getElementById(id)
  if (!el) return false
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  el.focus({ preventScroll: true })
  if (opts.updateUrl !== false) window.history.replaceState(null, '', `/#${id}`)
  return true
}

/** From any page: go home if needed, then scroll to the section once it has rendered. */
export function goToSection(id: SectionId, currentPath: string): void {
  if (currentPath === ROUTE.home) {
    scrollToSection(id)
    return
  }
  navigate(ROUTE.home)
  let tries = 0
  const wait = () => {
    if (scrollToSection(id) || ++tries > 30) return
    requestAnimationFrame(wait)
  }
  requestAnimationFrame(wait)
}
