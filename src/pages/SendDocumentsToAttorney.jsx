import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'

export default function SendDocumentsToAttorney() {
  const { currentEstate } = useEstate()
  const [documents, setDocuments] = useState([])
  const [selected, setSelected] = useState([])
  const [sendHistory, setSendHistory] = useState([])
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentEstate) return
    loadData()
  }, [currentEstate])

  async function loadData() {
    // Load documents
    const { data: docs } = await supabase
      .from('estate_documents')
      .select('*')
      .eq('estate_id', currentEstate.id)
      .eq('have', true)

    // Load send history
    const { data: history } = await supabase
      .from('attorney_document_sends')
      .select('*')
      .eq('estate_id', currentEstate.id)
      .order('sent_at', { ascending: false })

    setDocuments(docs ?? [])
    setSendHistory(history ?? [])
    setLoading(false)
  }

  async function recordSend() {
    if (selected.length === 0) return
    setSending(true)

    const docNames = selected.map(id => documents.find(d => d.id === id)?.name).join(', ')

    // Record the send in database
    await supabase.from('attorney_document_sends').insert({
      estate_id: currentEstate.id,
      document_ids: selected,
      document_count: selected.length,
      document_names: docNames,
      sent_at: new Date().toISOString(),
    })

    setSent(true)
    setSending(false)
    setSelected([])

    setTimeout(async () => {
      setSent(false)
      await loadData()
    }, 2000)
  }

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate selected.</div>
  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  const documentsWithSentStatus = documents.map(doc => ({
    ...doc,
    lastSent: sendHistory.find(h => h.document_ids?.includes(doc.id))?.sent_at
  }))

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white mb-2">Send Documents to Attorney</h1>
        <p className="text-gray-600 dark:text-gray-400">Select documents to send. We track what's been sent to avoid duplicates.</p>
      </div>

      {documents.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">No documents uploaded yet. Go to Documents section to upload files.</p>
        </div>
      ) : (
        <>
          {/* Documents List */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Select Documents ({selected.length} selected)</h2>
            <div className="space-y-2">
              {documentsWithSentStatus.map(doc => (
                <label key={doc.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.includes(doc.id)}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelected(prev => [...prev, doc.id])
                      } else {
                        setSelected(prev => prev.filter(id => id !== doc.id))
                      }
                    }}
                    className="w-4 h-4 rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{doc.name}</p>
                    {doc.lastSent && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Last sent: {new Date(doc.lastSent).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Send Button */}
          <button
            onClick={recordSend}
            disabled={selected.length === 0 || sending}
            className={`w-full px-4 py-3 rounded-lg font-medium mb-6 ${
              selected.length === 0 || sending
                ? 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                : 'bg-gray-900 dark:bg-gray-700 text-white hover:bg-gray-700'
            }`}
          >
            {sending ? 'Recording...' : sent ? '✓ Recorded' : `Send ${selected.length} Document${selected.length !== 1 ? 's' : ''}`}
          </button>

          {/* Send History */}
          {sendHistory.length > 0 && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Send History</h2>
              <div className="space-y-3">
                {sendHistory.map((send, idx) => (
                  <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {send.document_count} document{send.document_count !== 1 ? 's' : ''} sent
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(send.sent_at).toLocaleDateString()} {new Date(send.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{send.document_names}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="mt-8 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
        <p className="text-sm text-amber-900 dark:text-amber-300">
          📝 <strong>Note:</strong> This records what's been sent to your attorney. We track this to prevent sending duplicates and annoying them with repeated documents.
        </p>
      </div>
    </div>
  )
}
