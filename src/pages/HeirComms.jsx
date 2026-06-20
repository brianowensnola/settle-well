import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { generateHeirDigest } from '../lib/aiAdvisor'
import { HEIR_NOTICE_TYPES, NOTICE_TEMPLATES, noticeLabel, sendHeirNotice } from '../lib/heirComms'

const when = d => d ? new Date(d).toLocaleDateString() : null

export default function HeirComms() {
  const { currentEstate } = useEstate()
  const [heirs, setHeirs] = useState([])
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ noticeType: 'progress_update', title: '', body: '', email: true, sms: false })
  const [picked, setPicked] = useState(new Set())
  const [drafting, setDrafting] = useState(false)
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState('')
  const composerRef = useRef(null)

  useEffect(() => { if (currentEstate) load() }, [currentEstate])

  async function load() {
    setLoading(true)
    const [hRes, lRes] = await Promise.all([
      supabase.from('estate_users').select('id, name, email, phone, sms_consent, role').eq('estate_id', currentEstate.id).in('role', ['heir', 'observer']),
      supabase.from('estate_heir_notice_log').select('*').eq('estate_id', currentEstate.id).order('sent_at', { ascending: false }),
    ])
    const hs = hRes.data ?? []
    setHeirs(hs)
    setLog(lRes.data ?? [])
    setPicked(new Set(hs.filter(h => h.email).map(h => h.id)))
    setLoading(false)
  }

  // Most recent send per notice type, for the checklist.
  const lastByType = {}
  for (const row of log) if (!lastByType[row.notice_type]) lastByType[row.notice_type] = row

  function startCompose(noticeType) {
    const tmpl = NOTICE_TEMPLATES[noticeType]?.(currentEstate.deceased_name) || ''
    setForm(f => ({ ...f, noticeType, title: noticeType === 'progress_update' ? '' : noticeLabel(noticeType), body: tmpl }))
    setPicked(new Set(heirs.filter(h => h.email).map(h => h.id)))
    setMsg('')
    setTimeout(() => composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  async function draftWithAI() {
    setDrafting(true); setMsg('')
    try {
      const r = await generateHeirDigest(currentEstate.id)
      setForm(f => ({ ...f, body: r.digest }))
    } catch (e) { setMsg(e.message || 'Could not draft the update') }
    finally { setDrafting(false) }
  }

  function togglePick(id) {
    setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function send() {
    if (!form.body.trim()) { setMsg('Add a message before sending.'); return }
    const ids = [...picked]
    if (!ids.length) { setMsg('Select at least one recipient.'); return }
    const channels = [form.email && 'email', form.sms && 'sms'].filter(Boolean)
    if (!channels.length) { setMsg('Choose at least one delivery channel.'); return }
    setSending(true); setMsg('')
    try {
      const r = await sendHeirNotice({ estateId: currentEstate.id, noticeType: form.noticeType, title: form.title, body: form.body, recipientIds: ids, channels })
      setMsg(`Sent — ${r.emailed} email${r.emailed === 1 ? '' : 's'}${r.texted ? `, ${r.texted} text${r.texted === 1 ? '' : 's'}` : ''}. Recorded as proof.`)
      setForm(f => ({ ...f, title: '', body: '' }))
      await load()
    } catch (e) { setMsg(e.message || 'Could not send') }
    finally { setSending(false) }
  }

  async function removeLog(id) {
    if (!confirm('Remove this record from the proof log? This does not un-send anything.')) return
    await supabase.from('estate_heir_notice_log').delete().eq('id', id)
    setLog(l => l.filter(x => x.id !== id))
  }

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate selected.</div>
  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  const required = HEIR_NOTICE_TYPES.filter(n => n.category !== 'other')
  const noEmailHeirs = heirs.length > 0 && heirs.every(h => !h.email)

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-1">Heir Communications</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Send updates and required notices to the heirs — and keep a record that you did. Keeping beneficiaries informed is part of your fiduciary duty and the best protection against disputes.
        </p>
      </div>

      {heirs.length === 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-5 mb-6 text-sm text-amber-800 dark:text-amber-300">
          No heirs or beneficiaries are set up yet. <Link to="/admin" className="underline font-medium">Add them in People &amp; Access</Link> so you can send them updates.
        </div>
      )}
      {noEmailHeirs && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-5 mb-6 text-sm text-amber-800 dark:text-amber-300">
          Your heirs don't have email addresses on file. <Link to="/admin" className="underline font-medium">Add their emails</Link> so notices can reach them.
        </div>
      )}

      {/* Required notices checklist */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Notices &amp; updates</h2>
        <p className="text-xs text-gray-400 mb-4">Generic baseline — exact requirements vary by state. Confirm specifics with the estate's attorney.</p>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {required.map(n => {
            const last = lastByType[n.key]
            return (
              <div key={n.key} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{n.label}</span>
                    {n.category === 'required'
                      ? <span className="text-[10px] uppercase tracking-wide text-rose-600 dark:text-rose-400 font-semibold">Required</span>
                      : <span className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Recommended</span>}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{n.desc}</p>
                  <p className={`text-xs mt-1 ${last ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                    {last ? `✓ Last sent ${when(last.sent_at)} to ${(last.recipients?.length ?? 0)} recipient${(last.recipients?.length ?? 0) === 1 ? '' : 's'}` : 'Not sent yet'}
                  </p>
                </div>
                <button onClick={() => startCompose(n.key)} disabled={!heirs.length}
                  className="shrink-0 text-xs px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40">
                  {last ? 'Send again' : 'Compose'}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Composer */}
      <div ref={composerRef} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Compose</h2>

        <label className="text-xs text-gray-500 block mb-1">Type</label>
        <select value={form.noticeType} onChange={e => startCompose(e.target.value)}
          className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm mb-4">
          {HEIR_NOTICE_TYPES.map(n => <option key={n.key} value={n.key}>{n.label}</option>)}
        </select>

        <label className="text-xs text-gray-500 block mb-1">Recipients</label>
        <div className="flex flex-wrap gap-2 mb-4">
          {heirs.length === 0 && <span className="text-xs text-gray-400">No heirs available.</span>}
          {heirs.map(h => (
            <button key={h.id} onClick={() => togglePick(h.id)} disabled={!h.email}
              className={`text-xs px-3 py-1.5 rounded-full border ${picked.has(h.id) ? 'bg-gray-900 dark:bg-gray-700 text-white border-gray-900 dark:border-gray-700' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'} disabled:opacity-40`}
              title={h.email || 'No email on file'}>
              {picked.has(h.id) ? '✓ ' : ''}{h.name || h.email || 'Heir'}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-500">Subject</label>
          {form.noticeType === 'progress_update' && (
            <button onClick={draftWithAI} disabled={drafting}
              className="text-xs px-2.5 py-1 bg-indigo-600 text-white rounded-md disabled:opacity-50">
              {drafting ? 'Writing…' : '✨ Draft with AI'}
            </button>
          )}
        </div>
        <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          placeholder={`Update on the ${currentEstate.deceased_name} estate`}
          className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm mb-4" />

        <label className="text-xs text-gray-500 block mb-1">Message</label>
        <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} rows={8}
          placeholder="Write your update or notice to the heirs…"
          className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm mb-4" />

        <label className="text-xs text-gray-500 block mb-1">Send by</label>
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input type="checkbox" checked={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.checked }))} /> Email
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-400" title="Available once your text-message sender number is approved.">
            <input type="checkbox" checked={form.sms} onChange={e => setForm(f => ({ ...f, sms: e.target.checked }))} /> Text (SMS)
            <span className="text-[10px] uppercase tracking-wide">soon</span>
          </label>
        </div>

        {msg && <div className="text-xs mb-3 text-gray-600 dark:text-gray-300">{msg}</div>}

        <button onClick={send} disabled={sending || !heirs.length}
          className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
          {sending ? 'Sending…' : 'Send to heirs'}
        </button>
        <p className="text-xs text-gray-400 mt-2">Heirs can read this in their portal too, and every send is recorded below as proof.</p>
      </div>

      {/* Proof log */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Record of what's been sent</h2>
        {log.length === 0 ? (
          <p className="text-sm text-gray-400">Nothing sent yet.</p>
        ) : (
          <div className="space-y-3">
            {log.map(row => (
              <div key={row.id} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{row.title || noticeLabel(row.notice_type)}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {when(row.sent_at)} · {noticeLabel(row.notice_type)} · {(row.channels || []).join(', ') || 'email'} · {(row.recipients?.length ?? 0)} recipient{(row.recipients?.length ?? 0) === 1 ? '' : 's'}
                    </div>
                    {Array.isArray(row.recipients) && row.recipients.length > 0 && (
                      <div className="text-xs text-gray-400 mt-0.5 truncate">
                        {row.recipients.map(r => `${r.name || r.email || 'heir'}${r.emailed ? '' : r.texted ? '' : ' (not delivered)'}`).join(', ')}
                      </div>
                    )}
                  </div>
                  <button onClick={() => removeLog(row.id)} className="shrink-0 text-xs text-gray-400 hover:text-rose-500">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
