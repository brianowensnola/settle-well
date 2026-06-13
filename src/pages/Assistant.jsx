import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { isFullAccess } from '../lib/roles'
import { runAdvisor, loadSuggestions, acceptSuggestion, dismissSuggestion } from '../lib/aiAdvisor'
import LegalDisclaimer from '../components/LegalDisclaimer'

const FIN_CATEGORY_LABEL = {
  account: 'Account', obligation: 'Monthly Obligation', liability: 'Liability',
  asset: 'Asset', insurance_resolved: 'Insurance — Resolved', insurance_pending: 'Insurance — Pending',
}
const fmtMoney = n => n == null ? null : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

export default function Assistant() {
  const { currentEstate, role } = useEstate()
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [files, setFiles] = useState([])

  useEffect(() => {
    if (!currentEstate) return
    loadSuggestions(currentEstate.id).then(s => { setSuggestions(s); setLoading(false) })
  }, [currentEstate])

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate selected.</div>
  if (!isFullAccess(role)) return <div className="p-8 text-gray-400">The AI Assistant is available to the executor only.</div>

  async function refresh() {
    setSuggestions(await loadSuggestions(currentEstate.id))
  }

  async function review() {
    setRunning(true); setError(''); setProgress('Reviewing the estate — this can take a minute…')
    try {
      await runAdvisor(currentEstate.id, 'review')
      await refresh()
    } catch (e) { setError(e.message || 'Review failed') }
    finally { setRunning(false); setProgress('') }
  }

  async function matchDocuments() {
    setRunning(true); setError(''); setProgress('Matching documents to tasks…')
    try {
      await runAdvisor(currentEstate.id, 'documents')
      await refresh()
    } catch (e) { setError(e.message || 'Document matching failed') }
    finally { setRunning(false); setProgress('') }
  }

  async function forensic() {
    if (files.length === 0) { setError('Add at least one financial statement first.'); return }
    setRunning(true); setError(''); setProgress('Uploading…')
    try {
      const paths = []
      for (const f of files) {
        const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `estate-${currentEstate.id}/forensic/${Date.now()}-${safe}`
        const { error: upErr } = await supabase.storage.from('estate-documents').upload(path, f)
        if (upErr) throw upErr
        paths.push(path)
      }
      setProgress('Analyzing the statements — this can take a minute or two…')
      await runAdvisor(currentEstate.id, 'forensic', paths)
      setFiles([])
      await refresh()
    } catch (e) { setError(e.message || 'Forensic audit failed') }
    finally { setRunning(false); setProgress('') }
  }

  async function accept(s) {
    await acceptSuggestion(s)
    setSuggestions(prev => prev.filter(x => x.id !== s.id))
  }
  async function dismiss(s) {
    await dismissSuggestion(s.id)
    setSuggestions(prev => prev.filter(x => x.id !== s.id))
  }

  const reviewSugs = suggestions.filter(s => s.kind === 'review')
  const forensicSugs = suggestions.filter(s => s.kind === 'forensic')
  const docSugs = suggestions.filter(s => s.kind === 'documents')
  const finSugs = suggestions.filter(s => s.kind === 'financial')

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <h1 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white mb-1">AI Assistant</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Suggestions only — you accept what's right. Assistance, not legal advice.</p>

      {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}
      {progress && <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 px-4 py-3 rounded-lg text-sm mb-4">{progress}</div>}

      {/* What am I missing */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-white mb-1">What am I missing?</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Reviews your intake, tasks, notes, documents, and assets and proposes tasks or gaps you may have missed.</p>
        <button onClick={review} disabled={running} className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm disabled:opacity-50">
          {running ? 'Working…' : 'Review the estate'}
        </button>
      </div>

      {/* Match documents to tasks */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-white mb-1">Match documents to tasks</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Looks at your uploaded documents and the tasks they satisfy — e.g. a death certificate or obituary — and proposes linking them and checking the task off. Bank statements, loan papers, and insurance policies also propose a Finances entry.</p>
        <button onClick={matchDocuments} disabled={running} className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm disabled:opacity-50">
          {running ? 'Working…' : 'Match documents'}
        </button>
      </div>

      {/* Forensic audit */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-white mb-1">Forensic financial audit</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Upload bank/financial statements. Concrete records (accounts, loans, recurring obligations, insurance) become private Finances entries; anything that needs investigating (unknown transfers, large deposits) becomes a private task.</p>
        <label className="block border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-4 text-center cursor-pointer hover:border-gray-400 mb-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">{files.length > 0 ? `${files.length} file(s) selected` : 'Click to add financial statements (PDF/images)'}</span>
          <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => setFiles(Array.from(e.target.files || []))} />
        </label>
        <button onClick={forensic} disabled={running || files.length === 0} className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm disabled:opacity-50">
          {running ? 'Working…' : 'Run forensic audit'}
        </button>
      </div>

      {/* Suggestions */}
      {loading ? (
        <div className="text-gray-400 text-sm">Loading…</div>
      ) : suggestions.length === 0 ? (
        <div className="text-gray-400 text-sm">No pending suggestions. Run a review or forensic audit above.</div>
      ) : (
        <div className="space-y-5">
          {[['Financial entries → Finances', finSugs], ['Suggested tasks', reviewSugs], ['Document → task matches', docSugs], ['Forensic findings (private)', forensicSugs]].map(([label, list]) => list.length > 0 && (
            <div key={label}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{label}</h3>
              <div className="space-y-2">
                {list.map(s => (
                  <div key={s.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{s.title}</div>
                        {s.detail && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.detail}</div>}
                        {s.kind === 'financial' ? (
                          <div className="text-xs text-gray-400 mt-1">
                            {FIN_CATEGORY_LABEL[s.fin_category] ?? s.fin_category}
                            {fmtMoney(s.fin_amount) ? ` · ${fmtMoney(s.fin_amount)}` : ''}
                            {s.fin_lender ? ` · ${s.fin_lender}` : ''}
                            {s.is_private ? ' · 🔒 private' : ''}
                          </div>
                        ) : (
                          s.suggested_phase && <div className="text-xs text-gray-400 mt-1">{s.suggested_phase}{s.is_private ? ' · 🔒 private' : ''}</div>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => accept(s)} className="text-xs px-2.5 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700">Accept</button>
                        <button onClick={() => dismiss(s)} className="text-xs px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200">Dismiss</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="flex gap-4">
            <Link to="/tasks" className="text-sm text-blue-600 hover:underline">View task board →</Link>
            <Link to="/finances" className="text-sm text-blue-600 hover:underline">View finances →</Link>
          </div>
        </div>
      )}

      <LegalDisclaimer className="mt-8 border-t border-gray-100 dark:border-gray-800 pt-4" />
    </div>
  )
}
