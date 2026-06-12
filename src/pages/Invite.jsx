import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Invite() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const email = searchParams.get('email') || ''
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!email) {
      navigate('/login')
    }
  }, [email, navigate])

  async function handleSignup(e) {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    const { data, error: err } = await supabase.auth.signUp({ email, password })

    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    if (data.user) {
      // Auto-link logic happens in the user creation
      await autoLinkToEstate(data.user)
    }

    setLoading(false)
    navigate('/dashboard')
  }

  async function autoLinkToEstate(user) {
    // Check for pending invites with this email
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
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Estate Admin</h1>
          <p className="text-sm text-gray-500 mt-1">You've been invited — create your account</p>
        </div>
        <form onSubmit={handleSignup} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4 shadow-sm">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              disabled
              className="w-full border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
            />
            <div className="text-xs text-gray-400 mt-1">This is your invitation email</div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              placeholder="At least 6 characters"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>

          <div className="text-xs text-gray-400 text-center pt-2">
            Your account will be automatically linked to the invited estate.
          </div>
        </form>
      </div>
    </div>
  )
}
