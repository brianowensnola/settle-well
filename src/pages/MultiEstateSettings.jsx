import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'

export default function MultiEstateSettings() {
  const navigate = useNavigate()
  const { estates, currentEstate, reload } = useEstate()
  const [deleting, setDeleting] = useState(null)
  const [confirmingDelete, setConfirmingDelete] = useState(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  // Family-estate grouping
  const [familyName, setFamilyName] = useState('')
  const [memberIds, setMemberIds] = useState([])
  const [activeGroupId, setActiveGroupId] = useState(null)
  const [savingGroup, setSavingGroup] = useState(false)

  // This page is scoped to the CURRENT family only — other families never show.
  const activeGroup = currentEstate?.group_id ?? null
  const familyEstates = estates.filter(e =>
    activeGroup ? e.group_id === activeGroup : e.id === currentEstate?.id)

  useEffect(() => { loadGroups() }, [estates, currentEstate?.id])

  async function loadGroups() {
    setActiveGroupId(activeGroup)
    if (activeGroup) {
      const { data } = await supabase.from('estate_groups').select('name').eq('id', activeGroup).maybeSingle()
      setFamilyName(data?.name ?? '')
      setMemberIds(estates.filter(e => e.group_id === activeGroup).map(e => e.id))
    } else {
      setFamilyName('')
      setMemberIds([])
    }
  }

  function toggleMember(id) {
    setMemberIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function saveGroup() {
    if (!familyName.trim()) { alert('Give the family estate a name.'); return }
    if (memberIds.length < 1) { alert('Select at least one estate for the family.'); return }
    setSavingGroup(true)
    try {
      let groupId = activeGroupId
      if (groupId) {
        await supabase.from('estate_groups').update({ name: familyName.trim() }).eq('id', groupId)
      } else {
        const { data, error } = await supabase.from('estate_groups').insert({ name: familyName.trim() }).select().single()
        if (error) throw error
        groupId = data.id
      }
      // Assign checked estates; clear estates that were in this group but are now unchecked.
      const toClear = estates.filter(e => e.group_id === groupId && !memberIds.includes(e.id)).map(e => e.id)
      for (const id of memberIds) await supabase.from('estates').update({ group_id: groupId }).eq('id', id)
      for (const id of toClear) await supabase.from('estates').update({ group_id: null }).eq('id', id)
      await reload() // re-runs loadGroups via the estates effect
      alert('Family estate saved.')
    } catch (e) {
      alert(`Couldn't save the family group: ${e.message}`)
    } finally {
      setSavingGroup(false)
    }
  }

  // Recursively collect every file path under a storage prefix (Supabase list
  // is non-recursive; folders come back with id === null).
  async function listAllFiles(prefix) {
    const out = []
    const { data } = await supabase.storage.from('estate-documents').list(prefix, { limit: 1000 })
    for (const item of data ?? []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id === null) out.push(...await listAllFiles(path)) // folder → recurse
      else out.push(path)
    }
    return out
  }

  async function purgeEstateStorage(estateId) {
    // Files live under "<estateId>/..." (documents, receipts) and
    // "estate-<estateId>/..." (forensic uploads).
    const files = [...await listAllFiles(`${estateId}`), ...await listAllFiles(`estate-${estateId}`)]
    for (let i = 0; i < files.length; i += 100) {
      try { await supabase.storage.from('estate-documents').remove(files.slice(i, i + 100)) } catch { /* best-effort */ }
    }
  }

  async function handleDelete(estateId, estateName) {
    if (deleteConfirmText !== estateName) {
      alert('Please type the estate name to confirm deletion')
      return
    }

    setDeleting(estateId)
    try {
      // 1) Purge storage files (not covered by DB cascade). Best-effort.
      try { await purgeEstateStorage(estateId) } catch (e) { console.warn('storage purge:', e?.message) }

      // 2) Delete the estate. Every estate_id table cascades automatically, and
      //    an emptied family group is removed by trigger — no manual per-table
      //    deletes needed (that's what left ghost data before).
      const { error } = await supabase.from('estates').delete().eq('id', estateId)
      if (error) throw error

      setConfirmingDelete(null)
      setDeleteConfirmText('')
      await reload()
      alert('Estate deleted. All of its data and files were removed.')
    } catch (err) {
      console.error('Error deleting estate:', err)
      alert(`Error: ${err.message}`)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white">Estate Management</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          {familyName ? `${familyName} · ` : ''}{familyEstates.length} estate{familyEstates.length !== 1 ? 's' : ''} in this family
        </p>
      </div>

      {/* Family estate grouping */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Family estate</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Group related estates (e.g. a married couple) into one family estate so their finances can roll up together. Each estate is still worked individually; unrelated estates left unchecked stay separate.
        </p>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Family estate name</label>
        <input
          value={familyName}
          onChange={e => setFamilyName(e.target.value)}
          placeholder="e.g. Bryant Family Estate"
          className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none mb-3"
        />
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Estates in this family</label>
        <div className="space-y-1.5 mb-4">
          {familyEstates.map(e => (
            <label key={e.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={memberIds.includes(e.id)} onChange={() => toggleMember(e.id)} />
              {e.deceased_name}
            </label>
          ))}
          <p className="text-xs text-gray-400">Use "+ Add family member" to bring another decedent into this family.</p>
        </div>
        <button onClick={saveGroup} disabled={savingGroup}
          className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm disabled:opacity-50">
          {savingGroup ? 'Saving…' : activeGroupId ? 'Update family estate' : 'Create family estate'}
        </button>
      </div>

      <div className="space-y-4">
        {familyEstates.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 text-center text-gray-500 dark:text-gray-400">
            No estates found
          </div>
        ) : (
          familyEstates.map(estate => (
            <div
              key={estate.id}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{estate.deceased_name}</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {estate.deceased_dod} • {estate.state_of_residence}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">ID: {estate.id}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  estate.status === 'active'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400'
                }`}>
                  {estate.status}
                </span>
              </div>

              {/* Delete section */}
              {confirmingDelete === estate.id ? (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mt-4">
                  <p className="text-sm font-medium text-red-900 dark:text-red-300 mb-3">
                    ⚠️ This action cannot be undone. Type the estate name to confirm:
                  </p>
                  <div className="mb-3 p-3 bg-white dark:bg-red-900/20 rounded border border-red-200 dark:border-red-700">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{estate.deceased_name}</p>
                  </div>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={e => setDeleteConfirmText(e.target.value)}
                    placeholder={`Type "${estate.deceased_name}" to confirm`}
                    autoFocus
                    className="w-full border border-red-300 dark:border-red-700 bg-white dark:bg-red-900/30 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDelete(estate.id, estate.deceased_name)}
                      disabled={deleting === estate.id || deleteConfirmText !== estate.deceased_name}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                    >
                      {deleting === estate.id ? 'Deleting...' : 'Delete Estate'}
                    </button>
                    <button
                      onClick={() => {
                        setConfirmingDelete(null)
                        setDeleteConfirmText('')
                      }}
                      className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingDelete(estate.id)}
                  className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 font-medium"
                >
                  Delete this estate...
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-900 dark:text-blue-300">
          💡 <strong>Tip:</strong> Deleting an estate will permanently remove all associated data (tasks, documents, financials). This cannot be undone.
        </p>
      </div>

      <button
        onClick={() => navigate('/all-estates')}
        className="mt-6 w-full px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200"
      >
        Back to Estates
      </button>
    </div>
  )
}
