import { Suspense, lazy } from 'react'
import App from './App'
import { isAdminPath } from './admin/route'

// The admin portal is its own screen with its own sign-in; visitors never download it.
const AdminPortal = lazy(() => import('./admin/AdminPortal'))

export function Root() {
  if (!isAdminPath()) return <App />
  return (
    <Suspense fallback={null}>
      <AdminPortal />
    </Suspense>
  )
}
