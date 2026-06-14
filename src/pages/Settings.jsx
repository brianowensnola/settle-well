import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { INVITE_ROLES, roleLabel } from '../lib/roles'
import { STATUS_STAGES } from '../lib/constants'

export default function Settings() {
  const { currentEstate, reload } = useEstate()
  const [form, setForm] = useState({})
  const [saved, setSaved] = useState(false)
  const [users, setUsers] = useState([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('heir')
  const [inviting, setInviting] = useState(false)

  useEffect(() => {
    if (!currentEstate) return
    setForm({
      name: currentEstate.name,
      administrator_name: currentEstate.administrator_name ?? '',
      administrator_email: currentEstate.administrator_email ?? '',
      administrator_phone: currentEstate.administrator_phone ?? '',
      state_of_residence: currentEstate.state_of_residence ?? '',
      status: currentEstate.status,
      status_stage: currentEstate.status_stage ?? 'not_started',
    })
    loadUsers()
  }, [currentEstate])

  async function loadUsers() {
    const { data } = await supabase
      .from('estate_users')
      .select('*')
      .eq('estate_id', currentEstate.id)
    setUsers(data ?? [])
  }

  async function save(e) {
    e.preventDefault()
    const { data, error } = await supabase
      .from('estates')
      .update({ ...form, updated_at: new Date().toISOString() })
      .eq('id', currentEstate.id)
      .select()
    if (error) {
      alert(`Error saving: ${error.message}`)
      return
    }
    if (!data || data.length === 0) {
      alert('Update failed: no rows changed. Check your permissions for this estate.')
      return
    }
    setSaved(true)
    reload()
    setTimeout(() => setSaved(false), 3000)
  }

  async function inviteUser(e) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setInviting(true)

    // Check if already invited
    const { data: existing } = await supabase
      .from('estate_users')
      .select('id')
      .eq('estate_id', currentEstate.id)
      .eq('email', inviteEmail.toLowerCase())
      .single()

    if (existing) {
      alert('This email is already invited to this estate.')
      setInviting(false)
      return
    }

    // Create pending invite
    await supabase.from('estate_users').insert({
      estate_id: currentEstate.id,
      email: inviteEmail.toLowerCase(),
      name: inviteEmail.split('@')[0],
      role: inviteRole,
    })

    setInviteEmail('')
    setInviteRole('heir')
    await loadUsers()
    setInviting(false)
  }

  async function removeUser(userId) {
    if (!confirm('Remove this user?')) return
    await supabase.from('estate_users').delete().eq('id', userId)
    await loadUsers()
  }

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate.</div>

  return (
    <div className="p-4 md:p-6 max-w-xl mx-auto w-full">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-5">Settings</h1>

      <form onSubmit={save} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Estate Details</h2>
        {[
          ['name', 'Estate Name'],
          ['administrator_name', 'Executor Name'],
          ['administrator_email', 'Executor Email'],
          ['administrator_phone', 'Executor Phone'],
          ['state_of_residence', 'State'],
        ].map(([k, l]) => (
          <div key={k}>
            <label className="text-xs text-gray-500 block mb-1">{l}</label>
            <input value={form[k] ?? ''} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))}
              className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
          </div>
        ))}
        <div>
          <label className="text-xs text-gray-500 block mb-1">Status</label>
          <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
            className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
            <option value="active">Active</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Estate stage (shown to heirs on their Transparency Report)</label>
          <select value={form.status_stage ?? 'not_started'} onChange={e => setForm(p => ({ ...p, status_stage: e.target.value }))}
            className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
            {STATUS_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        <button type="submit" className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm">
          {saved ? 'Saved' : 'Save changes'}
        </button>
      </form>

      <div className="mt-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Estate Info (read-only)</h2>
        <div className="space-y-1 text-sm">
          <div><span className="text-gray-400">Deceased: </span>{currentEstate.deceased_name}</div>
          <div><span className="text-gray-400">Date of Birth: </span>{currentEstate.deceased_dob ?? '—'}</div>
          <div><span className="text-gray-400">Date of Death: </span>{currentEstate.deceased_dod}</div>
        </div>
      </div>

      <div className="mt-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Users &amp; Roles</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          People, roles, and passwords are now managed in one place for all estates:{' '}
          <Link to="/admin" className="text-blue-600 hover:underline">Multi-Estate → Users &amp; Roles</Link>.
        </p>
      </div>
    </div>
  )
}
