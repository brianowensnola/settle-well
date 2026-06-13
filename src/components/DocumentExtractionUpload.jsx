import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { initiateExtraction, pollExtractionStatus, mergeAllExtractions, getExtractionErrors } from '../lib/claudeExtraction'
import { extractionStatusToLabel, formatConfidenceScore, getExtractionStats } from '../lib/extractionUtils'

// Downscale large photos before upload. Claude rejects images over 5MB and
// downscales to ~1568px anyway, so uploading full-size phone photos only
// slows extraction down.
async function compressImage(file) {
  if (!/^image\/(jpeg|png)$/.test(file.type)) return file
  if (file.size < 1024 * 1024) return file
  try {
    const bitmap = await createImageBitmap(file)
    const maxDim = 1568
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.png$/i, '.jpg'), { type: 'image/jpeg' })
  } catch {
    return file
  }
}

export default function DocumentExtractionUpload({ estateId, onExtractionComplete, onSkip, canSkip = true }) {
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractionProgress, setExtractionProgress] = useState('')
  const [extractionData, setExtractionData] = useState(null)
  const [error, setError] = useState('')

  async function handleFileSelect(e) {
    const selectedFiles = Array.from(e.target.files || [])
    setFiles(prev => [...prev, ...selectedFiles])
    setError('')
  }

  function removeFile(index) {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  async function uploadAndExtract() {
    if (files.length === 0) {
      setError('Please select at least one file')
      return
    }

    setUploading(true)
    setError('')

    try {
      const uploadedPaths = []

      // Upload each file to storage
      for (const rawFile of files) {
        const file = await compressImage(rawFile)
        // Sanitize filename for storage (remove special chars)
        const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const fileName = `${Date.now()}-${sanitized}`
        const filePath = `estate-${estateId}/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('estate-documents')
          .upload(filePath, file)

        if (uploadError) throw uploadError
        uploadedPaths.push(filePath)
      }

      setUploading(false)
      setExtracting(true)
      setExtractionProgress('Analyzing documents...')

      // Call extraction function
      const extractionResult = await initiateExtraction(estateId, uploadedPaths)

      // Poll for completion
      setExtractionProgress('Processing... this may take a minute')
      const pollResult = await pollExtractionStatus(estateId, uploadedPaths)

      setExtractionProgress('')

      if (pollResult.status === 'completed' || pollResult.status === 'partial') {
        const merged = mergeAllExtractions(pollResult.records)
        const errors = getExtractionErrors(pollResult.records)
        const stats = getExtractionStats(merged.confidence)

        setExtractionData({
          answers: merged.answers,
          confidence: merged.confidence,
          sources: merged.sources,
          stats,
          errors: errors.length > 0 ? errors : null,
          files: pollResult.records,
        })

        // Automatically proceed if successful
        if (pollResult.status === 'completed' && errors.length === 0) {
          setTimeout(() => {
            onExtractionComplete?.(merged.answers)
          }, 1500)
        }
      }
    } catch (err) {
      console.error('Error during extraction:', err)
      setError(err.message || 'Failed to extract documents')
    } finally {
      setUploading(false)
      setExtracting(false)
    }
  }

  // Extraction complete state
  if (extractionData) {
    const { stats, errors } = extractionData
    const confidence = formatConfidenceScore(stats.averageConfidence)

    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Extraction Complete</h3>

        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.total}</p>
              <p className="text-xs text-blue-600 dark:text-blue-400">Fields extracted</p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.highConfidence}</p>
              <p className="text-xs text-green-600 dark:text-green-400">High confidence</p>
            </div>
            <div className={`rounded-lg p-3 ${confidence.color === 'green' ? 'bg-green-50 dark:bg-green-900/20' : confidence.color === 'yellow' ? 'bg-yellow-50 dark:bg-yellow-900/20' : 'bg-orange-50 dark:bg-orange-900/20'}`}>
              <p className={`text-2xl font-bold ${confidence.color === 'green' ? 'text-green-600 dark:text-green-400' : confidence.color === 'yellow' ? 'text-yellow-600 dark:text-yellow-400' : 'text-orange-600 dark:text-orange-400'}`}>
                {confidence.score}%
              </p>
              <p className={`text-xs ${confidence.color === 'green' ? 'text-green-600 dark:text-green-400' : confidence.color === 'yellow' ? 'text-yellow-600 dark:text-yellow-400' : 'text-orange-600 dark:text-orange-400'}`}>
                Avg confidence
              </p>
            </div>
          </div>

          {/* Errors if any */}
          {errors && errors.length > 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
              <p className="text-sm font-medium text-yellow-900 dark:text-yellow-300 mb-2">Issues with some files:</p>
              <ul className="text-xs text-yellow-800 dark:text-yellow-400 space-y-1">
                {errors.map((err, i) => (
                  <li key={i}>• {err.fileName}: {err.error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Action buttons */}
          <div className={`flex gap-3 pt-4 ${canSkip ? '' : 'flex-col'}`}>
            <button
              onClick={() => onExtractionComplete?.(extractionData.answers)}
              className={`${canSkip ? 'flex-1' : 'w-full'} bg-green-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-green-700`}
            >
              Continue to Intake Review
            </button>
            {canSkip && (
              <button
                onClick={onSkip}
                className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-200"
              >
                Skip
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Upload state
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Upload Estate Documents</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Upload documents like wills, trusts, insurance policies, or any paperwork. AI will extract key information to pre-fill your intake form.
      </p>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="mb-4 space-y-2">
          {files.map((file, idx) => (
            <div key={idx} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-gray-400">📄</span>
                <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{file.name}</span>
                <span className="text-xs text-gray-500 ml-auto whitespace-nowrap">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
              <button
                onClick={() => removeFile(idx)}
                disabled={uploading}
                className="ml-2 text-red-600 dark:text-red-400 hover:text-red-700 text-sm disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload input */}
      <label className="block">
        <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 text-center hover:border-gray-400 dark:hover:border-gray-600 cursor-pointer transition-colors">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {files.length > 0 ? '+ Add more files' : 'Click or drag files here'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">PDF, images, or documents (up to 50MB)</p>
        </div>
        <input
          type="file"
          multiple
          onChange={handleFileSelect}
          disabled={uploading || extracting}
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.txt"
        />
      </label>

      {/* Progress */}
      {extracting && (
        <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-blue-900 dark:text-blue-300">{extractionProgress}</p>
            <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-6 flex gap-3">
        <button
          onClick={uploadAndExtract}
          disabled={files.length === 0 || uploading || extracting}
          className="flex-1 bg-gray-900 dark:bg-gray-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? 'Uploading...' : extracting ? 'Analyzing...' : `Extract from ${files.length} file${files.length !== 1 ? 's' : ''}`}
        </button>
        <button
          onClick={onSkip}
          disabled={uploading || extracting}
          className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
        >
          Skip for now
        </button>
      </div>

      <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
        <p className="text-xs text-amber-900 dark:text-amber-300">
          💡 <strong>Tip:</strong> Upload documents like the will, trust agreement, or insurance policies. The AI will extract key information to speed up your intake form.
        </p>
      </div>
    </div>
  )
}
