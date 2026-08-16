const PKCE_VERIFIER_KEY = 'autobook.pkce_verifier'
const OAUTH_STATE_KEY = 'autobook.oauth_state'
const TOKENS_KEY = 'autobook.tokens'

const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID
const domain = import.meta.env.VITE_COGNITO_DOMAIN?.replace(/\/$/, '')
const redirectUri = import.meta.env.VITE_COGNITO_REDIRECT_URI

export interface CognitoTokens {
  access_token: string
  id_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

let callbackExchange: Promise<CognitoTokens> | undefined
let authorizationRequest: Promise<void> | undefined
let expiredSessionRecoveryStarted = false

const expiredSessionListeners = new Set<() => void>()

function requireConfiguration() {
  if (!clientId || !domain || !redirectUri) {
    throw new Error('Cognito environment variables are not configured.')
  }
}

function randomBase64Url(byteLength: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  return base64UrlEncode(bytes)
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function createCodeChallenge(verifier: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  )

  return base64UrlEncode(new Uint8Array(digest))
}

export function beginSignIn() {
  authorizationRequest ??= performBeginSignIn()
  return authorizationRequest
}

async function performBeginSignIn() {
  requireConfiguration()

  const verifier = randomBase64Url(64)
  const state = randomBase64Url(32)
  const challenge = await createCodeChallenge(verifier)

  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier)
  sessionStorage.setItem(OAUTH_STATE_KEY, state)

  const authorizeUrl = new URL(`${domain}/oauth2/authorize`)
  authorizeUrl.search = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'openid email',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  }).toString()

  window.location.assign(authorizeUrl)
}

export function exchangeAuthorizationCode(code: string, state: string | null) {
  callbackExchange ??= performCodeExchange(code, state)
  return callbackExchange
}

async function performCodeExchange(code: string, state: string | null) {
  requireConfiguration()

  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY)
  const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY)

  if (!verifier) {
    throw new Error('The sign-in session has expired. Please sign in again.')
  }

  if (!state || !expectedState || state !== expectedState) {
    throw new Error('The sign-in response could not be verified.')
  }

  const response = await fetch(`${domain}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  })

  if (!response.ok) {
    throw new Error('Cognito could not complete the sign-in request.')
  }

  const tokens = (await response.json()) as CognitoTokens
  sessionStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
  sessionStorage.removeItem(PKCE_VERIFIER_KEY)
  sessionStorage.removeItem(OAUTH_STATE_KEY)

  return tokens
}

export function hasStoredTokens() {
  return sessionStorage.getItem(TOKENS_KEY) !== null
}

export function getStoredAccessToken() {
  const storedTokens = sessionStorage.getItem(TOKENS_KEY)

  if (!storedTokens) {
    return null
  }

  try {
    const tokens = JSON.parse(storedTokens) as Partial<CognitoTokens>
    return typeof tokens.access_token === 'string' ? tokens.access_token : null
  } catch {
    return null
  }
}

export function removeOAuthParameters() {
  const url = new URL(window.location.href)
  url.searchParams.delete('code')
  url.searchParams.delete('state')
  window.history.replaceState({}, document.title, url)
}

export function clearStoredAuthentication() {
  for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = sessionStorage.key(index)

    if (key?.startsWith('autobook.')) {
      sessionStorage.removeItem(key)
    }
  }
}

export function subscribeToExpiredSession(listener: () => void) {
  expiredSessionListeners.add(listener)

  return () => {
    expiredSessionListeners.delete(listener)
  }
}

export function recoverFromExpiredSession() {
  if (
    expiredSessionRecoveryStarted ||
    new URLSearchParams(window.location.search).has('code')
  ) {
    return
  }

  expiredSessionRecoveryStarted = true
  clearStoredAuthentication()
  expiredSessionListeners.forEach((listener) => listener())
  void beginSignIn().catch(() => {
    expiredSessionRecoveryStarted = false
  })
}

export function signOut() {
  clearStoredAuthentication()

  requireConfiguration()

  const logoutUrl = new URL(`${domain}/logout`)
  logoutUrl.search = new URLSearchParams({
    client_id: clientId,
    logout_uri: redirectUri,
  }).toString()

  window.location.assign(logoutUrl)
}
