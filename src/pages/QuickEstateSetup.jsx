import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useUser } from '../lib/AuthContext'
import { useEstate } from '../lib/EstateContext'

export default function QuickEstateSetup() {
  const navigate = useNavigate()
  const user = useUser()
  const { currentEstate, reload } = useEstate()
  const [form, setForm] = useState({
    deceased_name: '',
    deceased_dod: '',
    state_of_residence: '',
  })

  // Pre-fill form if editing existing estate
  useEffect(() => {
    if (currentEstate) {
      setForm({
        deceased_name: currentEstate.deceased_name || '',
        deceased_dod: currentEstate.deceased_dod || '',
        state_of_residence: currentEstate.state_of_residence || '',
      })
    }
  }, [currentEstate])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function createEstate() {
    if (!form.deceased_name || !form.deceased_dod || !form.state_of_residence) {
      setError('All fields are required')
      return
    }

    setSaving(true)
    setError('')

    try {
      if (currentEstate) {
        // Update existing estate
        const { error: updateError } = await supabase
          .from('estates')
          .update({
            deceased_name: form.deceased_name,
            deceased_dod: form.deceased_dod,
            state_of_residence: form.state_of_residence,
          })
          .eq('id', currentEstate.id)

        if (updateError) throw updateError
      } else {
        // Create new estate
        const { data: estate, error: estateError } = await supabase
          .from('estates')
          .insert({
            name: `${form.deceased_name} Estate`,
            deceased_name: form.deceased_name,
            deceased_dod: form.deceased_dod,
            state_of_residence: form.state_of_residence,
            administrator_name: user?.email?.split('@')[0] || 'Administrator',
            administrator_email: user?.email,
            status: 'active',
            intake_complete: false,
            intake_answers: {},
          })
          .select()
          .single()

        if (estateError) throw estateError

        // Link user as administrator
        const { error: linkError } = await supabase
          .from('estate_users')
          .insert({
            estate_id: estate.id,
            auth_user_id: user.id,
            name: user?.email?.split('@')[0] || 'Administrator',
            email: user?.email,
            role: 'administrator',
          })

        if (linkError) throw linkError
      }

      // Create default sections
      const sections = [
        { label: 'Phase 1 — Immediate', color: 'red', sort_order: 1 },
        { label: 'Phase 2 — First Week', color: 'orange', sort_order: 2 },
        { label: 'Phase 3 — Government Notifications', color: 'orange', sort_order: 3 },
        { label: 'Phase 4 — Financial Accounts', color: 'blue', sort_order: 4 },
        { label: 'Phase 5 — Insurance', color: 'gray', sort_order: 5 },
        { label: 'Phase 6 — Real Estate & Property', color: 'amber', sort_order: 6 },
        { label: 'Phase 7 — Debts & Liabilities', color: 'red', sort_order: 7 },
        { label: 'Phase 8 — Business Interests', color: 'gray', sort_order: 8 },
        { label: 'Phase 9 — Digital Assets', color: 'blue', sort_order: 9 },
        { label: 'Phase 10 — Taxes', color: 'gray', sort_order: 10 },
        { label: 'Phase 11 — Commonly Missed Items', color: 'gray', sort_order: 11 },
      ]

      for (const section of sections) {
        await supabase.from('estate_sections').insert({
          estate_id: estate.id,
          ...section,
        })
      }

      await reload()
      navigate('/all-estates')
    } catch (err) {
      console.error('Error creating estate:', err)
      setError(err.message || 'Error creating estate')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-white dark:bg-gray-950">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Quick Estate Setup</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Create a new estate in seconds</p>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
              Deceased Name *
            </label>
            <input
              type="text"
              value={form.deceased_name}
              onChange={e => setForm(p => ({ ...p, deceased_name: e.target.value }))}
              placeholder="e.g., Daniel Smith"
              className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
              Date of Death *
            </label>
            <input
              type="date"
              value={form.deceased_dod}
              onChange={e => setForm(p => ({ ...p, deceased_dod: e.target.value }))}
              className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
              State of Residence *
            </label>
            <input
              type="text"
              value={form.state_of_residence}
              onChange={e => setForm(p => ({ ...p, state_of_residence: e.target.value }))}
              placeholder="e.g., Texas"
              className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
            />
          </div>

          <button
            onClick={createEstate}
            disabled={saving}
            className="w-full bg-gray-900 dark:bg-gray-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-gray-700 disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create Estate'}
          </button>

          <button
            onClick={() => navigate('/all-estates')}
            className="w-full text-gray-600 dark:text-gray-400 rounded-lg py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Back to Estates
          </button>
        </div>

        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-xs text-blue-900 dark:text-blue-300">
            💡 <strong>Tip:</strong> You can fill out the full intake form later from the Intake Review page to add more details.
          </p>
        </div>
      </div>
    </div>
  )
}
