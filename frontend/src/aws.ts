import { Amplify } from 'aws-amplify'
import { 
  signIn, 
  signUp, 
  confirmSignUp, 
  signInWithRedirect, 
  signOut, 
  getCurrentUser,
  fetchAuthSession,
  fetchUserAttributes,
  resetPassword,
  confirmResetPassword
} from 'aws-amplify/auth'

const localDefaults = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? {
      region: 'us-east-1',
      userPoolId: 'us-east-1_FBR6cI4aU',
      userPoolClientId: 'u5spvj6kd8931rbopqfcbr80k',
      domain: 'lexisguide-465083445156.auth.us-east-1.amazoncognito.com',
    }
  : undefined

const region = import.meta.env.VITE_AWS_REGION ?? localDefaults?.region
const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID ?? localDefaults?.userPoolId
const userPoolClientId = import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID ?? localDefaults?.userPoolClientId
const domain = import.meta.env.VITE_COGNITO_DOMAIN ?? localDefaults?.domain
const redirectSignIn = import.meta.env.VITE_AUTH_REDIRECT_SIGN_IN ?? `${window.location.origin}/auth/callback`
const redirectSignOut = import.meta.env.VITE_AUTH_REDIRECT_SIGN_OUT ?? window.location.origin

export const authConfigured = Boolean(region && userPoolId && userPoolClientId && domain)

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

export async function cognitoSignUp(email: string, password: string) {
  return await signUp({
    username: email,
    password,
    options: {
      userAttributes: {
        email,
      },
    },
  })
}

export async function cognitoConfirmSignUp(email: string, confirmationCode: string) {
  return await confirmSignUp({
    username: email,
    confirmationCode,
  })
}

export async function cognitoGoogleSignIn() {
  return await signInWithRedirect({
    provider: 'Google',
  })
}

export async function cognitoAppleSignIn() {
  return await signInWithRedirect({
    provider: 'Apple',
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
