import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'

function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(n))
}

export default function Transactions() {
  const navigate = useNavigate()
  const { currentEstate } = useEstate()
  const [txns, setTxns] = useState([])
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), description: '', amount: '', category: 'other', notes: '' })
  const [receiptFile, setReceiptFile] = useState(null)
  const [uploading, setUploading] = useState(null) // txn id being uploaded to, or 'new'
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

  // Upload a receipt file to the estate-documents bucket; returns its storage path.
  async function uploadReceipt(file) {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${currentEstate.id}/receipts/${Date.now()}_${safe}`
    const { error } = await supabase.storage.from('estate-documents').upload(path, file)
    if (error) throw error
    return path
  }

  async function save() {
    const amt = parseFloat(form.amount)
    if (!form.description || isNaN(amt)) return
    let receipt_path = null
    if (receiptFile) {
      setUploading('new')
      try { receipt_path = await uploadReceipt(receiptFile) }
      catch (e) { alert(`Couldn't upload the receipt: ${e.message}`); setUploading(null); return }
      setUploading(null)
    }
    const { data } = await supabase.from('estate_transactions').insert({
      estate_id: currentEstate.id,
      date: form.date,
      description: form.description,
      amount: amt,
      category: form.category,
      notes: form.notes,
      receipt_path,
    }).select().single()
    if (data) setTxns(prev => [data, ...prev])
    setAdding(false)
    setReceiptFile(null)
    setForm({ date: new Date().toISOString().slice(0, 10), description: '', amount: '', category: 'other', notes: '' })
  }

  // Attach (or replace) a receipt on an existing ledger entry.
  async function attachReceipt(txn, file) {
    if (!file) return
    setUploading(txn.id)
    try {
      const path = await uploadReceipt(file)
      await supabase.from('estate_transactions').update({ receipt_path: path }).eq('id', txn.id)
      setTxns(prev => prev.map(t => t.id === txn.id ? { ...t, receipt_path: path } : t))
    } catch (e) {
      alert(`Couldn't upload the receipt: ${e.message}`)
    }
    setUploading(null)
  }

  async function viewReceipt(txn) {
    if (!txn.receipt_path) return
    const { data } = await supabase.storage.from('estate-documents').createSignedUrl(txn.receipt_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  const balance = txns.reduce((s, t) => s + t.amount, 0)

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/finances')} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
            ← Back
          </button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Transaction Ledger</h1>
        </div>
        <button onClick={() => setAdding(true)} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm">+ Add transaction</button>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-4 flex justify-between items-center">
        <span className="text-sm text-gray-500">Running balance</span>
        <span className={`text-lg font-semibold ${balance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
          {balance >= 0 ? '' : '-'}{fmt(balance)}
        </span>
      </div>

      {adding && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Date</label>
              <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Amount (+ in / - out)</label>
              <input type="number" step="0.01" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                placeholder="e.g. -1500 or 67000"
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Description</label>
            <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Receipt (optional)</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.heic"
              onChange={e => setReceiptFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-600 dark:text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-gray-100 dark:file:bg-gray-800 file:text-gray-700 dark:file:text-gray-300" />
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={uploading === 'new'} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm disabled:opacity-50">
              {uploading === 'new' ? 'Uploading…' : 'Save'}
            </button>
            <button onClick={() => { setAdding(false); setReceiptFile(null) }} className="px-4 py-2 text-gray-500 rounded-lg text-sm hover:bg-gray-100 dark:bg-gray-800">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
        {txns.length === 0 && <div className="p-6 text-sm text-gray-400">No transactions yet.</div>}
        <div className="divide-y divide-gray-100">
          {txns.map(t => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3">
              <span className="text-xs text-gray-400 w-24 shrink-0">{t.date}</span>
              <span className="flex-1 text-sm text-gray-800 dark:text-white">{t.description}</span>
              {t.receipt_path ? (
                <button onClick={() => viewReceipt(t)} className="text-xs text-blue-600 hover:underline shrink-0">📎 Receipt</button>
              ) : (
                <label className="text-xs text-gray-400 hover:text-blue-600 hover:underline cursor-pointer shrink-0">
                  {uploading === t.id ? 'Uploading…' : '+ Receipt'}
                  <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.heic"
                    onChange={e => attachReceipt(t, e.target.files?.[0])} />
                </label>
              )}
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
