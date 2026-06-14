import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { isFullAccess } from '../lib/roles'
import { CONTACT_ROLES } from '../lib/constants'

export default function Contacts() {
  const { currentEstate, estates, role } = useEstate()
  const canManage = isFullAccess(role) || role === 'collaborator'
  const [contacts, setContacts] = useState([])
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', company: '', role: 'other', phones: [''], phone_labels: ['Cell'], emails: [''], email_labels: ['Primary'], address: '', website: '', notes: '', shared_with: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentEstate) return
    load()
  }, [currentEstate])

  async function load() {
    // Contacts whose home is this estate, OR that are shared into this estate.
    const { data } = await supabase.from('estate_contacts').select('*')
      .or(`estate_id.eq.${currentEstate.id},shared_with.cs.{${currentEstate.id}}`)
      .order('name')
    setContacts(data ?? [])
    setLoading(false)
  }

  async function save() {
    if (!form.name) return
    const phones = form.phones.filter(p => p.trim())
    const phone_labels = form.phone_labels.slice(0, phones.length)
    const emails = form.emails.filter(e => e.trim())
    const email_labels = form.email_labels.slice(0, emails.length)
    const { data } = await supabase.from('estate_contacts').insert({
      name: form.name,
      company: form.company,
      role: form.role,
      phones,
      phone_labels,
      emails,
      email_labels,
      address: form.address,
      website: form.website || null,
      notes: form.notes,
      estate_id: currentEstate.id,
      shared_with: form.shared_with ?? [],
    }).select().single()
    if (data) setContacts(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setAdding(false)
    setForm({ name: '', company: '', role: 'other', phones: [''], phone_labels: ['Cell'], emails: [''], email_labels: ['Primary'], address: '', website: '', notes: '', shared_with: [] })
  }

  async function seedContacts() {
    const keyContacts = [
      { name: 'Paul Mullin', company: 'Cotts Law Firm', role: 'attorney', phones: [], emails: [], notes: 'Estate planning & probate attorney' },
      { name: 'Cotts Law Firm', company: '', role: 'attorney', phones: [], emails: [], notes: 'Legal counsel for estate matters' },
      { name: 'Guardian Funeral Home', company: '', role: 'funeral_home', phones: [], emails: [], notes: 'Funeral arrangements & cremation' },
      { name: 'PNC Bank', company: '', role: 'bank', phones: [], emails: [], notes: 'Estate accounts & financial assets' },
      { name: 'Truist', company: '', role: 'bank', phones: [], emails: [], notes: 'Banking & investment accounts' },
      { name: 'Goodleap', company: '', role: 'lender', phones: [], emails: [], notes: 'HELOC & lending services' },
    ]

    for (const contact of keyContacts) {
      await supabase.from('estate_contacts').insert({ ...contact, estate_id: currentEstate.id })
    }
    await load()
  }

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  const q = search.toLowerCase()
  const filtered = contacts.filter(c =>
    !q || c.name.toLowerCase().includes(q) || (c.company ?? '').toLowerCase().includes(q)
  )

  const byRole = {}
  for (const c of filtered) {
    const r = c.role ?? 'other'
    if (!byRole[r]) byRole[r] = []
    byRole[r].push(c)
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white">Contacts</h1>
        <div className="flex gap-2">
          {canManage && contacts.length === 0 && (
            <button onClick={seedContacts} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              Seed Key Contacts
            </button>
          )}
          {canManage && <button onClick={() => setAdding(true)} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm">+ Add contact</button>}
        </div>
      </div>

      <input
        placeholder="Search contacts..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 mb-4"
      />

      {adding && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Name *</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Company</label>
              <input value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 block mb-1">Role</label>
              <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
                {Object.entries(CONTACT_ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          {/* Phones */}
          <div>
            <label className="text-xs text-gray-500 block mb-2">Phone Numbers</label>
            <div className="space-y-2">
              {form.phones.map((phone, idx) => (
                <div key={idx} className="flex gap-2">
                  <select value={form.phone_labels[idx] || 'Cell'} onChange={e => {
                    const updated = [...form.phone_labels]
                    updated[idx] = e.target.value
                    setForm(p => ({ ...p, phone_labels: updated }))
                  }}
                    className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-2 py-2 text-sm focus:outline-none">
                    <option>Cell</option>
                    <option>Work</option>
                    <option>Home</option>
                    <option>Assistant</option>
                    <option>Other</option>
                  </select>
                  <input value={phone} onChange={e => {
                    const updated = [...form.phones]
                    updated[idx] = e.target.value
                    setForm(p => ({ ...p, phones: updated }))
                  }}
                    placeholder="Phone number"
                    className="flex-1 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
                  {form.phones.length > 1 && (
                    <button onClick={() => setForm(p => ({ ...p, phones: p.phones.filter((_, i) => i !== idx), phone_labels: p.phone_labels.filter((_, i) => i !== idx) }))}
                      className="px-2 py-2 text-gray-400 hover:text-red-500">×</button>
                  )}
                </div>
              ))}
              <button onClick={() => setForm(p => ({ ...p, phones: [...p.phones, ''], phone_labels: [...p.phone_labels, 'Cell'] }))}
                className="text-xs text-blue-600 hover:text-blue-700">+ Add phone</button>
            </div>
          </div>

          {/* Emails */}
          <div>
            <label className="text-xs text-gray-500 block mb-2">Email Addresses</label>
            <div className="space-y-2">
              {form.emails.map((email, idx) => (
                <div key={idx} className="flex gap-2">
                  <select value={form.email_labels[idx] || 'Primary'} onChange={e => {
                    const updated = [...form.email_labels]
                    updated[idx] = e.target.value
                    setForm(p => ({ ...p, email_labels: updated }))
                  }}
                    className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-2 py-2 text-sm focus:outline-none">
                    <option>Primary</option>
                    <option>Work</option>
                    <option>Assistant</option>
                    <option>Other</option>
                  </select>
                  <input value={email} onChange={e => {
                    const updated = [...form.emails]
                    updated[idx] = e.target.value
                    setForm(p => ({ ...p, emails: updated }))
                  }}
                    placeholder="Email address"
                    className="flex-1 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
                  {form.emails.length > 1 && (
                    <button onClick={() => setForm(p => ({ ...p, emails: p.emails.filter((_, i) => i !== idx), email_labels: p.email_labels.filter((_, i) => i !== idx) }))}
                      className="px-2 py-2 text-gray-400 hover:text-red-500">×</button>
                  )}
                </div>
              ))}
              <button onClick={() => setForm(p => ({ ...p, emails: [...p.emails, ''], email_labels: [...p.email_labels, 'Primary'] }))}
                className="text-xs text-blue-600 hover:text-blue-700">+ Add email</button>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Address</label>
            <textarea value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
              placeholder="Street, City, State ZIP" rows={2}
              className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Website</label>
            <input value={form.website} onChange={e => setForm(p => ({ ...p, website: e.target.value }))}
              placeholder="example.com"
              className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
          </div>

          <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            placeholder="Notes..." rows={2}
            className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />

          {/* Opt-in: also show this contact in another estate */}
          {estates?.filter(e => e.id !== currentEstate.id).length > 0 && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">Also show in (optional)</label>
              <div className="space-y-1">
                {estates.filter(e => e.id !== currentEstate.id).map(e => (
                  <label key={e.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={(form.shared_with ?? []).includes(e.id)}
                      onChange={ev => setForm(p => ({
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
              <p className="text-xs text-gray-400 mt-1">Leave unchecked to keep this contact only in the current estate.</p>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={save} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm">Save</button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 text-gray-500 rounded-lg text-sm hover:bg-gray-100 dark:bg-gray-800">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {Object.entries(CONTACT_ROLES).map(([roleKey, roleLabel]) => {
          const group = byRole[roleKey]
          if (!group?.length) return null
          return (
            <div key={roleKey} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{roleLabel}</span>
              </div>
              <div className="divide-y divide-gray-100">
                {group.map(c => (
                  <Link key={c.id} to={`/contacts/${c.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-800 dark:text-white flex items-center gap-2">
                        {c.name}
                        {(c.shared_with?.length > 0 || c.estate_id !== currentEstate.id) && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300">↔ shared</span>
                        )}
                      </div>
                      {c.company && <div className="text-xs text-gray-500 dark:text-gray-400">{c.company}</div>}
                    </div>
                    <div className="text-right text-xs text-gray-400 space-y-0.5">
                      {c.phones?.length > 0 && c.phones.map((p, i) => <div key={i}>{c.phone_labels?.[i] || 'Phone'}: {p}</div>)}
                      {c.emails?.length > 0 && c.emails.map((e, i) => <div key={i}>{c.email_labels?.[i] || 'Email'}: {e}</div>)}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
