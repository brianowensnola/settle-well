import { useEffect, useState } from 'react'
import { useEstate } from '../lib/EstateContext'
import { useUser } from '../lib/AuthContext'
import { isFullAccess } from '../lib/roles'
import { loadInbox, uploadMailPiece, routeMailItem, dismissMailItem, signedUrl } from '../lib/familyMail'

const today = () => new Date().toISOString().slice(0, 10)

export default function FamilyMail() {
  const { estates } = useEstate()
  const user = useUser()
  const isExecutor = (estates ?? []).some(e => isFullAccess(e._role))
  const isCollaborator = (estates ?? []).some(e => e._role === 'collaborator')
  const canUse = isExecutor || isCollaborator

  const [items, setItems] = useState([])
  const [pages, setPages] = useState([])          // File[] for the current mailpiece
  const [dateReceived, setDateReceived] = useState(today())
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [choice, setChoice] = useState({})        // mailId -> { estateId, name }
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadInbox().then(d => { setItems(d); setLoading(false) }) }, [])
  useEffect(() => {
    setChoice(prev => {
      const next = { ...prev }
      for (const it of items) if (!next[it.id]) next[it.id] = { estateId: it.suggested_estate_id || '', name: it.ai_name || it.original_name || '', ledger: !!it.is_bill, ledgerCat: 'obligation' }
      return next
    })
  }, [items])

  if (!canUse) return <div className="p-8 text-gray-400">The family Mail inbox is available to executors and collaborators.</div>

  async function refresh() { setItems(await loadInbox()) }

  function addPages(fileList) {
    const files = Array.from(fileList || [])
    if (files.length) setPages(prev => [...prev, ...files])
  }

  async function submitPiece() {
    if (pages.length === 0) { setError('Add the envelope and at least one page first.'); return }
    setBusy(true); setError('')
    try {
      setProgress('Building the scanned document and reading it…')
      await uploadMailPiece(pages, dateReceived, user)
      setPages([]); setDateReceived(today())
      await refresh()
    } catch (e) { setError(e.message || 'Upload failed') }
    finally { setBusy(false); setProgress('') }
  }

  async function view(item) {
    const url = await signedUrl(item.file_path)
    if (url) window.open(url, '_blank')
  }

  async function approve(item) {
    const c = choice[item.id]
    if (!c?.estateId) { setError('Pick an estate to file this under.'); return }
    setBusy(true); setError('')
    try {
      const ledger = (item.is_bill && c.ledger) ? { add: true, category: c.ledgerCat, amount: item.bill_amount } : null
      await routeMailItem(item, c.estateId, c.name, ledger)
      setItems(prev => prev.filter(x => x.id !== item.id))
    } catch (e) { setError(e.message || 'Filing failed') }
    finally { setBusy(false) }
  }

  async function dismiss(item) {
    if (!confirm('Discard this mailpiece? Its file is removed.')) return
    await dismissMailItem(item)
    setItems(prev => prev.filter(x => x.id !== item.id))
  }

  const estateName = id => estates?.find(e => e.id === id)?.deceased_name ?? ''

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <h1 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white mb-1">Mail Intake</h1>

      {/* Instructions */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-5 text-sm text-blue-900 dark:text-blue-200">
        <div className="font-semibold mb-1">How to scan mail</div>
        <ol className="list-decimal ml-5 space-y-0.5 text-blue-800 dark:text-blue-300">
          <li>Do <strong>one piece of mail at a time</strong>.</li>
          <li>Photograph the <strong>envelope first</strong>, then <strong>every page</strong> inside (front of each page).</li>
          <li>Set the <strong>date received</strong>, then tap <strong>Submit mailpiece</strong>.</li>
          <li>The executor reviews and files it — you don't pick where it goes.</li>
        </ol>
      </div>

      {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}
      {progress && <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 px-4 py-3 rounded-lg text-sm mb-4">{progress}</div>}

      {/* Scan one mailpiece */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-white mb-3">Scan a mailpiece</h2>

        <label className="text-xs text-gray-500 block mb-1">Date received</label>
        <input type="date" value={dateReceived} onChange={e => setDateReceived(e.target.value)}
          className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none mb-3" />

        <label className="block border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-5 text-center cursor-pointer hover:border-gray-400 mb-2">
          <div className="text-2xl mb-1">📸</div>
          <span className="text-sm text-gray-600 dark:text-gray-400">{pages.length === 0 ? 'Add the envelope, then each page' : '+ Add another page'}</span>
          <input type="file" accept="image/*,.pdf" capture="environment" multiple className="hidden"
            onChange={e => { addPages(e.target.files); e.target.value = '' }} disabled={busy} />
        </label>

        {pages.length > 0 && (
          <div className="space-y-1 mb-3">
            {pages.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-xs bg-gray-50 dark:bg-gray-800 rounded px-2 py-1">
                <span className="truncate">{i === 0 ? '✉️ ' : `📄 p${i} · `}{f.name}</span>
                <button onClick={() => setPages(prev => prev.filter((_, x) => x !== i))} className="text-gray-400 hover:text-red-500 shrink-0 ml-2">remove</button>
              </div>
            ))}
            <p className="text-[11px] text-gray-400">First image is treated as the envelope.</p>
          </div>
        )}

        <button onClick={submitPiece} disabled={busy || pages.length === 0}
          className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm disabled:opacity-50">
          {busy ? 'Working…' : 'Submit mailpiece'}
        </button>
      </div>

      {/* Queue */}
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
        {isExecutor ? `Awaiting your review (${items.length})` : `Submitted — awaiting executor review (${items.length})`}
      </h2>
      {loading ? (
        <div className="text-gray-400 text-sm">Loading…</div>
      ) : items.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 text-center text-gray-400 text-sm">Nothing waiting. Scan a mailpiece above.</div>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const c = choice[item.id] || { estateId: '', name: '' }
            return (
              <div key={item.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="min-w-0">
                    {isExecutor ? (
                      <input value={c.name} onChange={e => setChoice(p => ({ ...p, [item.id]: { ...c, name: e.target.value } }))}
                        className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-2 py-1 text-sm font-medium focus:outline-none" />
                    ) : (
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{item.ai_name || item.original_name}</div>
                    )}
                    <div className="text-xs text-gray-400 mt-0.5">
                      {item.date_received ? `Received ${item.date_received}` : ''}{item.sender ? ` · From ${item.sender}` : ''}
                    </div>
                  </div>
                  <button onClick={() => view(item)} className="text-xs text-blue-600 hover:underline shrink-0 mt-1">View</button>
                </div>

                {item.ai_summary && <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{item.ai_summary}</p>}
                <div className="flex gap-1.5 flex-wrap mb-2">
                  {item.urgent && <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">⏰ time-sensitive</span>}
                  {item.is_bill && <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">💵 bill{item.bill_amount ? ` · $${item.bill_amount}` : ''}{item.bill_due ? ` · due ${item.bill_due}` : ''}</span>}
                </div>

                {isExecutor && item.is_bill && (
                  <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 mb-2 flex-wrap">
                    <input type="checkbox" checked={!!c.ledger} onChange={e => setChoice(p => ({ ...p, [item.id]: { ...c, ledger: e.target.checked } }))} />
                    Add to Finances as
                    <select value={c.ledgerCat} onChange={e => setChoice(p => ({ ...p, [item.id]: { ...c, ledgerCat: e.target.value } }))}
                      className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded px-1.5 py-0.5 text-xs focus:outline-none">
                      <option value="obligation">Monthly obligation</option>
                      <option value="liability">Liability (debt)</option>
                    </select>
                    {item.bill_amount ? <span className="text-gray-400">${item.bill_amount}{item.bill_due ? ` · due ${item.bill_due}` : ''}</span> : null}
                  </label>
                )}
                {isExecutor ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-400">File under:</span>
                    <select value={c.estateId} onChange={e => setChoice(p => ({ ...p, [item.id]: { ...c, estateId: e.target.value } }))}
                      className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-2 py-1 text-sm focus:outline-none">
                      <option value="">Choose estate…</option>
                      {estates?.map(e => <option key={e.id} value={e.id}>{e.deceased_name}</option>)}
                    </select>
                    {item.suggested_estate_id && <span className="text-xs text-gray-400">AI: {estateName(item.suggested_estate_id)}</span>}
                    <div className="flex gap-2 ml-auto">
                      <button onClick={() => approve(item)} disabled={busy} className="text-xs px-2.5 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">Approve &amp; file</button>
                      <button onClick={() => dismiss(item)} className="text-xs px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200">Discard</button>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">Awaiting executor review{item.suggested_estate_id ? ` · AI suggests ${estateName(item.suggested_estate_id)}` : ''}</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
