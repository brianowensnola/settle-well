import { useEffect, useState } from 'react'
import { useEstate } from '../lib/EstateContext'
import { useUser } from '../lib/AuthContext'
import { isFullAccess } from '../lib/roles'
import { loadInbox, uploadMailFile, routeMailItem, dismissMailItem, signedUrl } from '../lib/familyMail'

export default function FamilyMail() {
  const { estates } = useEstate()
  const user = useUser()
  const [items, setItems] = useState([])
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [choice, setChoice] = useState({})   // mailId -> { estateId, name }
  const [loading, setLoading] = useState(true)

  const canUse = estates?.some(e => isFullAccess(e._role) || e._role === 'collaborator')

  useEffect(() => {
    loadInbox().then(d => { setItems(d); setLoading(false) })
  }, [])

  function setChoiceFor(it) {
    setChoice(prev => prev[it.id] ? prev : { ...prev, [it.id]: { estateId: it.suggested_estate_id || '', name: it.ai_name || it.original_name || '' } })
  }
  useEffect(() => { items.forEach(setChoiceFor) }, [items])

  if (!canUse) return <div className="p-8 text-gray-400">The family Mail inbox is available to executors and collaborators.</div>

  async function refresh() { setItems(await loadInbox()) }

  async function upload() {
    if (files.length === 0) { setError('Add at least one file first.'); return }
    setBusy(true); setError('')
    try {
      for (let i = 0; i < files.length; i++) {
        setProgress(`Uploading and reading ${i + 1} of ${files.length}…`)
        await uploadMailFile(files[i], user)
      }
      setFiles([])
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
      await routeMailItem(item, c.estateId, c.name)
      setItems(prev => prev.filter(x => x.id !== item.id))
    } catch (e) { setError(e.message || 'Filing failed') }
    finally { setBusy(false) }
  }

  async function dismiss(item) {
    await dismissMailItem(item.id)
    setItems(prev => prev.filter(x => x.id !== item.id))
  }

  const estateName = id => estates?.find(e => e.id === id)?.deceased_name ?? ''

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <h1 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white mb-1">Mail Intake</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">One inbox for the whole family. Upload mail here — AI suggests which estate it belongs to, you approve, and it's filed under the right one. No need to pick an estate first.</p>

      {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}
      {progress && <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 px-4 py-3 rounded-lg text-sm mb-4">{progress}</div>}

      {/* Upload */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-6">
        <label className="block border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 text-center cursor-pointer hover:border-gray-400">
          <div className="text-2xl mb-1">📬</div>
          <span className="text-sm text-gray-600 dark:text-gray-400">{files.length > 0 ? `${files.length} file(s) selected` : 'Click to add mail (PDF, JPG, PNG, HEIC)'}</span>
          <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.heic" className="hidden"
            onChange={e => setFiles(Array.from(e.target.files || []))} disabled={busy} />
        </label>
        <button onClick={upload} disabled={busy || files.length === 0}
          className="mt-3 px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm disabled:opacity-50">
          {busy ? 'Working…' : 'Upload to inbox'}
        </button>
      </div>

      {/* Inbox */}
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Inbox ({items.length})</h2>
      {loading ? (
        <div className="text-gray-400 text-sm">Loading…</div>
      ) : items.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 text-center text-gray-400 text-sm">Inbox is empty. Upload mail above.</div>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const c = choice[item.id] || { estateId: '', name: '' }
            const lowConf = item.ai_confidence != null && item.ai_confidence < 0.6
            return (
              <div key={item.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <input
                    value={c.name}
                    onChange={e => setChoice(p => ({ ...p, [item.id]: { ...c, name: e.target.value } }))}
                    className="flex-1 min-w-0 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none"
                  />
                  <button onClick={() => view(item)} className="text-xs text-blue-600 hover:underline shrink-0 mt-1.5">View</button>
                </div>
                {item.ai_summary && <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{item.ai_summary}</p>}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-400">File under:</span>
                  <select
                    value={c.estateId}
                    onChange={e => setChoice(p => ({ ...p, [item.id]: { ...c, estateId: e.target.value } }))}
                    className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-2 py-1 text-sm focus:outline-none"
                  >
                    <option value="">Choose estate…</option>
                    {estates?.map(e => <option key={e.id} value={e.id}>{e.deceased_name}</option>)}
                  </select>
                  {item.suggested_estate_id && (
                    <span className={`text-xs ${lowConf ? 'text-amber-600' : 'text-gray-400'}`}>
                      AI suggests: {estateName(item.suggested_estate_id)}{item.ai_confidence != null ? ` (${Math.round(item.ai_confidence * 100)}%)` : ''}{lowConf ? ' — low confidence, please confirm' : ''}
                    </span>
                  )}
                  {!item.suggested_estate_id && <span className="text-xs text-amber-600">AI couldn't tell — please choose</span>}
                  <div className="flex gap-2 ml-auto">
                    <button onClick={() => approve(item)} disabled={busy} className="text-xs px-2.5 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">Approve &amp; file</button>
                    <button onClick={() => dismiss(item)} className="text-xs px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200">Dismiss</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
