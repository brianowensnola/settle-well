import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { isFullAccess } from '../lib/roles'
import { CONTACT_ROLES } from '../lib/constants'

export default function ContactDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { currentEstate, estates, role } = useEstate()
  const canDelete = isFullAccess(role)
  const [contact, setContact] = useState(null)
  const [interactions, setInteractions] = useState([])
  const [logForm, setLogForm] = useState({ direction: 'outbound', summary: '' })
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase.from('estate_contacts').select('*').eq('id', id).single(),
      supabase.from('estate_contact_interactions').select('*').eq('contact_id', id).order('created_at', { ascending: false }),
    ]).then(([c, i]) => {
      setContact(c.data)
      setInteractions(i.data ?? [])
      setLoading(false)
    })
  }, [id])

  async function logInteraction() {
    if (!logForm.summary.trim()) return
    const { data } = await supabase.from('estate_contact_interactions').insert({
      contact_id: id,
      estate_id: currentEstate.id,
      direction: logForm.direction,
      summary: logForm.summary.trim(),
    }).select().single()
    if (data) setInteractions(prev => [data, ...prev])
    setLogForm({ direction: 'outbound', summary: '' })
  }

  async function saveEdit() {
    await supabase.from('estate_contacts').update({ ...editData, updated_at: new Date().toISOString() }).eq('id', id)
    setContact(prev => ({ ...prev, ...editData }))
    setEditing(false)
  }

  async function deleteContact() {
    const shared = contact.shared_with?.length > 0
    if (!confirm(`Delete "${contact.name}"?${shared ? ' This removes it from every estate it\'s shared with.' : ''} This can't be undone.`)) return
    const { error } = await supabase.from('estate_contacts').delete().eq('id', id)
    if (error) { alert(`Couldn't delete: ${error.message}`); return }
    navigate('/contacts')
  }

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>
  if (!contact) return <div className="p-8 text-gray-400">Contact not found.</div>

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto w-full">
      <Link to="/contacts" className="text-sm text-gray-400 hover:text-gray-600 dark:text-gray-400 mb-4 block">← Back to contacts</Link>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-4">
        {editing ? (
          <div className="space-y-3">
            {[['name','Name'],['company','Company']].map(([k,l]) => (
              <div key={k}>
                <label className="text-xs text-gray-500 block mb-1">{l}</label>
                <input value={editData[k] ?? ''} onChange={e => setEditData(p => ({ ...p, [k]: e.target.value }))}
                  className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
            ))}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Role</label>
              <select value={editData.role ?? 'other'} onChange={e => setEditData(p => ({ ...p, role: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
                {Object.entries(CONTACT_ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            {/* Phones */}
            <div>
              <label className="text-xs text-gray-500 block mb-2">Phone Numbers</label>
              <div className="space-y-2">
                {(editData.phones ?? []).map((phone, idx) => (
                  <div key={idx} className="flex gap-2">
                    <select value={editData.phone_labels?.[idx] || 'Cell'} onChange={e => {
                      const updated = [...(editData.phone_labels ?? [])]
                      updated[idx] = e.target.value
                      setEditData(p => ({ ...p, phone_labels: updated }))
                    }}
                      className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-2 py-2 text-sm focus:outline-none">
                      <option>Cell</option>
                      <option>Work</option>
                      <option>Home</option>
                      <option>Assistant</option>
                      <option>Other</option>
                    </select>
                    <input value={phone} onChange={e => {
                      const updated = [...(editData.phones ?? [])]
                      updated[idx] = e.target.value
                      setEditData(p => ({ ...p, phones: updated }))
                    }}
                      className="flex-1 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
                    {(editData.phones ?? []).length > 0 && (
                      <button onClick={() => setEditData(p => ({ ...p, phones: (p.phones ?? []).filter((_, i) => i !== idx), phone_labels: (p.phone_labels ?? []).filter((_, i) => i !== idx) }))}
                        className="px-2 py-2 text-gray-400 hover:text-red-500">×</button>
                    )}
                  </div>
                ))}
                <button onClick={() => setEditData(p => ({ ...p, phones: [...(p.phones ?? []), ''], phone_labels: [...(p.phone_labels ?? []), 'Cell'] }))}
                  className="text-xs text-blue-600 hover:text-blue-700">+ Add phone</button>
              </div>
            </div>

            {/* Emails */}
            <div>
              <label className="text-xs text-gray-500 block mb-2">Email Addresses</label>
              <div className="space-y-2">
                {(editData.emails ?? []).map((email, idx) => (
                  <div key={idx} className="flex gap-2">
                    <select value={editData.email_labels?.[idx] || 'Primary'} onChange={e => {
                      const updated = [...(editData.email_labels ?? [])]
                      updated[idx] = e.target.value
                      setEditData(p => ({ ...p, email_labels: updated }))
                    }}
                      className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-2 py-2 text-sm focus:outline-none">
                      <option>Primary</option>
                      <option>Work</option>
                      <option>Assistant</option>
                      <option>Other</option>
                    </select>
                    <input value={email} onChange={e => {
                      const updated = [...(editData.emails ?? [])]
                      updated[idx] = e.target.value
                      setEditData(p => ({ ...p, emails: updated }))
                    }}
                      className="flex-1 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
                    {(editData.emails ?? []).length > 0 && (
                      <button onClick={() => setEditData(p => ({ ...p, emails: (p.emails ?? []).filter((_, i) => i !== idx), email_labels: (p.email_labels ?? []).filter((_, i) => i !== idx) }))}
                        className="px-2 py-2 text-gray-400 hover:text-red-500">×</button>
                    )}
                  </div>
                ))}
                <button onClick={() => setEditData(p => ({ ...p, emails: [...(p.emails ?? []), ''], email_labels: [...(p.email_labels ?? []), 'Primary'] }))}
                  className="text-xs text-blue-600 hover:text-blue-700">+ Add email</button>
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Address</label>
              <textarea value={editData.address ?? ''} onChange={e => setEditData(p => ({ ...p, address: e.target.value }))}
                rows={2} placeholder="Street, City, State ZIP"
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Website</label>
              <input value={editData.website ?? ''} onChange={e => setEditData(p => ({ ...p, website: e.target.value }))}
                placeholder="example.com"
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
            </div>

            <textarea value={editData.notes ?? ''} onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))}
              rows={3} placeholder="Notes..."
              className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />

            {/* Opt-in: also show this contact in another estate */}
            {estates?.filter(e => e.id !== (editData.estate_id ?? contact.estate_id)).length > 0 && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">Also show in (optional)</label>
                <div className="space-y-1">
                  {estates.filter(e => e.id !== (editData.estate_id ?? contact.estate_id)).map(e => (
                    <label key={e.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={(editData.shared_with ?? []).includes(e.id)}
                        onChange={ev => setEditData(p => ({
                          ...p,
                          shared_with: ev.target.checked
                            ? [...(p.shared_with ?? []), e.id]
                            : (p.shared_with ?? []).filter(x => x !== e.id),
                        }))}
                      />
                      {e.deceased_name} estate
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">Unchecked = this contact stays only in its own estate.</p>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={saveEdit} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm">Save</button>
              <button onClick={() => setEditing(false)} className="px-4 py-2 text-gray-500 rounded-lg text-sm hover:bg-gray-100 dark:bg-gray-800">Cancel</button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{contact.name}</h1>
                {contact.company && <div className="text-sm text-gray-500 dark:text-gray-400">{contact.company}</div>}
                <div className="text-xs text-gray-400 mt-0.5">{CONTACT_ROLES[contact.role] ?? contact.role}</div>
                {contact.shared_with?.length > 0 && (
                  <div className="text-xs text-blue-600 dark:text-blue-300 mt-0.5">
                    ↔ Shared with {contact.shared_with.map(eid => estates?.find(e => e.id === eid)?.deceased_name).filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
              <div className="flex gap-3 shrink-0">
                <button onClick={() => { setEditing(true); setEditData({ ...contact }) }}
                  className="text-xs text-blue-600 hover:underline">Edit</button>
                {canDelete && (
                  <button onClick={deleteContact} className="text-xs text-red-500 hover:text-red-700 hover:underline">Delete</button>
                )}
              </div>
            </div>
            <div className="space-y-1 text-sm">
              {contact.phones?.length > 0 && contact.phones.map((p, i) => <div key={i}><span className="text-gray-400">{contact.phone_labels?.[i] || 'Phone'}: </span>{p}</div>)}
              {contact.emails?.length > 0 && contact.emails.map((e, i) => <div key={i}><span className="text-gray-400">{contact.email_labels?.[i] || 'Email'}: </span>{e}</div>)}
              {contact.address && <div className="whitespace-pre-line"><span className="text-gray-400">Address: </span>{contact.address}</div>}
              {contact.website && (
                <div>
                  <span className="text-gray-400">Website: </span>
                  <a href={/^https?:\/\//i.test(contact.website) ? contact.website : `https://${contact.website}`}
                    target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{contact.website}</a>
                </div>
              )}
              {contact.notes && <div className="text-gray-600 dark:text-gray-400 mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">{contact.notes}</div>}
            </div>
          </div>
        )}
      </div>

      {/* Log interaction */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Log Interaction</h2>
        <div className="flex gap-3 mb-2">
          {['outbound','inbound'].map(d => (
            <label key={d} className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
              <input type="radio" name="direction" value={d} checked={logForm.direction === d} onChange={() => setLogForm(p => ({ ...p, direction: d }))} />
              {d === 'outbound' ? 'I called / sent' : 'They called / sent'}
            </label>
          ))}
        </div>
        <textarea
          value={logForm.summary}
          onChange={e => setLogForm(p => ({ ...p, summary: e.target.value }))}
          placeholder="What was discussed or decided..."
          rows={3}
          className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none resize-none mb-2"
        />
        <button onClick={logInteraction} disabled={!logForm.summary.trim()} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm disabled:opacity-40">
          Log
        </button>
      </div>

      {/* Interaction history */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Interaction History</h2>
        {interactions.length === 0 && <p className="text-sm text-gray-400">No interactions logged.</p>}
        <div className="space-y-3">
          {interactions.map(i => (
            <div key={i.id} className="text-sm border-l-2 border-gray-200 dark:border-gray-800 pl-3">
              <div className="text-xs text-gray-400 mb-0.5">{i.created_at?.slice(0, 10)} · {i.direction}</div>
              <div className="text-gray-700 dark:text-gray-300">{i.summary}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
