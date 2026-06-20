import { useEffect, useRef, useState } from 'react'
import { supabase, getAccessToken } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { useUser } from '../lib/AuthContext'
import { isFullAccess, roleLabel } from '../lib/roles'

const stamp = d => new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function Messages() {
  const { currentEstate, role } = useEstate()
  const user = useUser()
  const exec = isFullAccess(role)
  const [messages, setMessages] = useState([])
  const [me, setMe] = useState({ name: '', role })
  const [body, setBody] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const endRef = useRef(null)

  useEffect(() => { if (currentEstate && user) load() }, [currentEstate?.id, user?.id])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  async function load() {
    setLoading(true)
    const [mRes, meRes] = await Promise.all([
      supabase.from('estate_messages').select('*').eq('estate_id', currentEstate.id).order('created_at', { ascending: true }),
      supabase.from('estate_users').select('name, role').eq('estate_id', currentEstate.id).eq('auth_user_id', user.id).maybeSingle(),
    ])
    setMessages(mRes.data ?? [])
    setMe({ name: meRes.data?.name || user.email || 'Me', role: meRes.data?.role || role })
    setLoading(false)
  }

  async function send() {
    const text = body.trim()
    if (!text) return
    setSending(true)
    try {
      const { data, error } = await supabase.from('estate_messages').insert({
        estate_id: currentEstate.id,
        body: text,
        author_name: me.name,
        author_role: me.role,
        is_private: exec ? isPrivate : false,
      }).select().single()
      if (error) throw error
      setBody(''); setIsPrivate(false)
      setMessages(m => [...m, data])
      // Notify the other members (best-effort — never blocks the post).
      if (!data.is_private) {
        try {
          const token = await getAccessToken()
          fetch('/.netlify/functions/notify-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ estateId: currentEstate.id, messageId: data.id }),
          }).catch(() => {})
        } catch { /* ignore */ }
      }
    } catch (e) { alert(e.message || 'Could not send the message') }
    finally { setSending(false) }
  }

  async function remove(id) {
    if (!confirm('Delete this message?')) return
    await supabase.from('estate_messages').delete().eq('id', id)
    setMessages(m => m.filter(x => x.id !== id))
  }

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate selected.</div>

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full flex flex-col" style={{ minHeight: 'calc(100vh - 6rem)' }}>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-1">Messages</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          A shared place for questions and updates about the {currentEstate.deceased_name} estate. Everyone with access can read and reply; new messages send a notification.
        </p>
      </div>

      <div className="flex-1 space-y-3 mb-4">
        {loading ? <div className="text-sm text-gray-400">Loading…</div>
          : messages.length === 0 ? <div className="text-sm text-gray-400">No messages yet. Start the conversation below.</div>
          : messages.map(m => {
            const mine = m.author_user_id === user.id
            return (
              <div key={m.id} className={`rounded-xl p-3 border ${m.is_private ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    <span className="font-medium text-gray-700 dark:text-gray-200">{m.author_name || 'Member'}</span>
                    {m.author_role && <span className="ml-1">· {roleLabel(m.author_role)}</span>}
                    <span className="ml-1">· {stamp(m.created_at)}</span>
                    {m.is_private && <span className="ml-1 text-amber-600 dark:text-amber-400">· Private note (executor only)</span>}
                  </div>
                  {(mine || exec) && <button onClick={() => remove(m.id)} className="text-xs text-gray-400 hover:text-rose-500 shrink-0">Delete</button>}
                </div>
                <div className="text-sm text-gray-900 dark:text-white whitespace-pre-line">{m.body}</div>
              </div>
            )
          })}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-950 pt-2">
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={3}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }}
          placeholder="Write a message… (⌘/Ctrl+Enter to send)"
          className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm mb-2" />
        <div className="flex items-center justify-between gap-3">
          {exec ? (
            <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <input type="checkbox" checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)} />
              Private note (only you see this — heirs won't)
            </label>
          ) : <span />}
          <button onClick={send} disabled={sending || !body.trim()}
            className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
