import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ConfirmEmail() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('confirming')
  const [message, setMessage] = useState('Confirming your email...')

  useEffect(() => {
    const confirmEmail = async () => {
      const token = searchParams.get('token')
      const type = searchParams.get('type')

      if (!token || type !== 'email') {
        setStatus('error')
        setMessage('Invalid confirmation link.')
        return
      }

      try {
        const { error } = await supabase.auth.verifyOtp({ token_hash: token, type: 'email' })

        if (error) {
          setStatus('error')
          setMessage(error.message || 'Failed to confirm email.')
          return
        }

        setStatus('success')
        setMessage('Email confirmed! Redirecting...')
        setTimeout(() => navigate('/login'), 2000)
      } catch (err) {
        setStatus('error')
        setMessage('An error occurred. Please try again.')
      }
    }

    confirmEmail()
  }, [searchParams, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#fafaf8' }}>
      <div className="w-full max-w-sm">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-gray-900 mb-4">Estate Admin</h1>
          <div className={`p-6 rounded-xl border ${
            status === 'confirming' ? 'bg-white border-gray-200' :
            status === 'success' ? 'bg-green-50 border-green-200' :
            'bg-red-50 border-red-200'
          }`}>
            <p className={`text-sm ${
              status === 'success' ? 'text-green-700' :
              status === 'error' ? 'text-red-700' :
              'text-gray-700'
            }`}>
              {message}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
