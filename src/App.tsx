import { useCallback, useEffect, useState } from 'react'
import { LogOut, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { SummaryCards } from '@/components/SummaryCards'
import { NetWorthChart } from '@/components/NetWorthChart'
import { BreakdownTable } from '@/components/BreakdownTable'
import { SignIn } from '@/components/SignIn'
import {
  AuthExpiredError,
  fetchAll,
  type DashboardData,
} from '@/lib/sheets'
import { formatLongDate } from '@/lib/formatting'
import { useAuth } from '@/hooks/useAuth'

function App() {
  const { accessToken, isAuthenticated, gsiReady, authError, signIn, signOut, invalidateToken } =
    useAuth()

  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(
    async (token: string) => {
      setLoading(true)
      setError(null)
      try {
        const result = await fetchAll(token)
        if (result.config.length === 0) {
          throw new Error(
            'Config sheet has no active integrations. Add rows with Active = TRUE before loading the dashboard.',
          )
        }
        setData(result)
      } catch (err) {
        if (err instanceof AuthExpiredError) {
          invalidateToken()
          return
        }
        setError(err instanceof Error ? err.message : String(err))
        setData(null)
      } finally {
        setLoading(false)
      }
    },
    [invalidateToken],
  )

  useEffect(() => {
    if (!accessToken) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(null)
      return
    }
    void load(accessToken)
  }, [accessToken, load])

  if (!isAuthenticated) {
    return (
      <div className="dark min-h-svh bg-background text-foreground">
        <SignIn gsiReady={gsiReady} authError={authError} onSignIn={signIn} />
      </div>
    )
  }

  const lastUpdated = data?.snapshots.at(-1)?.date

  return (
    <div className="dark min-h-svh bg-background text-foreground">
      <main className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Net Worth Tracker
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {loading
                ? 'Loading…'
                : lastUpdated
                  ? `Last updated: ${formatLongDate(lastUpdated)}`
                  : 'No data loaded'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => accessToken && load(accessToken)}
              disabled={loading || !accessToken}
            >
              <RefreshCw className={loading ? 'animate-spin' : undefined} />
              Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut />
              Sign out
            </Button>
          </div>
        </header>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Failed to load dashboard</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading && !data && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </div>
            <Skeleton className="h-[500px]" />
            <Skeleton className="h-64" />
          </div>
        )}

        {data && (
          <>
            <SummaryCards snapshots={data.snapshots} config={data.config} />
            <NetWorthChart
              snapshots={data.snapshots}
              events={data.events}
              config={data.config}
            />
            <BreakdownTable snapshots={data.snapshots} config={data.config} />
          </>
        )}
      </main>
    </div>
  )
}

export default App
