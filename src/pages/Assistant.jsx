import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { isFullAccess } from '../lib/roles'
import { runAdvisor, loadSuggestions, acceptSuggestion, dismissSuggestion, markSuggestionDone, loadSuggestionLog, restoreSuggestion } from '../lib/aiAdvisor'
import LegalDisclaimer from '../components/LegalDisclaimer'

const FIN_CATEGORY_LABEL = {
  account: 'Account', obligation: 'Monthly Obligation', liability: 'Liability',
  asset: 'Asset', insurance_resolved: 'Insurance — Resolved', insurance_pending: 'Insurance — Pending',
}
const fmtMoney = n => n == null ? null : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', currencySign: 'accounting', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

// Auto-run the "what am I missing?" review at most this often per estate (per
// device). Dedup on the server keeps repeats from piling up; this just limits
// how often we spend an Opus call.
const AUTO_REVIEW_THROTTLE_MS = 6 * 60 * 60 * 1000
const lastAutoKey = id => `sw_last_auto_review_${id}`

export default function Assistant() {
  const { currentEstate, role } = useEstate()
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [autoRunning, setAutoRunning] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [files, setFiles] = useState([])
  const [agentEnabled, setAgentEnabled] = useState(true)
  const [busyIds, setBusyIds] = useState(new Set())
  const [log, setLog] = useState([])

  useEffect(() => {
    if (!currentEstate) return
    supabase.from('estate_ai_agent_state').select('enabled').eq('estate_id', currentEstate.id).maybeSingle()
      .then(({ data }) => setAgentEnabled(data?.enabled ?? true))
  }, [currentEstate])

  async function toggleAgent() {
    const next = !agentEnabled
    setAgentEnabled(next)
    await supabase.from('estate_ai_agent_state').upsert({ estate_id: currentEstate.id, enabled: next }, { onConflict: 'estate_id' })
  }

  useEffect(() => {
    if (!currentEstate) return
    let cancelled = false
    ;(async () => {
      const initial = await loadSuggestions(currentEstate.id)
      if (cancelled) return
      setSuggestions(initial)
      loadLog()
      setLoading(false)
      // Auto-run the review in the background (executor only), throttled.
      if (!isFullAccess(role)) return
      const key = lastAutoKey(currentEstate.id)
      const last = Number(localStorage.getItem(key) || 0)
      if (Date.now() - last < AUTO_REVIEW_THROTTLE_MS) return
      localStorage.setItem(key, String(Date.now()))
      setAutoRunning(true)
      try {
        await runAdvisor(currentEstate.id, 'review')
        if (!cancelled) await refresh()
      } catch { /* auto-run is best-effort; the manual button is still there */ }
      finally { if (!cancelled) setAutoRunning(false) }
    })()
    return () => { cancelled = true }
  }, [currentEstate])

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate selected.</div>
  if (!isFullAccess(role)) return <div className="p-8 text-gray-400">The AI Assistant is available to the executor only.</div>

  async function loadLog() {
    setLog(await loadSuggestionLog(currentEstate.id))
  }
  async function restore(s) {
    await restoreSuggestion(s.id)
    setLog(prev => prev.filter(x => x.id !== s.id))
    refresh()
  }

  async function refresh() {
    setSuggestions(await loadSuggestions(currentEstate.id))
    loadLog()
  }

  async function review() {
    setRunning(true); setError(''); setProgress('Reviewing the estate — this can take a minute…')
    // A manual run resets the auto-run throttle so we don't immediately re-run.
    localStorage.setItem(lastAutoKey(currentEstate.id), String(Date.now()))
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

  async function stateLaw() {
    setRunning(true); setError(''); setProgress(`Looking up ${currentEstate.state_of_residence || 'state'} probate guidance — this can take a minute…`)
    try {
      await runAdvisor(currentEstate.id, 'statelaw')
      await refresh()
    } catch (e) { setError(e.message || 'State guidance failed') }
    finally { setRunning(false); setProgress('') }
  }

  async function organizeTasks() {
    setRunning(true); setError(''); setProgress('Auditing the task list for duplicates and grouping…')
    try {
      await runAdvisor(currentEstate.id, 'taskaudit')
      await refresh()
    } catch (e) { setError(e.message || 'Task audit failed') }
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
    setBusyIds(prev => new Set(prev).add(s.id))
    await acceptSuggestion(s)
    setSuggestions(prev => prev.filter(x => x.id !== s.id))
    loadLog()
  }
  async function dismiss(s) {
    setBusyIds(prev => new Set(prev).add(s.id))
    await dismissSuggestion(s.id)
    setSuggestions(prev => prev.filter(x => x.id !== s.id))
    loadLog()
  }
  async function markDone(s) {
    setBusyIds(prev => new Set(prev).add(s.id))
    await markSuggestionDone(s.id)
    setSuggestions(prev => prev.filter(x => x.id !== s.id))
    loadLog()
  }
  async function acceptAll(list) {
    const ids = new Set(list.map(s => s.id))
    setBusyIds(prev => new Set([...prev, ...ids]))
    for (const s of list) await acceptSuggestion(s)
    setSuggestions(prev => prev.filter(x => !ids.has(x.id)))
    loadLog()
  }
  async function dismissAll(list) {
    const ids = new Set(list.map(s => s.id))
    setBusyIds(prev => new Set([...prev, ...ids]))
    for (const s of list) await dismissSuggestion(s.id)
    setSuggestions(prev => prev.filter(x => !ids.has(x.id)))
    loadLog()
  }

  const reviewSugs = suggestions.filter(s => s.kind === 'review')
  const forensicSugs = suggestions.filter(s => s.kind === 'forensic')
  const docSugs = suggestions.filter(s => s.kind === 'documents')
  const finSugs = suggestions.filter(s => s.kind === 'financial')
  const stateLawSugs = suggestions.filter(s => s.kind === 'statelaw')
  const auditSugs = suggestions.filter(s => s.kind === 'taskaudit')

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <h1 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white mb-1">AI Assistant</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Suggestions only — you accept what's right. Assistance, not legal advice.</p>

      {/* Background agent control */}
      <div className="flex items-center justify-between gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-800 dark:text-white">Background agent {agentEnabled ? '· on' : '· off'}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Automatically reviews this estate when its data changes (about every 30 minutes) and posts suggestions below. You still accept or dismiss each one.</div>
        </div>
        <button
          onClick={toggleAgent}
          className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${agentEnabled ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-700'}`}
          aria-pressed={agentEnabled}
          title={agentEnabled ? 'Turn the background agent off for this estate' : 'Turn the background agent on for this estate'}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${agentEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}
      {progress && <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 px-4 py-3 rounded-lg text-sm mb-4">{progress}</div>}
      {autoRunning && !progress && (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-4">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
          Checking for anything you've missed…
        </div>
      )}

      {/* Pending findings — the review focus, shown first */}
      {loading ? (
        <div className="text-gray-400 text-sm mb-6">Loading…</div>
      ) : suggestions.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-6 text-sm text-gray-500 dark:text-gray-400">
          {autoRunning ? 'Reviewing the estate…' : '✓ All caught up — no suggestions to review right now.'}
        </div>
      ) : (
        <div className="space-y-5 mb-6">
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {suggestions.length} suggestion{suggestions.length === 1 ? '' : 's'} to review
          </div>
          {[['Task cleanup — duplicates & grouping', auditSugs], ['Financial entries → Finances', finSugs], ['Suggested tasks', reviewSugs], ['State probate guidance (verify — not legal advice)', stateLawSugs], ['Document → task matches', docSugs], ['Forensic findings (private)', forensicSugs]].map(([label, list]) => list.length > 0 && (
            <div key={label}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label} · {list.length}</h3>
                <div className="flex gap-3 shrink-0">
                  <button onClick={() => acceptAll(list)} className="text-xs text-green-700 dark:text-green-400 hover:underline">Accept all</button>
                  <button onClick={() => dismissAll(list)} className="text-xs text-gray-400 hover:text-red-500 hover:underline">Dismiss all</button>
                </div>
              </div>
              <div className="space-y-2">
                {list.map(s => (
                  <div key={s.id} className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 ${busyIds.has(s.id) ? 'opacity-50' : ''}`}>
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
                      <div className="flex flex-wrap gap-2 shrink-0 justify-end">
                        <button onClick={() => accept(s)} disabled={busyIds.has(s.id)} className="text-xs px-2.5 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">Accept</button>
                        {['review', 'statelaw', 'forensic', 'financial'].includes(s.kind) && (
                          <button onClick={() => markDone(s)} disabled={busyIds.has(s.id)} title="I've already handled this — record it as done and stop suggesting it" className="text-xs px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 disabled:opacity-50">Already done</button>
                        )}
                        <button onClick={() => dismiss(s)} disabled={busyIds.has(s.id)} className="text-xs px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 disabled:opacity-50">Dismiss</button>
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

      {/* Run a new analysis — secondary to reviewing findings, so collapsed */}
      <details className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl mb-4">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-gray-800 dark:text-white">
          ▸ Run a new analysis
          <span className="font-normal text-gray-400"> — review the estate, match documents, state probate guidance, or a forensic audit</span>
        </summary>
        <div className="px-5 pb-5 space-y-4">
          {/* What am I missing */}
          <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white mb-1">What am I missing?</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Reviews your intake, tasks, notes, documents, and assets and proposes tasks or gaps you may have missed.</p>
            <button onClick={review} disabled={running} className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm disabled:opacity-50">
              {running ? 'Working…' : 'Review the estate'}
            </button>
          </div>
          {/* Match documents to tasks */}
          <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white mb-1">Match documents to tasks</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Looks at your uploaded documents and the tasks they satisfy — e.g. a death certificate or obituary — and proposes linking them and checking the task off. Bank statements, loan papers, and insurance policies also propose a Finances entry.</p>
            <button onClick={matchDocuments} disabled={running} className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm disabled:opacity-50">
              {running ? 'Working…' : 'Match documents'}
            </button>
          </div>
          {/* Organize tasks */}
          <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white mb-1">Organize tasks</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Audits your task list for duplicates and related tasks that could be grouped. Proposes merges (keep one, remove the rest) and groupings (nest tasks under a parent) — you accept each one.</p>
            <button onClick={organizeTasks} disabled={running} className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm disabled:opacity-50">
              {running ? 'Working…' : 'Organize tasks'}
            </button>
          </div>
          {/* State probate guidance */}
          <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white mb-1">State probate guidance</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Looks up the probate steps, deadlines, and filing options specific to <strong>{currentEstate.state_of_residence || "the estate's state"}</strong> and proposes tasks. General guidance — always verify specifics with the probate court or your attorney.</p>
            <button onClick={stateLaw} disabled={running} className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm disabled:opacity-50">
              {running ? 'Working…' : `Get ${currentEstate.state_of_residence || 'state'} guidance`}
            </button>
          </div>
          {/* Forensic audit */}
          <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
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
        </div>
      </details>

      {/* Suggestion log — full history of everything you've acted on, + undo */}
      {log.length > 0 && (
        <details className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl mt-4">
          <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
            ▸ Suggestion log ({log.length})
            <span className="font-normal text-gray-400"> — everything already suggested and what you did with it</span>
          </summary>
          <div className="px-5 pb-4 space-y-2">
            {log.map(s => {
              const badge = s.status === 'accepted'
                ? { label: 'Accepted', cls: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' }
                : s.status === 'done'
                ? { label: 'Already done', cls: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' }
                : { label: 'Dismissed', cls: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400' }
              return (
                <div key={s.id} className="flex items-center justify-between gap-3 text-sm border-t border-gray-100 dark:border-gray-800 pt-2">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${badge.cls}`}>{badge.label}</span>
                    <span className={`truncate ${s.status === 'dismissed' ? 'text-gray-500 dark:text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300'}`}>{s.title}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-gray-400 hidden sm:inline">{new Date(s.created_at).toLocaleDateString()}</span>
                    <button onClick={() => restore(s)} title="Put this back into review" className="text-xs text-blue-600 hover:underline">Restore</button>
                  </div>
                </div>
              )
            })}
            <p className="text-[11px] text-gray-400 pt-1">Accepted, already-done, and dismissed items are all remembered — the assistant won't re-suggest any of them, even reworded. Restore one to bring it back into review.</p>
          </div>
        </details>
      )}

      <LegalDisclaimer className="mt-8 border-t border-gray-100 dark:border-gray-800 pt-4" />
    </div>
  )
}
