/* After a deploy, GitHub Pages serves only the new build's files. A tab opened
   before it (or a page cached for a few minutes) still asks for the old ones,
   and those requests fail. These helpers turn that into a clear message, or a
   single reload where nothing would be lost. */

export const STALE_BUILD_MESSAGE = 'LexisGuide was just updated. Refresh the page, then try again.'

const RELOAD_KEY = 'lexisguide:stale-build-reload'

export class StaleBuildError extends Error {
  constructor() {
    super(STALE_BUILD_MESSAGE)
    this.name = 'StaleBuildError'
  }
}

export const isStaleBuildMessage = (message: string) => message === STALE_BUILD_MESSAGE

/** Load a code-split module, reporting a missing file as an outdated page. */
export async function loadModule<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load()
  } catch {
    throw new StaleBuildError()
  }
}

/** Reload once to pick up the new build. A second failure soon after is not a
    stale page, so it is left to surface rather than reloading in a loop. */
export function reloadForNewBuild(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) || 0)
    if (Date.now() - last < 30_000) return false
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    return false
  }
  window.location.reload()
  return true
}
