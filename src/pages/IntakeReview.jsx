import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'

const INTAKE_QUESTIONS = [
  { q: 'Full legal name of deceased', key: 'deceased_name', type: 'text' },
  { q: 'Date of death', key: 'deceased_dod', type: 'date' },
  { q: 'State of residence at time of death', key: 'state_of_residence', type: 'text' },
  { q: 'Marital status', key: 'marital_status', type: 'select', options: ['married', 'widowed', 'divorced', 'single'] },
  { q: 'Surviving spouse?', key: 'has_spouse', type: 'yes-no' },
  { q: 'Had children?', key: 'has_children', type: 'yes-no' },
  { q: 'Minor children?', key: 'has_minor_children', type: 'yes-no' },
  { q: 'Adult children from prior relationships?', key: 'has_adult_children_prior', type: 'yes-no' },
  { q: 'Had a will?', key: 'has_will', type: 'yes-no' },
  { q: 'Had a trust?', key: 'has_trust', type: 'yes-no' },
  { q: 'Owned real estate?', key: 'has_real_estate', type: 'yes-no' },
  { q: 'Owned vehicles?', key: 'has_vehicles', type: 'yes-no' },
  { q: 'Owned a business or had business interests?', key: 'has_business', type: 'yes-no' },
  { q: 'Had retirement accounts?', key: 'has_retirement', type: 'yes-no' },
  { q: 'Were they a veteran or active military?', key: 'is_veteran', type: 'yes-no' },
  { q: 'Had life insurance policies?', key: 'has_life_insurance', type: 'yes-no' },
  { q: 'Were they employed at time of death?', key: 'was_employed', type: 'yes-no' },
  { q: 'Receiving Social Security benefits?', key: 'receives_social_security', type: 'yes-no' },
  { q: 'On Medicare or Medicaid?', key: 'on_medicare_medicaid', type: 'yes-no' },
  { q: 'Had a safe deposit box?', key: 'has_safe_deposit_box', type: 'yes-no' },
  { q: 'Known debts?', key: 'has_debts', type: 'yes-no' },
  { q: 'Digital assets or cryptocurrency?', key: 'has_digital_assets', type: 'yes-no' },
  { q: 'Pending lawsuits or legal claims?', key: 'has_pending_litigation', type: 'yes-no' },
  { q: 'Minor dependents requiring guardianship?', key: 'has_minor_dependents', type: 'yes-no' },
  { q: 'Pets requiring care?', key: 'has_pets', type: 'yes-no' },
  { q: 'Organ donor designation?', key: 'has_organ_donor', type: 'yes-no' },
  { q: 'Pre-paid funeral plan?', key: 'has_prepaid_funeral', type: 'yes-no' },
  { q: 'Beneficiary of someone else\'s estate or trust?', key: 'is_beneficiary', type: 'yes-no' },
  { q: 'Uncashed checks, pending tax refunds, or anticipated income?', key: 'has_pending_income', type: 'yes-no' },
  { q: 'Loyalty/rewards accounts (airline miles, hotel points)?', key: 'has_loyalty_accounts', type: 'yes-no' },
  { q: 'Intellectual property (royalties, patents, copyrights)?', key: 'has_intellectual_property', type: 'yes-no' },
  { q: 'Member of unions, professional organizations, or fraternal groups?', key: 'is_member_organizations', type: 'yes-no' },
  { q: 'Storage units?', key: 'has_storage_units', type: 'yes-no' },
  { q: 'Outstanding personal loans to or from others?', key: 'has_personal_loans', type: 'yes-no' },
]

