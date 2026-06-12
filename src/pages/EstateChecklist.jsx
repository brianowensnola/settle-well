import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { STATUS_STYLES, STATUS_LABELS } from '../lib/constants'

const MASTER_CHECKLIST = {
  'Immediate (First 24-72 hours)': [
    { name: 'Secure the property', intake_key: null, category: 'immediate' },
    { name: 'Order death certificates (get 15+)', intake_key: null, category: 'immediate' },
    { name: 'Notify family and close friends', intake_key: null, category: 'immediate' },
    { name: 'Locate will and trust documents', intake_key: null, category: 'immediate' },
    { name: 'Contact attorney/begin probate', intake_key: null, category: 'immediate' },
  ],
  'Government Notifications': [
    { name: 'Notify Social Security', intake_key: 'receives_social_security', category: 'government' },
    { name: 'Notify IRS and state tax agencies', intake_key: null, category: 'government' },
    { name: 'Notify DMV (vehicles)', intake_key: 'has_vehicles', category: 'government' },
    { name: 'Notify veteran benefits (if applicable)', intake_key: 'is_veteran', category: 'government' },
    { name: 'Cancel passport', intake_key: null, category: 'government' },
  ],
  'Financial Accounts': [
    { name: 'Locate bank accounts', intake_key: null, category: 'financial' },
    { name: 'Locate investment accounts', intake_key: 'has_retirement', category: 'financial' },
    { name: 'Locate retirement accounts (401k, IRA)', intake_key: 'has_retirement', category: 'financial' },
    { name: 'Notify creditors of death', intake_key: 'has_debts', category: 'financial' },
    { name: 'File final tax return', intake_key: null, category: 'financial' },
    { name: 'File estate tax return (if needed)', intake_key: null, category: 'financial' },
  ],
  'Insurance': [
    { name: 'Locate life insurance policies', intake_key: 'has_life_insurance', category: 'insurance' },
    { name: 'Locate homeowner\'s insurance', intake_key: 'has_real_estate', category: 'insurance' },
    { name: 'Locate auto insurance', intake_key: 'has_vehicles', category: 'insurance' },
    { name: 'File life insurance claims', intake_key: 'has_life_insurance', category: 'insurance' },
    { name: 'File property insurance claims', intake_key: null, category: 'insurance' },
  ],
  'Property & Assets': [
    { name: 'Secure real property', intake_key: 'has_real_estate', category: 'property' },
    { name: 'Get property appraised', intake_key: 'has_real_estate', category: 'property' },
    { name: 'Transfer vehicle titles', intake_key: 'has_vehicles', category: 'property' },
    { name: 'Inventory household contents', intake_key: null, category: 'property' },
    { name: 'Locate jewelry, art, collectibles', intake_key: null, category: 'property' },
  ],
  'Safe Deposit & Storage': [
    { name: 'Access safe deposit box', intake_key: 'has_safe_deposit_box', category: 'storage' },
    { name: 'Secure any storage units', intake_key: 'has_storage_units', category: 'storage' },
  ],
  'Business & Employment': [
    { name: 'Notify employer of death', intake_key: 'was_employed', category: 'business' },
    { name: 'Collect final paycheck', intake_key: 'was_employed', category: 'business' },
    { name: 'Handle business interests', intake_key: 'has_business', category: 'business' },
    { name: 'Cancel professional licenses', intake_key: 'has_business', category: 'business' },
  ],
  'Digital Assets': [
    { name: 'Locate cryptocurrency accounts', intake_key: 'has_digital_assets', category: 'digital' },
    { name: 'Secure online accounts (email, banking)', intake_key: null, category: 'digital' },
    { name: 'Access cloud storage & digital files', intake_key: 'has_digital_assets', category: 'digital' },
    { name: 'Manage social media accounts', intake_key: null, category: 'digital' },
  ],
  'Debts & Liabilities': [
    { name: 'Identify and notify creditors', intake_key: 'has_debts', category: 'debts' },
    { name: 'Pay estate debts', intake_key: 'has_debts', category: 'debts' },
    { name: 'Handle mortgage payoff', intake_key: 'has_real_estate', category: 'debts' },
    { name: 'Resolve pending lawsuits', intake_key: 'has_pending_litigation', category: 'debts' },
  ],
  'Beneficiaries & Distribution': [
    { name: 'Identify all heirs/beneficiaries', intake_key: 'has_children', category: 'beneficiaries' },
    { name: 'Resolve guardianship (if needed)', intake_key: 'has_minor_dependents', category: 'beneficiaries' },
    { name: 'Arrange pet care', intake_key: 'has_pets', category: 'beneficiaries' },
    { name: 'Distribute assets to beneficiaries', intake_key: null, category: 'beneficiaries' },
  ],
  'Special Situations': [
    { name: 'Handle unclaimed property (state databases)', intake_key: null, category: 'special' },
    { name: 'Recover loyalty/rewards accounts', intake_key: 'has_loyalty_accounts', category: 'special' },
    { name: 'Collect on intellectual property', intake_key: 'has_intellectual_property', category: 'special' },
    { name: 'Handle organizational memberships', intake_key: 'is_member_organizations', category: 'special' },
    { name: 'Collect pending refunds/income', intake_key: 'has_pending_income', category: 'special' },
  ],
}

