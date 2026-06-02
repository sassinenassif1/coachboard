export type FitnessProvider = 'strava' | 'whoop'

interface ProviderConfig {
  authorizeUrl: string
  tokenUrl: string
  clientIdEnv: string
  clientSecretEnv: string
  scope: string
}

export interface OAuthTokenResponse {
  access_token: string
  refresh_token?: string
  expires_at?: number
  expires_in?: number
  scope?: string
  athlete?: { id?: number }
}

const PROVIDERS: Record<FitnessProvider, ProviderConfig> = {
  strava: {
    authorizeUrl: 'https://www.strava.com/oauth/authorize',
    tokenUrl: 'https://www.strava.com/oauth/token',
    clientIdEnv: 'STRAVA_CLIENT_ID',
    clientSecretEnv: 'STRAVA_CLIENT_SECRET',
    scope: 'read,activity:read_all,profile:read_all',
  },
  whoop: {
    authorizeUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
    tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
    clientIdEnv: 'WHOOP_CLIENT_ID',
    clientSecretEnv: 'WHOOP_CLIENT_SECRET',
    scope: 'offline read:profile read:workout read:sleep read:recovery',
  },
}

export function isFitnessProvider(value: string): value is FitnessProvider {
  return value === 'strava' || value === 'whoop'
}

export function getProviderLabel(provider: FitnessProvider) {
  return provider === 'strava' ? 'Strava' : 'WHOOP'
}

export function getProviderCredentials(provider: FitnessProvider) {
  const config = PROVIDERS[provider]
  const clientId = process.env[config.clientIdEnv]
  const clientSecret = process.env[config.clientSecretEnv]

  if (!clientId || !clientSecret) {
    throw new Error(`${getProviderLabel(provider)} OAuth is missing ${config.clientIdEnv} or ${config.clientSecretEnv}`)
  }

  return { clientId, clientSecret }
}

export function buildRedirectUri(origin: string, provider: FitnessProvider) {
  return `${origin}/api/oauth/${provider}/callback`
}

export function buildAuthorizationUrl(provider: FitnessProvider, origin: string, state: string) {
  const config = PROVIDERS[provider]
  const { clientId } = getProviderCredentials(provider)
  const url = new URL(config.authorizeUrl)

  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', buildRedirectUri(origin, provider))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', config.scope)
  url.searchParams.set('state', state)

  if (provider === 'strava') {
    url.searchParams.set('approval_prompt', 'auto')
  }

  return url
}

export async function exchangeCodeForToken(
  provider: FitnessProvider,
  code: string,
  origin: string
): Promise<OAuthTokenResponse> {
  const config = PROVIDERS[provider]
  const { clientId, clientSecret } = getProviderCredentials(provider)
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
  })

  if (provider === 'whoop') {
    body.set('redirect_uri', buildRedirectUri(origin, provider))
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) {
    throw new Error(`${getProviderLabel(provider)} token exchange failed: ${await response.text()}`)
  }

  return response.json()
}

export async function refreshAccessToken(
  provider: FitnessProvider,
  refreshToken: string
): Promise<OAuthTokenResponse> {
  const config = PROVIDERS[provider]
  const { clientId, clientSecret } = getProviderCredentials(provider)
  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      ...(provider === 'whoop' ? { scope: 'offline' } : {}),
    }),
  })

  if (!response.ok) {
    throw new Error(`${getProviderLabel(provider)} token refresh failed: ${await response.text()}`)
  }

  return response.json()
}

export function getTokenExpiry(token: OAuthTokenResponse) {
  if (token.expires_at) return new Date(token.expires_at * 1000).toISOString()
  if (token.expires_in) return new Date(Date.now() + token.expires_in * 1000).toISOString()
  return null
}
