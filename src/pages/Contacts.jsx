import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { CONTACT_ROLES } from '../lib/constants'

export default function Contacts() {
  const { currentEstate } = useEstate()
  const [contacts, setContacts] = useState([])
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', company: '', role: 'other', phone: '', email: '', notes: '' })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentEstate) return
    load()
  }, [currentEstate])

  async function load() {
    const { data } = await supabase.from('estate_contacts').select('*').eq('estate_id', currentEstate.id).order('name')
    setContacts(data ?? [])
    setLoading(false)
  }

  async function save() {
    if (!form.name) return
    const { data } = await supabase.from('estate_contacts').insert({ ...form, estate_id: currentEstate.id }).select().single()
    if (data) setContacts(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setAdding(false)
    setForm({ name: '', company: '', role: 'other', phone: '', email: '', notes: '' })
  }

  async function seedContacts() {
    const keyContacts = [
      { name: 'Paul Mullin', company: 'Cotts Law Firm', role: 'attorney', phone: '', email: '', notes: 'Estate planning & probate attorney' },
      { name: 'Cotts Law Firm', company: '', role: 'attorney', phone: '', email: '', notes: 'Legal counsel for estate matters' },
      { name: 'Guardian Funeral Home', company: '', role: 'funeral_home', phone: '', email: '', notes: 'Funeral arrangements & cremation' },
      { name: 'PNC Bank', company: '', role: 'bank', phone: '', email: '', notes: 'Estate accounts & financial assets' },
      { name: 'Truist', company: '', role: 'bank', phone: '', email: '', notes: 'Banking & investment accounts' },
      { name: 'Goodleap', company: '', role: 'lender', phone: '', email: '', notes: 'HELOC & lending services' },
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
          {contacts.length === 0 && (
            <button onClick={seedContacts} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              Seed Key Contacts
            </button>
          )}
          <button onClick={() => setAdding(true)} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm">+ Add contact</button>
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
            <div>
              <label className="text-xs text-gray-500 block mb-1">Role</label>
              <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
                {Object.entries(CONTACT_ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Phone</label>
              <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Email</label>
              <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
            </div>
          </div>
          <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            placeholder="Notes..." rows={2}
            className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
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
                  <Link key={c.id} to={`/contacts/${c.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:bg-gray-800">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-800 dark:text-white">{c.name}</div>
                      {c.company && <div className="text-xs text-gray-500">{c.company}</div>}
                    </div>
                    <div className="text-right text-xs text-gray-400">
                      {c.phone && <div>{c.phone}</div>}
                      {c.email && <div>{c.email}</div>}
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
