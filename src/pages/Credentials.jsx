import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { useUser } from '../lib/AuthContext'

const ACCOUNT_TYPES = {
  email: 'Email',
  banking: 'Banking',
  business: 'Business',
  streaming: 'Streaming',
  social: 'Social Media',
  investment: 'Investment',
  insurance: 'Insurance',
  utility: 'Utility',
  other: 'Other',
}

export default function Credentials() {
  const { currentEstate } = useEstate()
  const user = useUser()
  const [credentials, setCredentials] = useState([])
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)
  const [showPassword, setShowPassword] = useState({})
  const [form, setForm] = useState({ site: '', username: '', password: '', account_type: 'other', category: '', notes: '', is_critical: false })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentEstate) return
    load()
  }, [currentEstate])

  async function load() {
    const { data } = await supabase
      .from('estate_credentials')
      .select('*')
      .eq('estate_id', currentEstate.id)
      .order('is_critical', { ascending: false })
      .order('site')
    setCredentials(data ?? [])
    setLoading(false)
  }

  async function save() {
    if (!form.site.trim() || !form.username.trim() || !form.password.trim()) {
      alert('Site, username, and password are required')
      return
    }

    if (editing) {
      const { error } = await supabase
        .from('estate_credentials')
        .update({ ...form, updated_at: new Date().toISOString() })
        .eq('id', editing)
      if (!error) {
        await logAccess(editing, 'edit')
        setCredentials(prev => prev.map(c => c.id === editing ? { ...c, ...form } : c))
        setEditing(null)
        setForm({ site: '', username: '', password: '', account_type: 'other', category: '', notes: '', is_critical: false })
      }
    } else {
      const { data } = await supabase
        .from('estate_credentials')
        .insert({ ...form, estate_id: currentEstate.id })
        .select()
        .single()
      if (data) {
        await logAccess(data.id, 'edit')
        setCredentials(prev => [data, ...prev])
        setAdding(false)
        setForm({ site: '', username: '', password: '', account_type: 'other', category: '', notes: '', is_critical: false })
      }
    }
  }

  async function deleteCredential(id) {
    if (!confirm('Delete this credential? This cannot be undone.')) return
    await supabase.from('estate_credentials').delete().eq('id', id)
    setCredentials(prev => prev.filter(c => c.id !== id))
  }

  async function logAccess(credentialId, action) {
    await supabase.from('estate_credentials_log').insert({
      credential_id: credentialId,
      estate_id: currentEstate.id,
      accessed_by: user?.email ?? 'Brian',
      action,
    })
  }

  function copyToClipboard(text, action) {
    navigator.clipboard.writeText(text)
    logAccess(null, action)
    alert('Copied to clipboard')
  }

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  const filtered = credentials.filter(c => {
    const q = search.toLowerCase()
    return c.site.toLowerCase().includes(q) || c.username.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)
  })

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Credentials Vault</h1>
        <button onClick={() => setAdding(true)} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm">
          + Add credential
        </button>
      </div>

      <div className="mb-4">
        <input
          placeholder="Search sites, usernames, categories..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
        />
      </div>

      {/* Add/Edit Form */}
      {(adding || editing) && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Site/Service Name *</label>
              <input
                value={form.site}
                onChange={e => setForm(p => ({ ...p, site: e.target.value }))}
                placeholder="e.g., Gmail, Wells Fargo, PayPal"
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Account Type</label>
              <select
                value={form.account_type}
                onChange={e => setForm(p => ({ ...p, account_type: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
              >
                {Object.entries(ACCOUNT_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Username/Email *</label>
              <input
                value={form.username}
                onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                placeholder="username or email"
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Password *</label>
              <input
                type="password"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                placeholder="password"
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Category (optional)</label>
            <input
              value={form.category}
              onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
              placeholder="e.g., Deceased's Accounts, Business"
              className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="Account number, recovery email, etc."
              rows={2}
              className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={form.is_critical}
              onChange={e => setForm(p => ({ ...p, is_critical: e.target.checked }))}
            />
            Mark as critical (email, banking, etc.)
          </label>

          <div className="flex gap-2">
            <button onClick={save} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm">
              {editing ? 'Save changes' : 'Add credential'}
            </button>
            <button
              onClick={() => {
                setAdding(false)
                setEditing(null)
                setForm({ site: '', username: '', password: '', account_type: 'other', category: '', notes: '', is_critical: false })
              }}
              className="px-4 py-2 text-gray-500 rounded-lg text-sm hover:bg-gray-100 dark:bg-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Credentials List */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
        {filtered.length === 0 && (
          <div className="p-6 text-sm text-gray-400">
            {credentials.length === 0 ? 'No credentials yet. Add one to get started.' : 'No results found.'}
          </div>
        )}
        <div className="divide-y divide-gray-100">
          {filtered.map(cred => (
            <div key={cred.id} className="p-4">
              <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-gray-900 dark:text-white">{cred.site}</span>
                    {cred.is_critical && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">Critical</span>}
                    {cred.account_type && <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded">{ACCOUNT_TYPES[cred.account_type]}</span>}
                  </div>
                  {cred.category && <div className="text-xs text-gray-400">{cred.category}</div>}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setEditing(cred.id)
                      setForm(cred)
                      setAdding(false)
                    }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Edit
                  </button>
                  <button onClick={() => deleteCredential(cred.id)} className="text-xs text-red-600 hover:underline">
                    Delete
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm mb-2">
                <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-400">Username</div>
                    <div className="text-gray-800 dark:text-white font-mono text-sm break-all">{cred.username}</div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(cred.username, 'copy')}
                    className="shrink-0 text-xs px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded ml-2"
                  >
                    Copy
                  </button>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-400">Password</div>
                    <div className="text-gray-800 dark:text-white font-mono text-sm">
                      {showPassword[cred.id] ? cred.password : '••••••••'}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => setShowPassword(p => ({ ...p, [cred.id]: !p[cred.id] }))}
                      className="text-xs px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded"
                    >
                      {showPassword[cred.id] ? 'Hide' : 'Show'}
                    </button>
                    <button
                      onClick={() => copyToClipboard(cred.password, 'copy')}
                      className="text-xs px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </div>

              {cred.notes && <div className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-2 rounded mb-2">{cred.notes}</div>}

              <div className="text-xs text-gray-400">Added {cred.created_at?.slice(0, 10)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
