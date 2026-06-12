import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { CONTACT_ROLES } from '../lib/constants'

export default function ContactDetail() {
  const { id } = useParams()
  const { currentEstate } = useEstate()
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

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>
  if (!contact) return <div className="p-8 text-gray-400">Contact not found.</div>

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto w-full">
      <Link to="/contacts" className="text-sm text-gray-400 hover:text-gray-600 mb-4 block">← Back to contacts</Link>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        {editing ? (
          <div className="space-y-3">
            {[['name','Name'],['company','Company'],['phone','Phone'],['phone2','Phone 2'],['email','Email'],['address','Address']].map(([k,l]) => (
              <div key={k}>
                <label className="text-xs text-gray-500 block mb-1">{l}</label>
                <input value={editData[k] ?? ''} onChange={e => setEditData(p => ({ ...p, [k]: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
            ))}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Role</label>
              <select value={editData.role ?? 'other'} onChange={e => setEditData(p => ({ ...p, role: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                {Object.entries(CONTACT_ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <textarea value={editData.notes ?? ''} onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))}
              rows={3} placeholder="Notes..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
            <div className="flex gap-2">
              <button onClick={saveEdit} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm">Save</button>
              <button onClick={() => setEditing(false)} className="px-4 py-2 text-gray-500 rounded-lg text-sm hover:bg-gray-100">Cancel</button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h1 className="text-lg font-semibold text-gray-900">{contact.name}</h1>
                {contact.company && <div className="text-sm text-gray-500">{contact.company}</div>}
                <div className="text-xs text-gray-400 mt-0.5">{CONTACT_ROLES[contact.role] ?? contact.role}</div>
              </div>
              <button onClick={() => { setEditing(true); setEditData({ ...contact }) }}
                className="text-xs text-blue-600 hover:underline">Edit</button>
            </div>
            <div className="space-y-1 text-sm">
              {contact.phone && <div><span className="text-gray-400">Phone: </span>{contact.phone}</div>}
              {contact.phone2 && <div><span className="text-gray-400">Phone 2: </span>{contact.phone2}</div>}
              {contact.email && <div><span className="text-gray-400">Email: </span>{contact.email}</div>}
              {contact.address && <div><span className="text-gray-400">Address: </span>{contact.address}</div>}
              {contact.notes && <div className="text-gray-600 mt-2 pt-2 border-t border-gray-100">{contact.notes}</div>}
            </div>
          </div>
        )}
      </div>

      {/* Log interaction */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Log Interaction</h2>
        <div className="flex gap-3 mb-2">
          {['outbound','inbound'].map(d => (
            <label key={d} className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
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
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none mb-2"
        />
        <button onClick={logInteraction} disabled={!logForm.summary.trim()} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm disabled:opacity-40">
          Log
        </button>
      </div>

      {/* Interaction history */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Interaction History</h2>
        {interactions.length === 0 && <p className="text-sm text-gray-400">No interactions logged.</p>}
        <div className="space-y-3">
          {interactions.map(i => (
            <div key={i.id} className="text-sm border-l-2 border-gray-200 pl-3">
              <div className="text-xs text-gray-400 mb-0.5">{i.created_at?.slice(0, 10)} · {i.direction}</div>
              <div className="text-gray-700">{i.summary}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