export default function EstateChecklist() {
  const { currentEstate } = useEstate()
  const [checklist, setChecklist] = useState({})
  const [customItems, setCustomItems] = useState([])
  const [newItemText, setNewItemText] = useState('')
  const [newItemCategory, setNewItemCategory] = useState('special')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentEstate) return
    loadChecklist()
  }, [currentEstate])

  async function loadChecklist() {
    // For now, just initialize with all items as "not_started"
    // Later this will sync with actual tasks
    setChecklist(MASTER_CHECKLIST)
    setLoading(false)
  }

  async function addCustomItem() {
    if (!newItemText.trim()) return
    const newItem = {
      name: newItemText,
      intake_key: null,
      category: 'custom',
      isCustom: true,
    }
    setCustomItems(prev => [...prev, newItem])
    setNewItemText('')
  }

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate selected.</div>
  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white mb-2">Estate Checklist</h1>
        <p className="text-gray-600 dark:text-gray-400">Comprehensive list of everything that needs attention</p>
      </div>

      {/* Add Custom Item */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Add Custom Item</h2>
        <div className="flex gap-2">
          <input
            value={newItemText}
            onChange={e => setNewItemText(e.target.value)}
            placeholder="E.g., Handle lawsuit, Collect inheritance from uncle..."
            className="flex-1 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
          />
          <button
            onClick={addCustomItem}
            className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-700"
          >
            Add
          </button>
        </div>
      </div>

      {/* Checklist by Category */}
      <div className="space-y-6">
        {Object.entries(checklist).map(([category, items]) => (
          <div key={category}>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">{category}</h2>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={`${category}-${idx}`} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 flex items-center gap-3">
                  <input type="checkbox" className="w-5 h-5 rounded" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{item.name}</p>
                    {item.intake_key && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Based on intake answer: {item.intake_key}</p>
                    )}
                  </div>
                  <select defaultValue="not_started" className="text-xs border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded px-2 py-1">
                    <option value="not_started">Not started</option>
                    <option value="in_progress">In progress</option>
                    <option value="done">Done</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Custom Items */}
        {customItems.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Custom Items</h2>
            <div className="space-y-2">
              {customItems.map((item, idx) => (
                <div key={`custom-${idx}`} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 flex items-center gap-3">
                  <input type="checkbox" className="w-5 h-5 rounded" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{item.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Custom item</p>
                  </div>
                  <select defaultValue="not_started" className="text-xs border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded px-2 py-1">
                    <option value="not_started">Not started</option>
                    <option value="in_progress">In progress</option>
                    <option value="done">Done</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
        <p className="text-sm text-amber-900 dark:text-amber-300">
          ⚠️ <strong>Note:</strong> This comprehensive checklist shows everything that might need attention. Items marked as "not applicable" in your intake still appear here in case circumstances change.
        </p>
      </div>
    </div>
  )
}
