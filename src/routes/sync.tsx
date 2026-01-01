import { createRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Route as rootRoute } from './__root'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Cloud, Check, AlertCircle } from 'lucide-react'
import { initDB, upsertContactByGoogleId, setSetting, getSetting } from '@/lib/db'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sync',
  component: Sync,
})

// You need to replace this with your Google OAuth Client ID
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

interface GoogleContact {
  resourceName: string
  names?: Array<{ displayName: string }>
  emailAddresses?: Array<{ value: string }>
  phoneNumbers?: Array<{ value: string }>
  photos?: Array<{ url: string }>
}

function Sync() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<'idle' | 'authenticating' | 'fetching' | 'importing' | 'done' | 'error'>('idle')
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<string | null>(null)

  useEffect(() => {
    initDB().then(() => {
      const syncTime = getSetting('last_sync_at')
      if (syncTime) {
        setLastSync(new Date(parseInt(syncTime)).toLocaleString())
      }
    })
  }, [])

  const syncMutation = useMutation({
    mutationFn: async () => {
      await initDB()

      if (!GOOGLE_CLIENT_ID) {
        throw new Error('Google Client ID not configured. Set VITE_GOOGLE_CLIENT_ID in your .env file.')
      }

      setStatus('authenticating')

      // Initialize Google OAuth
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/contacts.readonly',
        callback: () => {}, // Will be set in promise
      })

      // Get access token
      const accessToken = await new Promise<string>((resolve, reject) => {
        tokenClient.callback = (response) => {
          if (response.error) {
            reject(new Error(response.error))
          } else {
            resolve(response.access_token)
          }
        }
        tokenClient.requestAccessToken()
      })

      setStatus('fetching')

      // Fetch contacts from Google People API
      let allContacts: GoogleContact[] = []
      let nextPageToken: string | undefined

      do {
        const url = new URL('https://people.googleapis.com/v1/people/me/connections')
        url.searchParams.set('personFields', 'names,emailAddresses,phoneNumbers,photos')
        url.searchParams.set('pageSize', '1000')
        if (nextPageToken) {
          url.searchParams.set('pageToken', nextPageToken)
        }

        const response = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch contacts: ${response.statusText}`)
        }

        const data = await response.json()
        allContacts = allContacts.concat(data.connections || [])
        nextPageToken = data.nextPageToken
      } while (nextPageToken)

      setStatus('importing')
      setProgress({ current: 0, total: allContacts.length })

      // Import contacts
      for (let i = 0; i < allContacts.length; i++) {
        const gc = allContacts[i]
        const name = gc.names?.[0]?.displayName
        if (!name) continue

        upsertContactByGoogleId({
          google_id: gc.resourceName,
          name,
          email: gc.emailAddresses?.[0]?.value || null,
          phone: gc.phoneNumbers?.[0]?.value || null,
          photo_url: gc.photos?.[0]?.url || null,
          tag_id: null,
          last_checkin_at: null,
        })

        setProgress({ current: i + 1, total: allContacts.length })
      }

      // Save sync timestamp
      setSetting('last_sync_at', String(Date.now()))

      setStatus('done')
      return allContacts.length
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      queryClient.invalidateQueries({ queryKey: ['dueContacts'] })
    },
    onError: (err) => {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Unknown error')
    },
  })

  const handleSync = () => {
    setError(null)
    syncMutation.mutate()
  }

  return (
    <div className="p-4 max-w-md mx-auto space-y-6">
      {/* Header */}
      <div className="pt-4">
        <h1 className="text-2xl font-bold">Import Contacts</h1>
        <p className="text-muted-foreground">Sync your Google contacts</p>
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Google Contacts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {lastSync && (
            <p className="text-sm text-muted-foreground">
              Last synced: {lastSync}
            </p>
          )}

          {status === 'idle' && (
            <Button onClick={handleSync} className="w-full">
              Connect & Import
            </Button>
          )}

          {status === 'authenticating' && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Authenticating with Google...
            </div>
          )}

          {status === 'fetching' && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Fetching contacts...
            </div>
          )}

          {status === 'importing' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing contacts...
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                {progress.current} / {progress.total}
              </p>
            </div>
          )}

          {status === 'done' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <Check className="h-5 w-5" />
                Import complete!
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleSync}
                >
                  Sync Again
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => navigate({ to: '/contacts' })}
                >
                  View Contacts
                </Button>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                {error}
              </div>
              <Button onClick={handleSync} className="w-full">
                Try Again
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground space-y-2">
          <p>This will:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Connect to your Google account</li>
            <li>Import your contacts (names, emails, phones)</li>
            <li>Store everything locally on this device</li>
          </ul>
          <p className="pt-2">Your data never leaves your device.</p>
        </CardContent>
      </Card>
    </div>
  )
}

// Google Identity Services types
declare global {
  interface Window {
    google: typeof google
  }
  const google: {
    accounts: {
      oauth2: {
        initTokenClient: (config: {
          client_id: string
          scope: string
          callback: (response: { access_token: string; error?: string }) => void
        }) => {
          requestAccessToken: () => void
          callback: (response: { access_token: string; error?: string }) => void
        }
      }
    }
  }
}
