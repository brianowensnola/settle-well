import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { canAccess, isFullAccess } from '../lib/roles'
import { ACTIVE_OBLIGATION_STATUSES } from '../lib/constants'

function daysSince(dod) {
  if (!dod) return null
  const diff = new Date() - new Date(dod)
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function fmt(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', currencySign: 'accounting', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

const phaseLabel = l => (l || '').replace(/^Phase\s*\d+\s*[—–-]\s*/, '')
const whenStr = d => d ? new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

export default function AllEstates() {
  const navigate = useNavigate()
  const { estates, currentEstate, switchEstate, role } = useEstate()
  const isExec = isFullAccess(role)
  const [estateStats, setEstateStats] = useState({})
  const [tasks, setTasks] = useState([])          // family top-level tasks
  const [sectionMap, setSectionMap] = useState({}) // section_id -> { label, order }
  const [meetings, setMeetings] = useState([])
  const [aiByEstate, setAiByEstate] = useState({})
  const [lastRunByEstate, setLastRunByEstate] = useState({})
  const [mailPending, setMailPending] = useState(0)
  const [familyName, setFamilyName] = useState('')
  const [loading, setLoading] = useState(true)

  // Only the current family's estates — other families never show here.
  const familyEstates = estates.filter(e =>
    currentEstate && (currentEstate.group_id ? e.group_id === currentEstate.group_id : e.id === currentEstate.id))
  const familyEstateIds = familyEstates.map(e => e.id)
  const estateName = eid => estates.find(e => e.id === eid)?.deceased_name ?? ''

  useEffect(() => {
    if (!estates.length || !currentEstate) return
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estates, currentEstate?.id])

  useEffect(() => {
    let off = false
    ;(async () => {
      if (!currentEstate?.group_id) { setFamilyName(''); return }
      const { data } = await supabase.from('estate_groups').select('name').eq('id', currentEstate.group_id).maybeSingle()
      if (!off) setFamilyName(data?.name ?? '')
    })()
    return () => { off = true }
  }, [currentEstate?.group_id])

  async function loadAll() {
    const ids = familyEstateIds
    if (ids.length === 0) { setLoading(false); return }

    const [tasksRes, secRes, finRes, mtgRes, sugRes, agentRes, mailRes] = await Promise.all([
      supabase.from('estate_tasks').select('id, estate_id, status, text, section_id, assigned_to').in('estate_id', ids).is('parent_task_id', null),
      supabase.from('estate_sections').select('id, label, sort_order').in('estate_id', ids),
      supabase.from('estate_financials').select('estate_id, amount, category, status').in('estate_id', ids),
      supabase.from('estate_meetings').select('*').in('estate_id', ids).eq('status', 'scheduled').order('scheduled_at'),
      supabase.from('estate_ai_suggestions').select('estate_id').in('estate_id', ids).eq('status', 'pending'),
      supabase.from('estate_ai_agent_state').select('estate_id, last_run_at').in('estate_id', ids),
      supabase.from('family_mail').select('id').eq('status', 'pending'),
    ])

    const allTasks = tasksRes.data ?? []
    const fin = finRes.data ?? []
    const secMap = Object.fromEntries((secRes.data ?? []).map(s => [s.id, { label: s.label, order: s.sort_order ?? 99 }]))

    const stats = {}
    for (const estate of familyEstates) {
      const t = allTasks.filter(x => x.estate_id === estate.id)
      const f = fin.filter(x => x.estate_id === estate.id)
      const total = t.length
      const done = t.filter(x => x.status === 'done').length
      const inProgress = t.filter(x => x.status === 'in_progress').length
      const accounts = f.filter(x => x.category === 'account')
      const obligations = f.filter(x => x.category === 'obligation' && ACTIVE_OBLIGATION_STATUSES.includes(x.status))
      stats[estate.id] = {
        total, done, inProgress,
        pct: total ? Math.round((done / total) * 100) : 0,
        totalBalance: accounts.reduce((s, a) => s + (a.amount ?? 0), 0),
        monthlyBurn: obligations.reduce((s, o) => s + (o.amount ?? 0), 0),
      }
    }

    const aiCounts = {}
    for (const s of (sugRes.data ?? [])) aiCounts[s.estate_id] = (aiCounts[s.estate_id] ?? 0) + 1
    const runs = {}
    for (const r of (agentRes.data ?? [])) runs[r.estate_id] = r.last_run_at

    setTasks(allTasks)
    setSectionMap(secMap)
    setEstateStats(stats)
    setMeetings(mtgRes.data ?? [])
    setAiByEstate(aiCounts)
    setLastRunByEstate(runs)
    setMailPending((mailRes.data ?? []).length)
    setLoading(false)
  }

  if (!estates.length) return <div className="p-8 text-gray-400">No estates found.</div>
  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  // ---- Family-wide rollups ----
  const openTasks = tasks.filter(t => t.status !== 'done')
  const submitted = tasks.filter(t => t.status === 'submitted')
  const inProgress = tasks.filter(t => t.status === 'in_progress')
  const totalTasks = tasks.length
  const doneTasks = tasks.filter(t => t.status === 'done').length
  const overallPct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0
  const familyBalance = familyEstates.reduce((s, e) => s + (estateStats[e.id]?.totalBalance ?? 0), 0)
  const familyBurn = familyEstates.reduce((s, e) => s + (estateStats[e.id]?.monthlyBurn ?? 0), 0)
  const aiPending = familyEstates.reduce((s, e) => s + (aiByEstate[e.id] ?? 0), 0)
  const lastRun = familyEstates.map(e => lastRunByEstate[e.id]).filter(Boolean).sort().pop()
  const upcomingMeetings = meetings // already scoped to family + scheduled

  // "What's next": the soonest open work — pending/in-progress tasks ordered by
  // earliest phase first (Immediate before Taxes), excluding ones awaiting approval.
  const nextUp = openTasks
    .filter(t => t.status === 'pending' || t.status === 'in_progress')
    .sort((a, b) => (sectionMap[a.section_id]?.order ?? 99) - (sectionMap[b.section_id]?.order ?? 99))
    .slice(0, 6)

  const showMulti = familyEstates.length > 1

  // Quick-access tiles for the areas that used to live in the left nav.
  const quickLinks = [
    { to: '/all-tasks',        label: 'Combined Task List', icon: '✓',  desc: 'Every task across the family, in one place', badge: submitted.length },
    { to: '/family-finances',  label: 'Family Finances',    icon: '💰', desc: 'Accounts, debts, and obligations across estates' },
    { to: '/communications',   label: 'Communications',     icon: '✉️', desc: 'Calls, emails, letters & documents — the full history', execOnly: true },
    { to: '/mail',             label: 'Mail Intake',        icon: '📬', desc: 'File incoming mail to the right estate', badge: mailPending },
    { to: '/executor',         label: 'Executor Tools',     icon: '🧰', desc: 'Assets, documents, reports, notifications & more', execOnly: true },
    { to: '/reports',          label: 'Reports',            icon: '📊', desc: 'Asset lists & ledgers — print, save, or email', execOnly: true },
    { to: '/admin',            label: 'Users & Roles',      icon: '👥', desc: 'Invite people and manage access' },
  ].filter(l => canAccess(l.to, role) && (!l.execOnly || isExec))

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto w-full">
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white mb-1">
            {familyName || 'Family Estate'}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Managing {familyEstates.length} estate{familyEstates.length !== 1 ? 's' : ''}{familyName ? ' in this family' : ''} · {overallPct}% of tasks complete
          </p>
        </div>
        {currentEstate?.group_id && isExec && (
          <button
            onClick={() => navigate('/quick-estate', { state: { groupId: currentEstate.group_id, familyName } })}
            className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-700 whitespace-nowrap shrink-0"
          >
            + Add family member
          </button>
        )}
      </div>

      {/* At a glance — family-wide counts */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Link to="/all-tasks" className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 hover:shadow-md transition-shadow">
          <div className="text-2xl font-semibold text-gray-900 dark:text-white">{openTasks.length}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Open tasks</div>
        </Link>
        <Link to="/all-tasks" className={`rounded-xl p-4 border transition-shadow hover:shadow-md ${submitted.length ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'}`}>
          <div className={`text-2xl font-semibold ${submitted.length ? 'text-purple-700 dark:text-purple-300' : 'text-gray-900 dark:text-white'}`}>{submitted.length}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Needs approval</div>
        </Link>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-semibold text-blue-700 dark:text-blue-300">{inProgress.length}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">In progress</div>
        </div>
        {isExec && (
          <Link to="/assistant" className={`rounded-xl p-4 border transition-shadow hover:shadow-md ${aiPending ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'}`}>
            <div className={`text-2xl font-semibold ${aiPending ? 'text-purple-700 dark:text-purple-300' : 'text-gray-900 dark:text-white'}`}>{aiPending}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">AI findings</div>
          </Link>
        )}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-semibold text-gray-900 dark:text-white">{upcomingMeetings.length}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Appointments</div>
        </div>
        {canAccess('/mail', role) && (
          <Link to="/mail" className={`rounded-xl p-4 border transition-shadow hover:shadow-md ${mailPending ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'}`}>
            <div className={`text-2xl font-semibold ${mailPending ? 'text-amber-700 dark:text-amber-300' : 'text-gray-900 dark:text-white'}`}>{mailPending}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Mail to file</div>
          </Link>
        )}
      </div>

      {/* AI assistant findings banner */}
      {isExec && aiPending > 0 && (
        <Link to="/assistant" className="block bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4 mb-6 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-purple-900 dark:text-purple-200">
              🤖 <strong>The assistant flagged {aiPending} item{aiPending !== 1 ? 's' : ''}</strong> to review &amp; approve.
            </div>
            <span className="text-xs font-medium text-purple-700 dark:text-purple-300 shrink-0">Review →</span>
          </div>
          {lastRun && <div className="text-xs text-purple-500 dark:text-purple-400 mt-1">Last checked {whenStr(lastRun)}</div>}
        </Link>
      )}

      {/* Two-column: what needs attention + appointments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* What's next */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">What needs to happen</div>
            <Link to="/all-tasks" className="text-xs text-blue-600 hover:underline">All tasks →</Link>
          </div>
          {submitted.length > 0 && (
            <Link to="/all-tasks" className="flex items-center justify-between gap-2 text-sm bg-purple-50 dark:bg-purple-900/20 rounded-lg px-3 py-2 mb-2 hover:bg-purple-100 dark:hover:bg-purple-900/30">
              <span className="text-purple-800 dark:text-purple-200">{submitted.length} task{submitted.length !== 1 ? 's' : ''} awaiting your approval</span>
              <span className="text-xs text-purple-600 dark:text-purple-300 shrink-0">Review →</span>
            </Link>
          )}
          {nextUp.length === 0 ? (
            <p className="text-sm text-gray-400">✓ Nothing open right now.</p>
          ) : (
            <div className="space-y-1.5">
              {nextUp.map(t => (
                <Link key={t.id} to="/all-tasks" className="block hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2 py-1 -mx-2">
                  <div className="flex items-center gap-2">
                    <span className={`shrink-0 h-1.5 w-1.5 rounded-full ${t.status === 'in_progress' ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                    <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{t.text}</span>
                  </div>
                  <div className="text-xs text-gray-400 ml-3.5">
                    {phaseLabel(sectionMap[t.section_id]?.label) || 'No phase'}
                    {showMulti && ` · ${estateName(t.estate_id)}`}
                    {t.assigned_to && ` · 👤 ${t.assigned_to}`}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Appointments */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">📅 Appointments</div>
            <Link to="/contacts" className="text-xs text-blue-600 hover:underline">Contacts →</Link>
          </div>
          {upcomingMeetings.length === 0 ? (
            <p className="text-sm text-gray-400">No upcoming appointments.</p>
          ) : (
            <div className="space-y-1.5">
              {upcomingMeetings.slice(0, 6).map(m => (
                <Link key={m.id} to={m.contact_id ? `/contacts/${m.contact_id}` : '/contacts'} className="flex items-center justify-between gap-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2 py-1 -mx-2">
                  <span className="text-gray-800 dark:text-white truncate">
                    {m.contact_name || 'Meeting'} <span className="text-gray-400 capitalize">· {(m.meeting_type || '').replace('_', ' ')}</span>
                    {showMulti && <span className="text-gray-400"> · {estateName(m.estate_id)}</span>}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{whenStr(m.scheduled_at)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick access — the areas that used to be in the left nav */}
      {quickLinks.length > 0 && (
        <div className="mb-6">
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Go to</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {quickLinks.map(l => (
              <Link key={l.to} to={l.to} className="relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-700 transition-all">
                {l.badge > 0 && (
                  <span className="absolute top-3 right-3 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-semibold rounded-full bg-red-500 text-white">{l.badge}</span>
                )}
                <div className="text-2xl mb-1">{l.icon}</div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">{l.label}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{l.desc}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Per-estate cards */}
      <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Estates</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {familyEstates.map(estate => {
          const stats = estateStats[estate.id] || {}
          const days = daysSince(estate.deceased_dod)
          return (
            <div key={estate.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => { switchEstate(estate); navigate('/dashboard') }}>
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{estate.deceased_name}</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {estate.deceased_dod ? `Died ${estate.deceased_dod}${days != null ? ` · ${days} days ago` : ''}` : 'Date of death not set'}
                </p>
                {estate.state_of_residence && <p className="text-xs text-gray-500 dark:text-gray-400">{estate.state_of_residence}</p>}
              </div>

              <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Task Progress</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{stats.done ?? 0} / {stats.total ?? 0}</span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${stats.pct ?? 0}%` }} />
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{stats.pct ?? 0}% complete</div>
              </div>

              {stats.inProgress > 0 && (
                <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs">
                  <span className="text-blue-700 dark:text-blue-400">{stats.inProgress} task{stats.inProgress !== 1 ? 's' : ''} in progress</span>
                </div>
              )}

              <div className="space-y-1 text-xs mb-4">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Account balance:</span>
                  <span className="font-medium text-gray-900 dark:text-white">{fmt(stats.totalBalance)}</span>
                </div>
                {stats.monthlyBurn > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Monthly burn:</span>
                    <span className="font-medium text-gray-900 dark:text-white">{fmt(stats.monthlyBurn)}</span>
                  </div>
                )}
              </div>

              <button className="w-full px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors">
                Open This Estate →
              </button>
            </div>
          )
        })}
      </div>

      {/* Family money summary */}
      {(familyBalance !== 0 || familyBurn > 0) && (
        <div className="mt-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex flex-wrap items-center gap-x-8 gap-y-2">
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Family account balance</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">{fmt(familyBalance)}</div>
          </div>
          {familyBurn > 0 && (
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Combined monthly burn</div>
              <div className="text-lg font-semibold text-gray-900 dark:text-white">{fmt(familyBurn)}</div>
            </div>
          )}
          {canAccess('/family-finances', role) && (
            <Link to="/family-finances" className="text-sm text-blue-600 hover:underline ml-auto">Family finances →</Link>
          )}
        </div>
      )}
    </div>
  )
}