export default function IntakeReview() {
  const { currentEstate, reload } = useEstate()
  const [answers, setAnswers] = useState({})
  const [editingKey, setEditingKey] = useState(null)
  const [retakeMode, setRetakeMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!currentEstate) return
    loadAnswers()
  }, [currentEstate])

  async function loadAnswers() {
    setAnswers(currentEstate.intake_answers || {})
    setLoading(false)
  }

  // In retake mode, move to the next question; otherwise close the editor
  function advanceFrom(key) {
    const idx = INTAKE_QUESTIONS.findIndex(q => q.key === key)
    if (retakeMode && idx >= 0 && idx < INTAKE_QUESTIONS.length - 1) {
      setEditingKey(INTAKE_QUESTIONS[idx + 1].key)
    } else {
      setRetakeMode(false)
      setEditingKey(null)
    }
  }

  async function updateAnswer(key, value) {
    setSaving(true)
    const updated = { ...answers, [key]: value }
    await supabase.from('estates').update({
      intake_answers: updated,
      updated_at: new Date().toISOString()
    }).eq('id', currentEstate.id)
    setAnswers(updated)
    advanceFrom(key)
    await reload()
    setSaving(false)
  }

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate selected.</div>
  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  const question = editingKey ? INTAKE_QUESTIONS.find(q => q.key === editingKey) : null

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white">Intake Review</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">{currentEstate.deceased_name}</p>
        </div>
        <button
          onClick={() => {
            // Walk through every question with existing answers (including
            // AI-extracted ones) pre-filled — nothing is cleared
            setRetakeMode(true)
            setEditingKey(INTAKE_QUESTIONS[0].key)
          }}
          className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-700"
        >
          Full Re-take
        </button>
      </div>

      {editingKey && question ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 mb-6">
          {retakeMode && (
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Question {INTAKE_QUESTIONS.findIndex(q => q.key === editingKey) + 1} of {INTAKE_QUESTIONS.length}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => advanceFrom(editingKey)}
                  disabled={saving}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                >
                  Keep answer & next →
                </button>
                <button
                  onClick={() => { setRetakeMode(false); setEditingKey(null) }}
                  className="text-xs text-gray-500 dark:text-gray-400 hover:underline"
                >
                  Exit
                </button>
              </div>
            </div>
          )}
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{question.q}</h2>

          {question.type === 'yes-no' && (
            <div className="space-y-2">
              {['yes', 'no'].map(opt => (
                <button
                  key={opt}
                  onClick={() => updateAnswer(editingKey, opt)}
                  disabled={saving}
                  className={`w-full px-4 py-2 rounded-lg text-sm font-medium ${
                    answers[editingKey] === opt
                      ? opt === 'yes' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                  } disabled:opacity-50`}
                >
                  {opt === 'yes' ? '✓ Yes' : '✗ No'}
                </button>
              ))}
            </div>
          )}

          {question.type === 'select' && (
            <div className="space-y-2">
              {(question.options ?? []).map(opt => (
                <button
                  key={opt}
                  onClick={() => updateAnswer(editingKey, opt)}
                  disabled={saving}
                  className={`w-full px-4 py-2 rounded-lg text-sm font-medium capitalize ${
                    answers[editingKey] === opt
                      ? 'bg-gray-900 dark:bg-gray-700 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                  } disabled:opacity-50`}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          {(question.type === 'text' || question.type === 'date') && (
            <div className="space-y-2">
              <input
                type={question.type}
                value={answers[editingKey] ?? ''}
                onChange={e => setAnswers(prev => ({ ...prev, [editingKey]: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => updateAnswer(editingKey, answers[editingKey])}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-700 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  onClick={() => { setRetakeMode(false); setEditingKey(null) }}
                  className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {INTAKE_QUESTIONS.map(({ q, key }) => (
            <button
              key={key}
              onClick={() => setEditingKey(key)}
              className="w-full text-left bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{q}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{key}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${
                    answers[key] === 'yes' ? 'text-green-600 dark:text-green-400' :
                    answers[key] === 'no' ? 'text-red-600 dark:text-red-400' :
                    'text-gray-500 dark:text-gray-400'
                  }`}>
                    {answers[key] === 'yes' ? '✓ Yes' : answers[key] === 'no' ? '✗ No' : answers[key] || 'Not answered'}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Click to edit</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {!editingKey && (
        <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm text-blue-900 dark:text-blue-300">
            💡 Click any answer to edit it. Use "Full Re-take" to start over with a fresh intake form.
          </p>
        </div>
      )}
    </div>
  )
}
