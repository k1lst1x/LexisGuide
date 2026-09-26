import { Suspense, lazy } from 'react'
import App from './App'
import { isAdminPath } from './admin/route'
import { reloadForNewBuild } from './staleBuild'

// The admin portal is its own screen with its own sign-in; visitors never download it.
// A page opened before a deploy can ask for a file that no longer exists;
// reloading once fetches the current build.
const AdminPortal = lazy(() => import('./admin/AdminPortal').catch((error: unknown) => {
  if (reloadForNewBuild()) return new Promise<never>(() => {})
  throw error
}))

export function Root() {
  if (!isAdminPath()) return <App />
  return (
    <Suspense fallback={null}>
      <AdminPortal />
    </Suspense>
  )
}
