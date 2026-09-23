import { useCallback, useEffect, useState } from 'react'

type Loaded<T> = { data: T | null; error: string }

/** Load one admin resource. `fetcher` must be stable (wrap it in useCallback).
    State is only set once the request settles, never synchronously in the effect. */
export function useAdminData<T>(fetcher: () => Promise<T>) {
  const [state, setState] = useState<Loaded<T>>({ data: null, error: '' })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let live = true
    fetcher().then(
      (data) => { if (live) setState({ data, error: '' }) },
      (error: Error) => { if (live) setState({ data: null, error: error.message || 'The request could not be completed.' }) },
    )
    return () => { live = false }
  }, [fetcher, version])

  const reload = useCallback(() => {
    setState({ data: null, error: '' })
    setVersion((current) => current + 1)
  }, [])

  /** Reload without blanking what is on screen, e.g. after an action succeeds. */
  const refresh = useCallback(() => setVersion((current) => current + 1), [])

  const setData = useCallback((update: (current: T | null) => T | null) => {
    setState((current) => ({ ...current, data: update(current.data) }))
  }, [])

  return { data: state.data, error: state.error, reload, refresh, setData }
}

/** A short-lived status line for the result of the last action. */
export function useNotice() {
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 4000)
    return () => window.clearTimeout(timer)
  }, [notice])
  const node = notice ? <div className="adm-notice" role="status">{notice}</div> : null
  return [node, setNotice] as const
}
