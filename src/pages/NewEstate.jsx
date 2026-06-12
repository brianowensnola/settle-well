import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useUser } from '../lib/AuthContext'
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

const GUIDANCE = {
  do_not: [
    'Do not use the deceased\'s individual bank accounts — this can create legal liability',
    'Do not pay debts from estate funds without legal guidance — some debts are not the estate\'s responsibility',
    'Do not distribute any assets until creditors are paid and probate is opened',
    'Do not cancel insurance policies until an attorney reviews — some have cash value or are needed during administration',
    'Do not discard any mail — every piece may be legally relevant',
    'Do not post details about the estate on social media — creditors and claimants monitor this',
    'Do not give personal property away — even to family — before the estate inventory is complete',
    'Do not allow access to the deceased\'s home without supervision until inventory is complete',
  ],
  do_immediately: [
    'Secure the property — change locks if needed, alert local authorities if vacant',
    'Collect all mail and set up mail forwarding if needed',
    'Order death certificates — order more than you think you need (minimum 10-15 originals)',
    'Locate the will and any trust documents',
    'Identify the attorney and begin probate process',
    'Maintain heat/AC in vacant property — prevents pipes, mold, insurance issues',
    'If home will be vacant, notify homeowner\'s insurance and local police non-emergency line',
  ],
}

export default function NewEstate() {
  const navigate = useNavigate()
  const user = useUser()
  const { reload } = useEstate()
  const [step, setStep] = useState(0) // 0-32 for questions, 33 for guidance
  const [answers, setAnswers] = useState({})
  const [saving, setSaving] = useState(false)
  const [estateId, setEstateId] = useState(null)

  const currentQuestion = INTAKE_QUESTIONS[step]

  async function handleAnswer(value) {
    setAnswers(prev => ({ ...prev, [currentQuestion.key]: value }))
    if (step < INTAKE_QUESTIONS.length - 1) {
      setStep(step + 1)
    } else {
      setStep(33) // Show guidance
    }
  }

  async function completeIntake() {
    setSaving(true)

    try {
      // Create estate
      const { data: estate, error: estateError } = await supabase
        .from('estates')
        .insert({
          name: `${answers.deceased_name} Estate`,
          deceased_name: answers.deceased_name,
          deceased_dob: null,
          deceased_dod: answers.deceased_dod,
          state_of_residence: answers.state_of_residence,
          administrator_name: user?.email?.split('@')[0] || 'Administrator',
          administrator_email: user?.email,
          status: 'active',
          intake_complete: true,
          intake_answers: answers,
        })
        .select()
        .single()

      if (estateError) throw estateError

      // Link user to estate as administrator
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

      for (const section of sections) {
        await supabase.from('estate_sections').insert({
          estate_id: estate.id,
          ...section,
        })
      }

      await reload()
      setEstateId(estate.id)
      setTimeout(() => navigate('/dashboard'), 2000)
    } catch (err) {
      console.error('Error creating estate:', err)
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (step < 33) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#fafaf8' }}>
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">SettleWell</h1>
            <p className="text-sm text-gray-500 mt-1">Estate Intake</p>
            <div className="text-xs text-gray-400 mt-3">Question {step + 1} of {INTAKE_QUESTIONS.length}</div>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-6">{currentQuestion.q}</h2>

            {currentQuestion.type === 'text' && (
              <div className="space-y-3">
                <input
                  type="text"
                  value={answers[currentQuestion.key] || ''}
                  onChange={e => {
                    setAnswers(prev => ({ ...prev, [currentQuestion.key]: e.target.value }))
                  }}
                  placeholder="Enter answer"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter' && answers[currentQuestion.key]) {
                      handleAnswer(answers[currentQuestion.key])
                    }
                  }}
                  className="w-full border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
                <button
                  onClick={() => handleAnswer(answers[currentQuestion.key])}
                  disabled={!answers[currentQuestion.key]}
                  className="w-full bg-gray-900 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-gray-700 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}

            {currentQuestion.type === 'date' && (
              <div className="space-y-3">
                <input
                  type="date"
                  value={answers[currentQuestion.key] || ''}
                  onChange={e => setAnswers(prev => ({ ...prev, [currentQuestion.key]: e.target.value }))}
                  autoFocus
                  className="w-full border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
                <button
                  onClick={() => handleAnswer(answers[currentQuestion.key])}
                  disabled={!answers[currentQuestion.key]}
                  className="w-full bg-gray-900 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-gray-700 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}

            {currentQuestion.type === 'select' && (
              <div className="space-y-2">
                {currentQuestion.options.map(option => (
                  <button
                    key={option}
                    onClick={() => handleAnswer(option)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                      answers[currentQuestion.key] === option
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                    }`}
                  >
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </button>
                ))}
              </div>
            )}

            {currentQuestion.type === 'yes-no' && (
              <div className="space-y-2">
                <button
                  onClick={() => handleAnswer('yes')}
                  className={`w-full px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                    answers[currentQuestion.key] === 'yes'
                      ? 'bg-green-600 text-white border-green-600'
                      : 'border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                  }`}
                >
                  Yes
                </button>
                <button
                  onClick={() => handleAnswer('no')}
                  className={`w-full px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                    answers[currentQuestion.key] === 'no'
                      ? 'bg-red-600 text-white border-red-600'
                      : 'border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                  }`}
                >
                  No
                </button>
              </div>
            )}
          </div>

          <div className="text-xs text-gray-400 text-center mt-4">
            {step > 0 && (
              <button onClick={() => setStep(step - 1)} className="text-gray-500 hover:text-gray-700 dark:text-gray-300">
                ← Back
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Guidance screen
  if (step === 33) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#fafaf8' }}>
        <div className="w-full max-w-2xl max-h-screen overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">Your Action Plan</h1>

            <div className="space-y-6 mb-6">
              <div>
                <h2 className="text-lg font-semibold text-red-700 mb-3">⚠️ DO NOT DO THESE THINGS</h2>
                <ul className="space-y-2">
                  {GUIDANCE.do_not.map((item, i) => (
                    <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex gap-2">
                      <span className="text-red-600 shrink-0">✗</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-green-700 mb-3">✅ DO THESE IMMEDIATELY</h2>
                <ul className="space-y-2">
                  {GUIDANCE.do_immediately.map((item, i) => (
                    <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex gap-2">
                      <span className="text-green-600 shrink-0">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <button
              onClick={completeIntake}
              disabled={saving}
              className="w-full bg-gray-900 text-white rounded-lg py-3 text-sm font-medium hover:bg-gray-700 disabled:opacity-50"
            >
              {saving ? 'Creating estate...' : 'Begin Estate Administration'}
            </button>
          </div>
        </div>
      </div>
    )
  }
}
