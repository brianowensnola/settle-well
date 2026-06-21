import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [mode, setMode] = useState('login') // login | signup
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [logoOk, setLogoOk] = useState(true)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    if (mode === 'login') {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password })
      if (err) setError(err.message)
    } else {
      const { data, error: err } = await supabase.auth.signUp({ email, password })
      if (err) {
        setError(err.message)
      } else if (data.user) {
        // Auto-link to any estate where this email is the administrator
        await autoLinkToEstate(data.user)
        setMessage('Account created. You can now sign in.')
        setMode('login')
      }
    }
    setLoading(false)
  }

  async function autoLinkToEstate(user) {
    // Link any pending invite (estate_users row by email, not yet claimed) to
    // this login. Estate creation grants admin via the claim_new_estate_admin
    // RPC, so there's no client-side self-insert here.
    const { data: pending } = await supabase
      .from('estate_users')
      .select('id, estate_id, role')
      .eq('email', user.email)
      .is('auth_user_id', null)

    if (pending && pending.length > 0) {
      for (const record of pending) {
        // Link this pending record to the auth user
        await supabase.from('estate_users').update({ auth_user_id: user.id }).eq('id', record.id)
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#fafaf8' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {logoOk
            ? <img src="/logo.png" alt="SettleWell" className="h-28 mx-auto mb-1" onError={() => setLogoOk(false)} />
            : <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">SettleWell</h1>}
          <p className="text-sm text-gray-500 mt-1">{mode === 'login' ? 'Sign in to continue' : 'Create your account'}</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4 shadow-sm">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
          )}
          {message && (
            <div className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">{message}</div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {loading ? '...' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
          <button
            type="button"
            onClick={() => { setMode(m => m === 'login' ? 'signup' : 'login'); setError(''); setMessage('') }}
            className="w-full text-xs text-gray-400 hover:text-gray-600 dark:text-gray-400 pt-1"
          >
            {mode === 'login' ? 'First time? Create an account' : 'Already have an account? Sign in'}
          </button>
        </form>
        <p className="text-center text-[11px] text-gray-400 mt-4 leading-relaxed">
          SettleWell is not a law firm and does not provide legal advice.<br />
          <a href="/privacy" className="hover:underline">Privacy Policy</a>
        </p>
      </div>
    </div>
  )
}
