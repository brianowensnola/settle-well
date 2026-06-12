import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'

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
    const { error } = await supabase.from('estates').update({ ...form, updated_at: new Date().toISOString() }).eq('id', currentEstate.id)
    if (error) {
      alert(`Error saving: ${error.message}`)
      console.error('Save error:', error)
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
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Users & Invites</h2>

        {/* Invite form */}
        <form onSubmit={inviteUser} className="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 space-y-2">
          <label className="text-xs text-gray-500 block">Invite heir or observer by email</label>
          <div className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="heir@example.com"
              className="flex-1 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none"
            />
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
              className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none"
            >
              <option value="heir">Heir</option>
              <option value="observer">Observer</option>
            </select>
            <button
              type="submit"
              disabled={inviting || !inviteEmail.trim()}
              className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm disabled:opacity-40"
            >
              {inviting ? '...' : 'Invite'}
            </button>
          </div>
        </form>

        {/* User list */}
        <div className="space-y-1 text-sm">
          {users.length === 0 && <p className="text-gray-400">No users yet.</p>}
          {users.map(user => {
            const inviteUrl = !user.auth_user_id ? `https://settle-well.netlify.app/invite?email=${encodeURIComponent(user.email)}` : null
            return (
              <div key={user.id} className="px-3 py-2 border border-gray-100 rounded-lg bg-gray-50 dark:bg-gray-800">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <div className="font-medium text-gray-800 dark:text-white">{user.email}</div>
                    <div className="text-xs text-gray-400">{user.role} {user.auth_user_id ? '(confirmed)' : '(pending)'}</div>
                  </div>
                  <button
                    onClick={() => removeUser(user.id)}
                    className="text-xs text-red-500 hover:text-red-700 underline"
                  >
                    Remove
                  </button>
                </div>
                {inviteUrl && (
                  <div className="mt-1.5 flex gap-2 items-start">
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        readOnly
                        value={inviteUrl}
                        className="w-full text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded px-2 py-1 text-gray-700 dark:text-gray-300 truncate"
                      />
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(inviteUrl)
                        alert('Link copied! Send via text, WhatsApp, email, or any way you prefer.')
                      }}
                      className="shrink-0 text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Copy
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
