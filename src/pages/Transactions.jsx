import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'

function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(n))
}
const signed = n => `${n < 0 ? '-' : ''}${fmt(n)}`

export default function Transactions() {
  const navigate = useNavigate()
  const { currentEstate } = useEstate()
  const [txns, setTxns] = useState([])
  const [accounts, setAccounts] = useState([])
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), description: '', amount: '', account_id: '', notes: '', reimbursement: false, paid_by: '', paid_to: '' })
  const [receiptFile, setReceiptFile] = useState(null)
  const [uploading, setUploading] = useState(null)
  const [settling, setSettling] = useState(null)   // reimbursement txn id being marked paid
  const [settleAcct, setSettleAcct] = useState('')  // account chosen to pay it from
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentEstate) return
    load()
  }, [currentEstate])

  async function load() {
    const [txnRes, acctRes] = await Promise.all([
      supabase.from('estate_transactions').select('*').eq('estate_id', currentEstate.id).order('date', { ascending: false }),
      supabase.from('estate_financials').select('id, name, amount').eq('estate_id', currentEstate.id).eq('category', 'account').order('name'),
    ])
    setTxns(txnRes.data ?? [])
    setAccounts(acctRes.data ?? [])
    setLoading(false)
  }

  async function uploadReceipt(file) {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${currentEstate.id}/receipts/${Date.now()}_${safe}`
    const { error } = await supabase.storage.from('estate-documents').upload(path, file)
    if (error) throw error
    return path
  }

  function openAdd() {
    setForm({ date: new Date().toISOString().slice(0, 10), description: '', amount: '', account_id: accounts[0]?.id ?? '', notes: '', reimbursement: false, paid_by: '', paid_to: '' })
    setReceiptFile(null)
    setAdding(true)
  }

  async function save() {
    let amt = parseFloat(form.amount)
    if (!form.description || isNaN(amt)) return
    // A reimbursement is money the estate owes back — always a payment (debit),
    // and it doesn't touch an account until it's actually paid.
    if (form.reimbursement) amt = -Math.abs(amt)
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
      account_id: form.reimbursement ? null : (form.account_id || null),
      notes: form.notes,
      receipt_path,
      reimburse_status: form.reimbursement ? 'pending' : null,
      paid_by: form.reimbursement ? (form.paid_by || null) : null,
      paid_to: form.reimbursement ? (form.paid_to || null) : null,
    }).select().single()
    if (data) setTxns(prev => [data, ...prev])
    setAdding(false)
    setReceiptFile(null)
  }

  // Mark a pending reimbursement as paid back from a chosen account — it then
  // posts to that account's balance like a normal debit.
  async function markReimbursed(txn, accountId) {
    await supabase.from('estate_transactions')
      .update({ reimburse_status: 'reimbursed', account_id: accountId || txn.account_id || null })
      .eq('id', txn.id)
    setTxns(prev => prev.map(t => t.id === txn.id ? { ...t, reimburse_status: 'reimbursed', account_id: accountId || t.account_id || null } : t))
    setSettling(null); setSettleAcct('')
  }

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

  const acctName = id => accounts.find(a => a.id === id)?.name ?? null
  // Pending reimbursements are money owed but not yet paid — they don't affect
  // any account balance or appear in the main ledger until they're reimbursed.
  const pending = txns.filter(t => t.reimburse_status === 'pending')
  const posted = txns.filter(t => t.reimburse_status !== 'pending')
  const pendingTotal = pending.reduce((s, t) => s + Math.abs(t.amount ?? 0), 0)
  // Live balance per account = opening balance + its posted ledger activity.
  const acctCurrent = id => (accounts.find(a => a.id === id)?.amount ?? 0) +
    posted.filter(t => t.account_id === id).reduce((s, t) => s + (t.amount ?? 0), 0)
  const unassigned = posted.filter(t => !t.account_id)

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/finances')} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">← Back</button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Transaction Ledger</h1>
        </div>
        <button onClick={openAdd} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm">+ Add transaction</button>
      </div>

      {/* Per-account live balances */}
      {accounts.length === 0 ? (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 rounded-xl p-4 mb-4 text-sm">
          No estate account yet. Add one in <Link to="/finances" className="underline font-medium">Finances → Accounts</Link> (with its opening balance), then post deposits/payments here and the balance will track automatically.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {accounts.map(a => (
            <div key={a.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400 truncate">{a.name}</span>
              <span className={`text-lg font-semibold ${acctCurrent(a.id) >= 0 ? 'text-green-700' : 'text-red-700'}`}>{signed(acctCurrent(a.id))}</span>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Date</label>
              <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Amount (+ deposit / − payment)</label>
              <input type="number" step="0.01" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                placeholder="e.g. -1500 or 5000"
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={form.reimbursement} onChange={e => setForm(p => ({ ...p, reimbursement: e.target.checked }))} className="mt-0.5" />
            <span>Pending reimbursement — someone paid out of pocket and the estate owes them back. <span className="text-gray-400">(Won't touch an account balance until you mark it reimbursed.)</span></span>
          </label>
          {form.reimbursement ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Owed to (who fronted the cost)</label>
                <input value={form.paid_by} onChange={e => setForm(p => ({ ...p, paid_by: e.target.value }))} placeholder="e.g. Brian Owens"
                  className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Paid to (vendor / who received it)</label>
                <input value={form.paid_to} onChange={e => setForm(p => ({ ...p, paid_to: e.target.value }))} placeholder="e.g. Memorial Funeral Home"
                  className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
              </div>
            </div>
          ) : (
            <div>
              <label className="text-xs text-gray-500 block mb-1">Account</label>
              <select value={form.account_id} onChange={e => setForm(p => ({ ...p, account_id: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
                <option value="">(no account)</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}
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

      {/* Pending reimbursements — owed but not yet paid */}
      {pending.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">Pending reimbursements owed</h2>
            <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">{fmt(pendingTotal)}</span>
          </div>
          <div className="divide-y divide-amber-200/60 dark:divide-amber-800/60">
            {pending.map(t => (
              <div key={t.id} className="py-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-24 shrink-0">{t.date}</span>
                  <span className="flex-1 min-w-0 text-sm text-gray-800 dark:text-white">
                    {t.description}
                    {t.paid_to && <span className="text-gray-500"> · paid to {t.paid_to}</span>}
                    {t.paid_by && <span className="text-gray-500"> · owed to {t.paid_by}</span>}
                  </span>
                  {t.receipt_path && <button onClick={() => viewReceipt(t)} className="text-xs text-blue-600 hover:underline shrink-0">📎</button>}
                  <span className="text-sm font-medium text-amber-800 dark:text-amber-300 shrink-0">{fmt(t.amount)}</span>
                  {settling === t.id
                    ? null
                    : <button onClick={() => { setSettling(t.id); setSettleAcct(accounts[0]?.id ?? '') }} className="text-xs text-green-700 hover:underline shrink-0">Mark reimbursed</button>}
                </div>
                {settling === t.id && (
                  <div className="flex items-center gap-2 mt-2 ml-24">
                    <span className="text-xs text-gray-500">Paid from:</span>
                    <select value={settleAcct} onChange={e => setSettleAcct(e.target.value)}
                      className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-2 py-1 text-xs focus:outline-none">
                      <option value="">(no account)</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <button onClick={() => markReimbursed(t, settleAcct)} className="text-xs px-2.5 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700">Confirm</button>
                    <button onClick={() => { setSettling(null); setSettleAcct('') }} className="text-xs text-gray-400 hover:underline">cancel</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-amber-700/80 dark:text-amber-300/70 mt-2">These don't affect account balances until reimbursed. Marking one paid posts it to the chosen account as a payment.</p>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
        {posted.length === 0 && <div className="p-6 text-sm text-gray-400">No transactions yet.</div>}
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {posted.map(t => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3">
              <span className="text-xs text-gray-400 w-24 shrink-0">{t.date}</span>
              <span className="flex-1 min-w-0">
                <span className="text-sm text-gray-800 dark:text-white">{t.description}</span>
                {acctName(t.account_id) && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500">{acctName(t.account_id)}</span>}
                {!t.account_id && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">no account</span>}
              </span>
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
      {unassigned.length > 0 && accounts.length > 0 && (
        <p className="text-xs text-gray-400 mt-3">{unassigned.length} transaction{unassigned.length !== 1 ? 's' : ''} aren't assigned to an account, so they don't affect any account balance. Edit them to assign an account.</p>
      )}
    </div>
  )
}
