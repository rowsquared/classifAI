"use client"
import { useState, useEffect } from 'react'
import PageHeader from '@/components/PageHeader'

type SentenceImport = {
  id: string
  fileName: string
  uploadedAt: string
  totalRows: number
  sentenceCount: number
}

export default function SentenceAdminPage() {
  const [sentenceFile, setSentenceFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  
  // Import history state
  const [imports, setImports] = useState<SentenceImport[]>([])
  const [loadingImports, setLoadingImports] = useState(true)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [selectedImport, setSelectedImport] = useState<SentenceImport | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    loadImports()
  }, [])

  async function loadImports() {
    try {
      setLoadingImports(true)
      const res = await fetch('/api/imports')
      const data = await res.json()
      if (data.ok) {
        setImports(data.imports)
      }
    } catch (error) {
      console.error('Failed to load imports:', error)
    } finally {
      setLoadingImports(false)
    }
  }

  async function handleDeleteImport() {
    if (!selectedImport || confirmText !== 'DELETE') return

    try {
      setDeleting(true)
      const res = await fetch(`/api/imports/${selectedImport.id}`, {
        method: 'DELETE'
      })
      
      const data = await res.json()
      
      if (data.ok) {
        setMessage({ 
          type: 'success', 
          text: `Successfully deleted import "${selectedImport.fileName}" and ${data.deletedSentences} sentences`
        })
        setDeleteModalOpen(false)
        setConfirmText('')
        setSelectedImport(null)
        loadImports()
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to delete import' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error' })
    } finally {
      setDeleting(false)
    }
  }

  const handleSentenceUpload = async () => {
    if (!sentenceFile) return
    
    setUploading(true)
    setMessage(null)

    try {
      const formData = new FormData()
      formData.append('file', sentenceFile)
      
      // Dry run first
      const dryRunRes = await fetch('/api/sentences/import?dryRun=true', {
        method: 'POST',
        body: formData
      })

      const dryRunData = await dryRunRes.json()
      
      if (!dryRunRes.ok) {
        setMessage({ 
          type: 'error', 
          text: dryRunData.error || dryRunData.errors?.join(', ') || 'Validation failed' 
        })
        setUploading(false)
        return
      }

      // Commit import
      const formData2 = new FormData()
      formData2.append('file', sentenceFile)
      
      const res = await fetch('/api/sentences/import?dryRun=false', {
        method: 'POST',
        body: formData2
      })

      const data = await res.json()
      
      if (res.ok) {
        setMessage({ 
          type: 'success', 
          text: `Successfully imported ${data.count || 0} sentences!` 
        })
        setSentenceFile(null)
        loadImports()
      } else {
        setMessage({ 
          type: 'error', 
          text: data.error || data.errors?.join(', ') || 'Import failed' 
        })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <PageHeader title="Sentences" />
      <div className="px-8 py-8">
        <div className="mb-8">
          <p className="text-sm text-gray-600">
            Import sentences for labeling and manage import history
          </p>
        </div>

        {/* Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' 
              ? 'bg-green-50 text-green-800 border border-green-200' 
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* Sentence Import */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">📊</span>
            <h2 className="text-lg font-semibold text-gray-900">Import Sentences</h2>
          </div>
          
          <div className="max-w-xl space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                CSV File
              </label>
              <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setSentenceFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    id="sentence-file-input"
                  />
                  <div className="flex items-center gap-3 px-4 py-2.5 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors">
                    <span className="text-sm text-gray-500 truncate flex-1">
                      {sentenceFile ? sentenceFile.name : 'No file chosen'}
                    </span>
                  </div>
                </div>
                <label
                  htmlFor="sentence-file-input"
                  className="px-6 py-2.5 bg-indigo-50 text-indigo-700 font-medium rounded-lg hover:bg-indigo-100 transition-colors cursor-pointer whitespace-nowrap border border-indigo-200"
                >
                  Choose file...
                </label>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Required: field_* columns (max 5), Optional: id, support_* columns (max 5)
              </p>
            </div>

            <button
              onClick={handleSentenceUpload}
              disabled={!sentenceFile || uploading}
              className="px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {uploading ? 'Uploading...' : 'Upload Sentences'}
            </button>
          </div>
        </div>

        {/* Import History */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">📦</span>
            <h2 className="text-lg font-semibold text-gray-900">Import History</h2>
          </div>
          
          {loadingImports ? (
            <p className="text-sm text-gray-500">Loading imports...</p>
          ) : imports.length === 0 ? (
            <p className="text-sm text-gray-500">No imports yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200">
                  <tr className="text-left">
                    <th className="pb-2 font-medium text-gray-700">Filename</th>
                    <th className="pb-2 font-medium text-gray-700">Uploaded</th>
                    <th className="pb-2 text-right font-medium text-gray-700">Rows</th>
                    <th className="pb-2 text-right font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map(imp => (
                    <tr key={imp.id} className="border-b border-gray-100">
                      <td className="py-3 text-gray-900">{imp.fileName}</td>
                      <td className="py-3 text-gray-600">
                        {new Date(imp.uploadedAt).toLocaleString()}
                      </td>
                      <td className="py-3 text-right text-gray-900">
                        {imp.sentenceCount?.toLocaleString() || imp.totalRows?.toLocaleString()}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => {
                            setSelectedImport(imp)
                            setDeleteModalOpen(true)
                          }}
                          className="text-red-600 hover:text-red-800 font-medium transition-colors"
                        >
                          🗑️ Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && selectedImport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-red-600 mb-4">
              ⚠️ Danger Zone
            </h3>
            <p className="text-gray-700 mb-2">
              You are about to delete import:
            </p>
            <p className="font-medium mb-4 text-gray-900">"{selectedImport.fileName}"</p>
            <p className="text-gray-700 mb-4">
              This will permanently remove <strong>{selectedImport.sentenceCount || selectedImport.totalRows}</strong> sentences 
              and <strong>cannot be undone</strong>.
            </p>
            
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Type <code className="bg-gray-100 px-2 py-1 rounded text-red-600 font-mono">DELETE</code> to confirm:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md mb-4 focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-900"
              placeholder="DELETE"
              autoFocus
            />
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setDeleteModalOpen(false)
                  setConfirmText('')
                  setSelectedImport(null)
                }}
                disabled={deleting}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors text-gray-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteImport}
                disabled={confirmText !== 'DELETE' || deleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deleting ? 'Deleting...' : 'Delete Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

