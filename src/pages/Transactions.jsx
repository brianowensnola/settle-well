import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'

function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(n))
}

export default function Transactions() {
  const { currentEstate } = useEstate()
  const [txns, setTxns] = useState([])
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), description: '', amount: '', category: 'other', notes: '' })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentEstate) return
    load()
  }, [currentEstate])

  async function load() {
    const { data } = await supabase.from('estate_transactions').select('*').eq('estate_id', currentEstate.id).order('date', { ascending: false })
    setTxns(data ?? [])
    setLoading(false)
  }

  async function save() {
    const amt = parseFloat(form.amount)
    if (!form.description || isNaN(amt)) return
    const { data } = await supabase.from('estate_transactions').insert({
      estate_id: currentEstate.id,
      date: form.date,
      description: form.description,
      amount: amt,
      category: form.category,
      notes: form.notes,
    }).select().single()
    if (data) setTxns(prev => [data, ...prev])
    setAdding(false)
    setForm({ date: new Date().toISOString().slice(0, 10), description: '', amount: '', category: 'other', notes: '' })
  }

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  const balance = txns.reduce((s, t) => s + t.amount, 0)

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold text-gray-900">Transaction Ledger</h1>
        <button onClick={() => setAdding(true)} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm">+ Add transaction</button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex justify-between items-center">
        <span className="text-sm text-gray-500">Running balance</span>
        <span className={`text-lg font-semibold ${balance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
          {balance >= 0 ? '' : '-'}{fmt(balance)}
        </span>
      </div>

      {adding && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Date</label>
              <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Amount (+ in / - out)</label>
              <input type="number" step="0.01" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                placeholder="e.g. -1500 or 67000"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Description</label>
            <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm">Save</button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 text-gray-500 rounded-lg text-sm hover:bg-gray-100">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {txns.length === 0 && <div className="p-6 text-sm text-gray-400">No transactions yet.</div>}
        <div className="divide-y divide-gray-100">
          {txns.map(t => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3">
              <span className="text-xs text-gray-400 w-24 shrink-0">{t.date}</span>
              <span className="flex-1 text-sm text-gray-800">{t.description}</span>
              <span className={`text-sm font-medium shrink-0 ${t.amount >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {t.amount >= 0 ? '+' : '-'}{fmt(t.amount)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
