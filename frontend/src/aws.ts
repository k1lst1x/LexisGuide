import { Amplify } from 'aws-amplify'

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
