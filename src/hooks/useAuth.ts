import { useCallback, useEffect, useRef, useState } from 'react'

const TOKEN_KEY = 'gsi_token'
const EXPIRY_KEY = 'gsi_token_expiry'
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

function readStoredToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY)
  const expiry = Number(localStorage.getItem(EXPIRY_KEY) ?? '0')
  if (!token || !Number.isFinite(expiry) || expiry <= Date.now()) {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EXPIRY_KEY)
    return null
  }
  return token
}

function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(EXPIRY_KEY)
}

export interface UseAuth {
  accessToken: string | null
  isAuthenticated: boolean
  gsiReady: boolean
  authError: string | null
  signIn: () => void
  signOut: () => void
  /** Clears the stored token after a 401 — caller should prompt re-auth. */
  invalidateToken: () => void
}

export function useAuth(): UseAuth {
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    readStoredToken(),
  )
  const [gsiReady, setGsiReady] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const clientRef = useRef<GsiTokenClient | null>(null)

  useEffect(() => {
    if (!CLIENT_ID) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAuthError(
        'Missing VITE_GOOGLE_CLIENT_ID — copy .env.example to .env and add your OAuth client ID.',
      )
      return
    }

    let cancelled = false
    const interval = window.setInterval(() => {
      if (cancelled) return
      if (typeof google === 'undefined' || !google.accounts?.oauth2) return

      clientRef.current = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: (response) => {
          if (response.error) {
            setAuthError(response.error_description ?? response.error)
            return
          }
          if (!response.access_token) return
          const ttlMs = (response.expires_in ?? 3600) * 1000
          const expiresAt = Date.now() + ttlMs
          localStorage.setItem(TOKEN_KEY, response.access_token)
          localStorage.setItem(EXPIRY_KEY, String(expiresAt))
          setAuthError(null)
          setAccessToken(response.access_token)
        },
        error_callback: (err) => {
          setAuthError(err.message ?? err.type ?? 'Sign-in failed')
        },
      })
      setGsiReady(true)
      window.clearInterval(interval)
    }, 100)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  const signIn = useCallback(() => {
    setAuthError(null)
    clientRef.current?.requestAccessToken()
  }, [])

  const signOut = useCallback(() => {
    clearStoredToken()
    setAccessToken(null)
  }, [])

  const invalidateToken = useCallback(() => {
    clearStoredToken()
    setAccessToken(null)
  }, [])

  return {
    accessToken,
    isAuthenticated: !!accessToken,
    gsiReady,
    authError,
    signIn,
    signOut,
    invalidateToken,
  }
}
