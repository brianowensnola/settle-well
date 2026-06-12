import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'

export default function MultiEstateSettings() {
  const navigate = useNavigate()
  const { estates, reload } = useEstate()
  const [deleting, setDeleting] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  async function deleteEstate(estateId, estateName) {
    if (deleteConfirm !== estateName) {
      alert('Please type the estate name to confirm deletion')
      return
    }

    setDeleting(estateId)
    try {
      // Delete in order (cascade-safe approach)
      await Promise.all([
        supabase.from('estate_document_extractions').delete().eq('estate_id', estateId),
        supabase.from('estate_tasks').delete().eq('estate_id', estateId),
        supabase.from('estate_financials').delete().eq('estate_id', estateId),
        supabase.from('estate_sections').delete().eq('estate_id', estateId),
        supabase.from('estate_users').delete().eq('estate_id', estateId),
      ])

      // Finally delete the estate
      const { error } = await supabase
        .from('estates')
        .delete()
        .eq('id', estateId)

      if (error) throw error

      setDeleteConfirm(null)
      await reload()
      alert('Estate deleted successfully')
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
        <p className="text-gray-600 dark:text-gray-400 mt-1">Manage {estates.length} estate{estates.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="space-y-4">
        {estates.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 text-center text-gray-500 dark:text-gray-400">
            No estates found
          </div>
        ) : (
          estates.map(estate => (
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
              {deleteConfirm === estate.id ? (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mt-4">
                  <p className="text-sm font-medium text-red-900 dark:text-red-300 mb-3">
                    ⚠️ This action cannot be undone. Type the estate name to confirm:
                  </p>
                  <input
                    type="text"
                    value={deleteConfirm === estate.id ? deleteConfirm : ''}
                    onChange={e => setDeleteConfirm(e.target.value)}
                    placeholder={estate.deceased_name}
                    className="w-full border border-red-300 dark:border-red-700 bg-white dark:bg-red-900/30 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => deleteEstate(estate.id, estate.deceased_name)}
                      disabled={deleting === estate.id || deleteConfirm !== estate.deceased_name}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                    >
                      {deleting === estate.id ? 'Deleting...' : 'Delete Estate'}
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteConfirm(estate.id)}
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
