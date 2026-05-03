import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface Props {
  gsiReady: boolean
  authError: string | null
  onSignIn: () => void
}

export function SignIn({ gsiReady, authError, onSignIn }: Props) {
  return (
    <div className="min-h-svh flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Net Worth Tracker
          </h1>
          <p className="text-sm text-muted-foreground">
            Access is restricted to authorised users only.
          </p>
        </div>

        {authError && (
          <Alert variant="destructive" className="text-left">
            <AlertTitle>Sign-in failed</AlertTitle>
            <AlertDescription>{authError}</AlertDescription>
          </Alert>
        )}

        <Button
          className="w-full"
          size="lg"
          onClick={onSignIn}
          disabled={!gsiReady}
        >
          {gsiReady ? 'Sign in with Google' : 'Loading…'}
        </Button>
      </div>
    </div>
  )
}
