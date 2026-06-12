import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'

const MASTER_CHECKLIST = {
  'Immediate (First 24-72 hours)': [
    'Secure the property',
    'Order death certificates (get 15+)',
    'Notify family and close friends',
    'Locate will and trust documents',
    'Contact attorney/begin probate',
  ],
  'Government Notifications': [
    'Notify Social Security',
    'Notify IRS and state tax agencies',
    'Notify DMV (vehicles)',
    'Notify veteran benefits (if applicable)',
    'Cancel passport',
  ],
  'Financial Accounts': [
    'Locate bank accounts',
    'Locate investment accounts',
    'Locate retirement accounts (401k, IRA)',
    'Notify creditors of death',
    'File final tax return',
    'File estate tax return (if needed)',
  ],
  'Insurance': [
    'Locate life insurance policies',
    'Locate homeowner\'s insurance',
    'Locate auto insurance',
    'File life insurance claims',
    'File property insurance claims',
  ],
  'Property & Assets': [
    'Secure real property',
    'Get property appraised',
    'Transfer vehicle titles',
    'Inventory household contents',
    'Locate jewelry, art, collectibles',
  ],
  'Safe Deposit & Storage': [
    'Access safe deposit box',
    'Secure any storage units',
  ],
  'Business & Employment': [
    'Notify employer of death',
    'Collect final paycheck',
    'Handle business interests',
    'Cancel professional licenses',
  ],
  'Digital Assets': [
    'Locate cryptocurrency accounts',
    'Secure online accounts (email, banking)',
    'Access cloud storage & digital files',
    'Manage social media accounts',
  ],
  'Debts & Liabilities': [
    'Identify and notify creditors',
    'Pay estate debts',
    'Handle mortgage payoff',
    'Resolve pending lawsuits',
  ],
  'Beneficiaries & Distribution': [
    'Identify all heirs/beneficiaries',
    'Resolve guardianship (if needed)',
    'Arrange pet care',
    'Distribute assets to beneficiaries',
  ],
  'Special Situations': [
    'Handle unclaimed property (state databases)',
    'Recover loyalty/rewards accounts',
    'Collect on intellectual property',
    'Handle organizational memberships',
    'Collect pending refunds/income',
  ],
}

export default function EstateChecklist() {
  const { currentEstate } = useEstate()
  const [items, setItems] = useState([])
  const [newItemText, setNewItemText] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentEstate) return
    loadItems()
  }, [currentEstate])

  async function loadItems() {
    const { data: existing } = await supabase
      .from('estate_checklist_items')
      .select('*')
      .eq('estate_id', currentEstate.id)

    if (existing?.length === 0) {
      await initializeMasterChecklist()
    } else {
      setItems(existing ?? [])
    }
    setLoading(false)
  }

  async function initializeMasterChecklist() {
    const itemsToInsert = []
    for (const [category, items] of Object.entries(MASTER_CHECKLIST)) {
      for (const item of items) {
        itemsToInsert.push({
          estate_id: currentEstate.id,
          category,
          item,
          completed: false,
        })
      }
    }

    const { data: inserted } = await supabase
      .from('estate_checklist_items')
      .insert(itemsToInsert)
      .select()

    setItems(inserted ?? [])
  }

  async function toggleItem(id, completed) {
    await supabase
      .from('estate_checklist_items')
      .update({ completed, completed_at: completed ? new Date().toISOString() : null })
      .eq('id', id)

    setItems(prev => prev.map(item => item.id === id ? { ...item, completed } : item))
  }

  async function updateNotes(id, notes) {
    await supabase
      .from('estate_checklist_items')
      .update({ notes, updated_at: new Date().toISOString() })
      .eq('id', id)

    setItems(prev => prev.map(item => item.id === id ? { ...item, notes } : item))
  }

  async function addCustomItem() {
    if (!newItemText.trim()) return

    const { data: inserted } = await supabase
      .from('estate_checklist_items')
      .insert({
        estate_id: currentEstate.id,
        category: 'Custom',
        item: newItemText,
        completed: false,
      })
      .select()
      .single()

    if (inserted) {
      setItems(prev => [...prev, inserted])
      setNewItemText('')
    }
  }

  async function deleteItem(id) {
    if (!confirm('Delete this item?')) return
    await supabase.from('estate_checklist_items').delete().eq('id', id)
    setItems(prev => prev.filter(item => item.id !== id))
  }

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate selected.</div>
  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  const grouped = {}
  for (const item of items) {
    if (!grouped[item.category]) grouped[item.category] = []
    grouped[item.category].push(item)
  }

  const completed = items.filter(i => i.completed).length
  const total = items.length
  const pct = total ? Math.round((completed / total) * 100) : 0

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white mb-2">Estate Checklist</h1>
        <p className="text-gray-600 dark:text-gray-400">{completed} of {total} complete ({pct}%)</p>
      </div>

      {/* Progress Bar */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-6">
        <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Add Custom Item */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Add Custom Item</h2>
        <div className="flex gap-2">
          <input
            value={newItemText}
            onChange={e => setNewItemText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCustomItem()}
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
        {Object.entries(grouped).map(([category, categoryItems]) => (
          <div key={category}>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">{category}</h2>
            <div className="space-y-2">
              {categoryItems.map(item => (
                <div key={item.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={item.completed}
                      onChange={e => toggleItem(item.id, e.target.checked)}
                      className="w-5 h-5 rounded mt-0.5"
                    />
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${item.completed ? 'line-through text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                        {item.item}
                      </p>
                      {item.notes && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">{item.notes}</p>
                      )}
                    </div>
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="text-xs text-gray-400 hover:text-red-500 px-2"
                    >
                      Delete
                    </button>
                  </div>
                  {item.completed && (
                    <div className="mt-2 ml-8">
                      <input
                        type="text"
                        placeholder="Add completion notes..."
                        value={item.notes || ''}
                        onChange={e => updateNotes(item.id, e.target.value)}
                        className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded px-2 py-1 text-xs focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
