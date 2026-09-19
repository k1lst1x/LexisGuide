import { Amplify } from 'aws-amplify'

const region = import.meta.env.VITE_AWS_REGION
const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID
const userPoolClientId = import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID
const domain = import.meta.env.VITE_COGNITO_DOMAIN
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
