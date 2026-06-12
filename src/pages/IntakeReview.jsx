import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
  const { currentEstate } = useEstate()
  const navigate = useNavigate()
  const [answers, setAnswers] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentEstate) return
    loadAnswers()
  }, [currentEstate])

  async function loadAnswers() {
    setAnswers(currentEstate.intake_answers || {})
    setLoading(false)
  }

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate selected.</div>
  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  const formatAnswer = (key, value) => {
    if (value === 'yes') return '✓ Yes'
    if (value === 'no') return '✗ No'
    if (value === null || value === undefined) return 'Not answered'
    return String(value)
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white">Intake Review</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">{currentEstate.deceased_name}</p>
        </div>
        <button
          onClick={() => navigate('/settings')}
          className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-700"
        >
          Re-take Intake
        </button>
      </div>

      <div className="space-y-3">
        {INTAKE_QUESTIONS.map(({ q, key }) => (
          <div key={key} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
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
                  {formatAnswer(key, answers[key])}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-900 dark:text-blue-300">
          💡 <strong>Tip:</strong> Circumstances change. If something you marked "no" becomes relevant, you can re-take the full intake anytime to update your answers and generate new tasks.
        </p>
      </div>
    </div>
  )
}
