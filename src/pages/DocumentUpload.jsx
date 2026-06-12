import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { DOC_TYPES } from '../lib/constants'

export default function DocumentUpload() {
  const { currentEstate } = useEstate()
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({})
  const [completed, setCompleted] = useState([])
  const [error, setError] = useState('')

  if (!currentEstate) {
    return <div className="p-8 text-gray-400">No estate selected.</div>
  }

  async function handleFileSelect(e) {
    const newFiles = Array.from(e.target.files)
    setFiles(prev => [...prev, ...newFiles])
    e.target.value = '' // Reset input
  }

  async function uploadFiles() {
    if (files.length === 0) {
      setError('Please select files to upload')
      return
    }

    setError('')
    setUploading(true)
    const uploadedDocs = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const fileNameWithoutExt = file.name.split('.').slice(0, -1).join('.')
      const ext = file.name.split('.').pop()

      try {
        setUploadProgress(prev => ({ ...prev, [i]: 'Uploading...' }))

        // Upload to Supabase Storage
        const storagePath = `${currentEstate.id}/${file.name}`
        const { error: uploadError } = await supabase.storage
          .from('estate-documents')
          .upload(storagePath, file, { upsert: false })

        if (uploadError) {
          setUploadProgress(prev => ({ ...prev, [i]: `Error: ${uploadError.message}` }))
          continue
        }

        // Create document record
        const { data: doc, error: docError } = await supabase
          .from('estate_documents')
          .insert({
            estate_id: currentEstate.id,
            name: fileNameWithoutExt,
            doc_type: 'other',
            file_path: storagePath,
            have: true,
          })
          .select()
          .single()

        if (docError) {
          setUploadProgress(prev => ({ ...prev, [i]: `Error: ${docError.message}` }))
          continue
        }

        setUploadProgress(prev => ({ ...prev, [i]: '✓ Done' }))
        uploadedDocs.push(doc)
      } catch (err) {
        setUploadProgress(prev => ({ ...prev, [i]: `Error: ${err.message}` }))
      }
    }

    setCompleted(prev => [...prev, ...uploadedDocs])
    setFiles([])
    setUploading(false)
  }

  function removeFile(index) {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white">Bulk Document Upload</h1>
        <p className="text-xs md:text-sm text-gray-500 mt-1">Upload all your PDFs, photos, and documents at once</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Upload Area */}
      <div className="bg-white dark:bg-gray-900 border-2 border-dashed border-gray-300 rounded-xl p-8 text-center mb-6 hover:border-gray-400 transition-colors">
        <label className="cursor-pointer">
          <div className="flex flex-col items-center">
            <div className="text-4xl mb-2">📁</div>
            <p className="text-gray-900 dark:text-white font-medium">Drop files here or click to browse</p>
            <p className="text-xs text-gray-500 mt-1">PDF, JPG, PNG, HEIC, DOCX • Max 50MB per file</p>
          </div>
          <input
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.heic,.docx"
            onChange={handleFileSelect}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      {/* Files to Upload */}
      {files.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Ready to upload ({files.length})</h2>
            {!uploading && (
              <button
                onClick={() => setFiles([])}
                className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-300 underline"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {files.map((file, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded text-sm">
                <span className="text-gray-700 dark:text-gray-300 truncate">{file.name}</span>
                {!uploading && (
                  <button
                    onClick={() => removeFile(i)}
                    className="text-xs text-red-600 hover:text-red-700 ml-2"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Uploaded ({completed.length})</h2>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {completed.map(doc => (
              <div key={doc.id} className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded text-sm">
                <span className="text-green-600">✓</span>
                <span className="text-gray-700 dark:text-gray-300 truncate">{doc.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Button */}
      <div className="flex gap-2">
        <button
          onClick={uploadFiles}
          disabled={files.length === 0 || uploading}
          className="px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors"
        >
          {uploading ? 'Uploading...' : `Upload ${files.length} file${files.length !== 1 ? 's' : ''}`}
        </button>
        {(files.length > 0 || completed.length > 0) && (
          <button
            onClick={() => {
              setFiles([])
              setCompleted([])
              setUploadProgress({})
            }}
            className="px-4 py-2.5 text-gray-600 dark:text-gray-400 rounded-lg text-sm hover:bg-gray-100 dark:bg-gray-800"
          >
            Reset
          </button>
        )}
      </div>

      {/* Progress */}
      {Object.keys(uploadProgress).length > 0 && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          <p className="font-medium mb-2">Upload progress:</p>
          <div className="space-y-1 text-xs">
            {Object.entries(uploadProgress).map(([idx, status]) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-32 truncate">{files[idx]?.name}</span>
                <span>{status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
