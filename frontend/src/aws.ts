import { Amplify } from 'aws-amplify'
// Completes Google sign-in when Cognito redirects back to the app.
import 'aws-amplify/auth/enable-oauth-listener'
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito'
import { defaultStorage, sessionStorage } from 'aws-amplify/utils'
import { 
  signIn, 
  signUp, 
  signInWithRedirect, 
  signOut, 
  getCurrentUser,
  fetchAuthSession,
  fetchUserAttributes,
  resetPassword,
  confirmResetPassword,
} from 'aws-amplify/auth'

// Cognito IDs are public application identifiers, but they must be supplied by
// the active deployment. Never fall back to IDs from a different AWS account.
const region = import.meta.env.VITE_AWS_REGION
const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID
const userPoolClientId = import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID
const domain = import.meta.env.VITE_COGNITO_DOMAIN
const applicationUrl = new URL(import.meta.env.BASE_URL, window.location.origin).toString().replace(/\/$/, '')
const redirectSignIn = import.meta.env.VITE_AUTH_REDIRECT_SIGN_IN ?? `${applicationUrl}/auth/callback`
const redirectSignOut = import.meta.env.VITE_AUTH_REDIRECT_SIGN_OUT ?? applicationUrl

const configuredValue = (value: string | undefined) => Boolean(value && !/example/i.test(value))
export const authConfigured = [region, userPoolId, userPoolClientId, domain].every(configuredValue)

if (authConfigured) {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,
        loginWith: {
          oauth: {
            domain,
            scopes: ['openid', 'email', 'profile'],
            redirectSignIn: [redirectSignIn],
            redirectSignOut: [redirectSignOut],
            responseType: 'code',
          },
        },
      },
    },
  })
}

// AWS Cognito Auth Handlers — NO FALLBACKS, real auth only
export async function cognitoSignIn(email: string, password: string) {
  return await signIn({
    username: email,
    password,
  })
}

export async function cognitoSignUp(email: string, password: string, name?: string) {
  return await signUp({
    username: email,
    password,
    options: {
      userAttributes: {
        email,
        ...(name ? { name } : {}),
      },
    },
  })
}

/** "Keep me signed in": remember tokens across browser restarts, or only for this tab session. */
export function setRememberDevice(remember: boolean) {
  if (!authConfigured) return
  cognitoUserPoolsTokenProvider.setKeyValueStorage(remember ? defaultStorage : sessionStorage)
}

export async function cognitoGoogleSignIn() {
  return await signInWithRedirect({
    provider: 'Google',
  })
}

export async function cognitoSignOut() {
  return await signOut()
}

export async function cognitoResetPassword(email: string) {
  return await resetPassword({ username: email })
}

export async function cognitoConfirmResetPassword(
  email: string,
  confirmationCode: string,
  newPassword: string
) {
  return await confirmResetPassword({
    username: email,
    confirmationCode,
    newPassword,
  })
}

export async function cognitoGetCurrentUser() {
  try {
    const user = await getCurrentUser()
    const session = await fetchAuthSession()
    const attributes = (await fetchUserAttributes().catch(() => ({}))) as Record<string, string>
    return {
      userId: user.userId,
      username: user.username,
      email: attributes.email || user.username,
      idToken: session.tokens?.idToken?.toString(),
    }
  } catch {
    return null
  }
}

export async function cognitoGetIdToken(forceRefresh = false) {
  try {
    const session = await fetchAuthSession({ forceRefresh })
    return session.tokens?.idToken?.toString()
  } catch {
    return undefined
  }
}
