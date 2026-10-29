import { STUDIO_ORIGINS } from './share'

const originOf = (url: string) => {
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}

/**
 * True only when the page's direct parent is an Arc Studio origin.
 * `ancestorOrigins` is authoritative where it exists (Chromium, Safari); the referrer is used only where the
 * browser does not provide it (Firefox). Any other parent, or no parent at all, is not Studio.
 */
export function parentIsArcStudio(ancestorOrigins: ArrayLike<string> | undefined, referrer = ''): boolean {
  const parent = ancestorOrigins && ancestorOrigins.length > 0 ? ancestorOrigins[0] : originOf(referrer)
  return STUDIO_ORIGINS.includes(parent)
}

/**
 * Studio's trace and console capture hook fetch, console and window.ethereum. That is for the Studio preview
 * only: a deployed site opened by visitors (or framed by an unrelated page) must never run it.
 */
export function isEmbeddedInArcStudio(): boolean {
  try {
    if (window.self === window.top) return false
    return parentIsArcStudio(window.location.ancestorOrigins, document.referrer)
  } catch {
    return false
  }
}
