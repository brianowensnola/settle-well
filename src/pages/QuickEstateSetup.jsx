import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useUser } from '../lib/AuthContext'
import { useEstate } from '../lib/EstateContext'
import DocumentExtractionUpload from '../components/DocumentExtractionUpload'
import { buildChecklistRows } from '../lib/checklistTemplate'
import { buildTaskRows } from '../lib/tasksTemplate'

export default function QuickEstateSetup() {
  const navigate = useNavigate()
  const user = useUser()
  const { reload } = useEstate()
  const [form, setForm] = useState({
    deceased_name: '',
    deceased_dod: '',
    state_of_residence: '',
  })
  const [createdEstate, setCreatedEstate] = useState(null)
  const [showExtraction, setShowExtraction] = useState(false)
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
      // Always create a new estate (QuickEstateSetup is for creation only)
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
      const estateId = estate.id

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

      // Insert sections and capture their IDs so we can attach starter tasks
      const { data: insertedSections } = await supabase
        .from('estate_sections')
        .insert(sections.map(s => ({ estate_id: estate.id, ...s })))
        .select()

      // Seed standard starter tasks into each phase section
      const sectionIdByLabel = {}
      for (const s of insertedSections ?? []) sectionIdByLabel[s.label] = s.id
      const taskRows = buildTaskRows(estate.id, sectionIdByLabel)
      if (taskRows.length > 0) {
        await supabase.from('estate_tasks').insert(taskRows)
      }

      // Seed the standard estate-administration checklist so every new
      // estate starts with the universal to-do list already populated.
      await supabase
        .from('estate_checklist_items')
        .insert(buildChecklistRows(estate.id))

      await reload()
      setCreatedEstate(estateId)
      setShowExtraction(true)
    } catch (err) {
      console.error('Error creating estate:', err)
      setError(err.message || 'Error creating estate')
    } finally {
      setSaving(false)
    }
  }

  // Extraction complete - redirect to intake
  async function handleExtractionComplete(extractedAnswers) {
    if (extractedAnswers && Object.keys(extractedAnswers).length > 0) {
      // Save extracted answers to estate
      await supabase
        .from('estates')
        .update({ intake_answers: extractedAnswers })
        .eq('id', createdEstate)
    }
    // Refresh the in-memory estate so Intake Review sees the new answers
    await reload()
    navigate('/intake-review')
  }

  function handleSkipExtraction() {
    navigate('/intake-review')
  }

  // Extraction flow (mandatory for first-time users)
  if (showExtraction && createdEstate) {
    return (
      <div className="min-h-screen p-4 bg-white dark:bg-gray-950">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
              {form.deceased_name} Estate
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              {form.deceased_dod} • {form.state_of_residence}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
              Upload documents to automatically extract key information
            </p>
          </div>

          <DocumentExtractionUpload
            estateId={createdEstate}
            onExtractionComplete={handleExtractionComplete}
            onSkip={handleSkipExtraction}
          />
        </div>
      </div>
    )
  }

  // Initial setup form
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
              Date of Death * (YYYY-MM-DD)
            </label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="e.g., 2026-06-04"
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
            💡 <strong>Tip:</strong> Next, you'll have the option to upload documents. The AI will extract key information to speed up your intake form.
          </p>
        </div>
      </div>
    </div>
  )
}
