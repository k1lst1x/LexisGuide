/* Shared by the main app and the admin portal, so neither bundle pulls in the other. */

/** Set before a Google sign-in started from the portal, so the callback returns there. */
export const RETURN_TO_ADMIN_KEY = 'lexisguide:return-to-admin'

export const adminPath = () => `${import.meta.env.BASE_URL}admin`

export const isAdminPath = (pathname = window.location.pathname) =>
  pathname.replace(/\/+$/, '') === adminPath()
