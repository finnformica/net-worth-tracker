interface GsiTokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

interface GsiTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void
}

interface GsiTokenClientConfig {
  client_id: string
  scope: string
  callback: (response: GsiTokenResponse) => void
  error_callback?: (err: { type?: string; message?: string }) => void
}

declare const google: {
  accounts: {
    oauth2: {
      initTokenClient: (config: GsiTokenClientConfig) => GsiTokenClient
      revoke: (accessToken: string, callback?: () => void) => void
    }
  }
}
