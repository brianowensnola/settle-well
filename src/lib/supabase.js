import { createClient } from '@supabase/supabase-js'

const url = 'https://gwdklxihiniljvielhhn.supabase.co'
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3ZGtseGloaW5pbGp2aWVsaGhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExODczMTksImV4cCI6MjA5Njc2MzMxOX0.x-ru9FlujxwjAYoYyOZJRfjLWbeq9EBAISiPkKn5ZPo'

export const supabase = createClient(url, key)

// Returns a valid access token for calling our Netlify functions, refreshing
// the session first if it's missing or about to expire. Avoids "invalid
// session (401)" errors when a tab has been open long enough for the cached
// token to go stale. Throws if the user isn't signed in.
export async function getAccessToken() {
  let { data: { session } } = await supabase.auth.getSession()
  const expiresInMs = session?.expires_at ? session.expires_at * 1000 - Date.now() : -1
  if (!session || expiresInMs < 60_000) {
    const { data } = await supabase.auth.refreshSession()
    if (data?.session) session = data.session
  }
  if (!session?.access_token) throw new Error('Your session expired — please sign in again.')
  return session.access_token
}
