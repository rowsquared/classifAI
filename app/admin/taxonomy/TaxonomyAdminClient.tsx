"use client"
import { useState } from 'react'
import PageHeader from '@/components/PageHeader'
import { formatRelativeTime, formatDate } from '@/lib/utils'

export type Taxonomy = {
  id: string
  key: string
  description: string | null
  levelNames: Record<string, string> | null
  maxDepth: number
  isActive: boolean
  createdAt: string
  updatedAt: string
  nodeCount: number
  annotationCount: number
  actualMaxLevel: number
  levelCounts: Array<{
    level: number
    count: number
    name: string
  }>
  lastAISyncAt?: string | null
  lastAISyncStatus?: string | null
  lastAISyncError?: string | null
  lastAISyncJobId?: string | null
  lastLearningAt?: string | null
  lastLearningJobId?: string | null
  lastLearningStatus?: string | null
  lastLearningError?: string | null
  newAnnotationsSinceLastLearning: number
}

type Props = {
  initialTaxonomies: Taxonomy[]
  initialLearningThreshold: number
}

const MAX_ACTIVE_TAXONOMIES = 3

export default function TaxonomyAdminClient({ initialTaxonomies, initialLearningThreshold }: Props) {
  const [taxonomies, setTaxonomies] = useState<Taxonomy[]>(initialTaxonomies)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [learningThreshold, setLearningThreshold] = useState(initialLearningThreshold)
  
  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [selectedTaxonomy, setSelectedTaxonomy] = useState<Taxonomy | null>(null)
  const [modalMessage, setModalMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Form states
  const [formData, setFormData] = useState({
    key: '',
    description: '',
    maxDepth: 5,
    levelNames: {} as Record<string, string>,
    file: null as File | null
  })
  const [confirmText, setConfirmText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [syncingKeys, setSyncingKeys] = useState<Set<string>>(new Set())
  const [learningKeys, setLearningKeys] = useState<Set<string>>(new Set())

  async function loadTaxonomies() {
    try {
      setLoading(true)
      const res = await fetch('/api/taxonomies?includeDeleted=true')
      const data = await res.json()
      if (data.ok) {
        if (typeof data.learningThreshold === 'number') {
          setLearningThreshold(data.learningThreshold)
        }
        setTaxonomies(data.taxonomies)
      }
    } catch (error) {
      console.error('Failed to load taxonomies:', error)
      setMessage({ type: 'error', text: 'Failed to load taxonomies' })
    } finally {
      setLoading(false)
    }
  }

  const activeTaxonomies = taxonomies.filter(t => t.isActive)
  const deletedTaxonomies = taxonomies.filter(t => !t.isActive)
  const canAddNew = activeTaxonomies.length < MAX_ACTIVE_TAXONOMIES

  function openCreateModal() {
    setFormData({
      key: '',
      description: '',
      maxDepth: 5,
      levelNames: {},
      file: null
    })
    setModalMessage(null)
    setCreateModalOpen(true)
  }

  function openEditModal(taxonomy: Taxonomy) {
    setSelectedTaxonomy(taxonomy)
    setFormData({
      key: taxonomy.key,
      description: taxonomy.description || '',
      maxDepth: taxonomy.maxDepth,
      levelNames: taxonomy.levelNames || {},
      file: null
    })
    setEditModalOpen(true)
  }

  function openDeleteModal(taxonomy: Taxonomy) {
    setSelectedTaxonomy(taxonomy)
    setConfirmText('')
    setDeleteModalOpen(true)
  }

  async function handleCreate() {
    if (!formData.key || !formData.file) {
      setModalMessage({ type: 'error', text: 'Please fill all required fields and upload a file' })
      return
    }

    setSubmitting(true)
    setModalMessage(null)

    try {
      const formDataToSend = new FormData()
      formDataToSend.append('key', formData.key)
      if (formData.description) formDataToSend.append('description', formData.description)
      formDataToSend.append('maxDepth', formData.maxDepth.toString())
      if (Object.keys(formData.levelNames).length > 0) {
        formDataToSend.append('levelNames', JSON.stringify(formData.levelNames))
      }
      formDataToSend.append('file', formData.file)

      const res = await fetch('/api/taxonomies', {
        method: 'POST',
        body: formDataToSend
      })

      const data = await res.json()

      if (res.ok) {
        setMessage({ type: 'success', text: `Successfully created taxonomy "${formData.key}" with ${data.importedNodes} nodes!` })
        setCreateModalOpen(false)
        setModalMessage(null)
        loadTaxonomies()
      } else {
        // Show error in modal so user doesn't lose form data
        setModalMessage({ type: 'error', text: data.error || 'Failed to create taxonomy' })
      }
    } catch (error) {
      setModalMessage({ type: 'error', text: 'Network error' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleEdit() {
    if (!selectedTaxonomy) return

    setSubmitting(true)
    setMessage(null)

    try {
      const formDataToSend = new FormData()
      formDataToSend.append('description', formData.description)
      formDataToSend.append('levelNames', JSON.stringify(formData.levelNames))
      if (formData.file) {
        formDataToSend.append('file', formData.file)
      }

      const res = await fetch(`/api/taxonomies/${selectedTaxonomy.key}`, {
        method: 'PUT',
        body: formDataToSend
      })

      const data = await res.json()

      if (res.ok) {
        const nodesMsg = data.nodesReplaced > 0 ? ` and replaced ${data.nodesReplaced} nodes` : ''
        setMessage({ type: 'success', text: `Successfully updated taxonomy "${selectedTaxonomy.key}"${nodesMsg}!` })
        setEditModalOpen(false)
        loadTaxonomies()
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update taxonomy' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!selectedTaxonomy || confirmText !== 'DELETE') return

    setSubmitting(true)
    setMessage(null)

    try {
      const res = await fetch(`/api/taxonomies/${selectedTaxonomy.key}`, {
        method: 'DELETE'
      })

      const data = await res.json()

      if (res.ok) {
        setMessage({ type: 'success', text: `Successfully deleted taxonomy "${selectedTaxonomy.key}". ${data.preservedNodes} nodes and ${data.preservedAnnotations} annotations preserved.` })
        setDeleteModalOpen(false)
        setSelectedTaxonomy(null)
        loadTaxonomies()
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to delete taxonomy' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error' })
    } finally {
      setSubmitting(false)
    }
  }

  function updateLevelName(level: number, name: string) {
    setFormData(prev => ({
      ...prev,
      levelNames: {
        ...prev.levelNames,
        [level.toString()]: name
      }
    }))
  }

  function isSyncing(key: string) {
    return syncingKeys.has(key)
  }

  function isLearning(key: string) {
    return learningKeys.has(key)
  }

  async function handleSyncAI(taxonomy: Taxonomy) {
    try {
      setSyncingKeys(prev => new Set(prev).add(taxonomy.key))
      setMessage(null)
      const res = await fetch(`/api/taxonomies/${taxonomy.key}/sync-ai`, {
        method: 'POST'
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: `AI sync started for "${taxonomy.key}" (job ${data.jobId})` })
        loadTaxonomies()
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to start AI sync' })
      }
    } catch (error) {
      console.error('AI sync error:', error)
      setMessage({ type: 'error', text: 'Network error while starting AI sync' })
    } finally {
      setSyncingKeys(prev => {
        const next = new Set(prev)
        next.delete(taxonomy.key)
        return next
      })
    }
  }

  async function handleLearning(taxonomy: Taxonomy) {
    try {
      setLearningKeys(prev => new Set(prev).add(taxonomy.key))
      setMessage(null)
      const res = await fetch('/api/ai-labeling/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taxonomyKey: taxonomy.key })
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: `Learning job started for "${taxonomy.key}" (job ${data.jobId})` })
        loadTaxonomies()
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to start learning job' })
      }
    } catch (error) {
      console.error('Learning job error:', error)
      setMessage({ type: 'error', text: 'Network error while starting learning job' })
    } finally {
      setLearningKeys(prev => {
        const next = new Set(prev)
        next.delete(taxonomy.key)
        return next
      })
    }
  }

  function renderStatusBadge(status?: string | null) {
    if (!status) return null
    const normalized = status.toLowerCase()
    const styles =
      normalized === 'success' || normalized === 'completed' || normalized === 'deleted'
        ? 'bg-green-100 text-green-800'
        : normalized === 'pending' || normalized === 'deleting'
        ? 'bg-yellow-100 text-yellow-800'
        : normalized === 'failed' || normalized === 'delete_failed'
        ? 'bg-red-100 text-red-800'
        : 'bg-gray-100 text-gray-800'
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles}`}>
        {status.replaceAll('_', ' ')}
      </span>
    )
  }

  async function handleRestore(taxonomy: Taxonomy) {
    if (activeTaxonomies.length >= MAX_ACTIVE_TAXONOMIES) {
      setMessage({ type: 'error', text: `Maximum ${MAX_ACTIVE_TAXONOMIES} active taxonomies allowed. Please delete one before restoring.` })
      return
    }

    setSubmitting(true)
    setMessage(null)

    try {
      const res = await fetch(`/api/taxonomies/${taxonomy.key}/restore`, {
        method: 'POST'
      })

      const data = await res.json()

      if (res.ok) {
        setMessage({ type: 'success', text: `Successfully restored taxonomy "${taxonomy.key}"!` })
        loadTaxonomies()
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to restore taxonomy' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageHeader title="Taxonomies" />
      
      <div className="px-8 py-8">
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm text-gray-600">
                Import and manage hierarchical taxonomies for labeling (max {MAX_ACTIVE_TAXONOMIES} active)
              </p>
              {!canAddNew && (
                <p className="text-sm text-orange-600 mt-2">
                  ⚠️ Maximum active taxonomies reached. Delete one to add a new taxonomy.
                </p>
              )}
            </div>
            <button
              onClick={openCreateModal}
              disabled={!canAddNew || loading}
              className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add New Taxonomy
            </button>
          </div>
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

        {loading ? (
          <p className="text-gray-500">Loading taxonomies...</p>
        ) : (
          <>
            {/* Active Taxonomies */}
            <div className="space-y-6 mb-12">
              {activeTaxonomies.length === 0 ? (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
                  <p className="text-gray-600">No active taxonomies. Click "Add New Taxonomy" to create one.</p>
                </div>
              ) : (
                activeTaxonomies.map(taxonomy => (
                  <div key={taxonomy.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-2xl">📚</span>
                          <h2 className="text-xl font-semibold text-gray-900">{taxonomy.key}</h2>
                        </div>
                        <p className="text-gray-700 font-medium">{taxonomy.key}</p>
                        {taxonomy.description && (
                          <p className="text-sm text-gray-600 mt-2">{taxonomy.description}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEditModal(taxonomy)}
                          className="px-4 py-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => openDeleteModal(taxonomy)}
                          className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-gray-200 pt-4 space-y-6">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">📊 Statistics</h3>
                      <div className="space-y-2">
                        <p className="text-sm text-gray-600">
                          <strong>{(taxonomy.nodeCount ?? 0).toLocaleString()}</strong> nodes across <strong>{taxonomy.actualMaxLevel ?? 0}</strong> levels
                        </p>
                        {taxonomy.levelCounts.map(lc => (
                          <p key={lc.level} className="text-sm text-gray-600 pl-4">
                            • Level {lc.level}: <strong>{lc.name}</strong> ({lc.count.toLocaleString()} nodes)
                          </p>
                        ))}
                        <p className="text-xs text-gray-500 mt-2">
                          Created: {formatDate(taxonomy.createdAt)}
                        </p>
                      </div>
                      <div className="grid gap-4 mt-4 md:grid-cols-2">
                        <div className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="text-sm font-semibold text-gray-700">AI Sync</p>
                              <p className="text-xs text-gray-500">Sync taxonomy structure to AI</p>
                            </div>
                            {renderStatusBadge(taxonomy.lastAISyncStatus)}
                          </div>
                          <p className="text-xs text-gray-500">
                            Last sync:{' '}
                            {taxonomy.lastAISyncAt
                              ? formatRelativeTime(taxonomy.lastAISyncAt)
                              : 'Never'}
                          </p>
                          {taxonomy.lastAISyncError && (
                            <p className="text-xs text-red-600 mt-1">{taxonomy.lastAISyncError}</p>
                          )}
                          <button
                            onClick={() => handleSyncAI(taxonomy)}
                            disabled={isSyncing(taxonomy.key)}
                            className="mt-3 w-full px-3 py-2 text-sm font-medium rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isSyncing(taxonomy.key) ? 'Syncing…' : 'Sync with AI'}
                          </button>
                        </div>

                        <div className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="text-sm font-semibold text-gray-700">AI Learning</p>
                              <p className="text-xs text-gray-500">Send accepted labels for training</p>
                            </div>
                            {renderStatusBadge(taxonomy.lastLearningStatus)}
                          </div>
                          <p className="text-xs text-gray-500">
                            Last learning:{' '}
                            {taxonomy.lastLearningAt
                              ? formatRelativeTime(taxonomy.lastLearningAt)
                              : 'Never'}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            New annotations:{' '}
                            <strong>{(taxonomy.newAnnotationsSinceLastLearning ?? 0).toLocaleString()}</strong> /{' '}
                            {learningThreshold.toLocaleString()}
                          </p>
                          {taxonomy.lastLearningError && (
                            <p className="text-xs text-red-600 mt-1">{taxonomy.lastLearningError}</p>
                          )}
                          <button
                            onClick={() => handleLearning(taxonomy)}
                            disabled={
                              isLearning(taxonomy.key) ||
                              taxonomy.newAnnotationsSinceLastLearning < learningThreshold
                            }
                            className="mt-3 w-full px-3 py-2 text-sm font-medium rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isLearning(taxonomy.key)
                              ? 'Sending…'
                              : 'Send for Learning'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Deleted Taxonomies */}
            {deletedTaxonomies.length > 0 && (
              <>
                <div className="border-t border-gray-300 my-8 relative">
                  <span className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-4 text-sm text-gray-500">
                    Deleted Taxonomies
                  </span>
                </div>

                <div className="space-y-4">
                  {deletedTaxonomies.map(taxonomy => (
                    <div key={taxonomy.id} className="bg-gray-50 rounded-lg border border-gray-300 p-4 opacity-75">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-lg">📚</span>
                            <h3 className="font-semibold text-gray-700">{taxonomy.key}</h3>
                            <span className="text-xs text-gray-500">(deleted)</span>
                          </div>
                          <p className="text-sm text-gray-600">{taxonomy.key}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {taxonomy.nodeCount} nodes • Deleted: {formatDate(taxonomy.updatedAt)}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRestore(taxonomy)}
                          disabled={!canAddNew || submitting}
                          className="px-4 py-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Restore
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Create Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Create New Taxonomy</h2>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Key (short name) *
                </label>
                <input
                  type="text"
                  value={formData.key}
                  onChange={e => setFormData({...formData, key: e.target.value.toUpperCase()})}
                  placeholder="e.g. ISCO"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900"
                />
                <p className="text-xs text-gray-500 mt-1">ℹ️ Unique identifier, cannot be changed later</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (optional)
                </label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  placeholder="Used for job classification worldwide..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Maximum Depth *
                </label>
                <select
                  value={formData.maxDepth}
                  onChange={e => setFormData({...formData, maxDepth: parseInt(e.target.value)})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900"
                >
                  {[1, 2, 3, 4, 5].map(d => (
                    <option key={d} value={d}>{d} level{d > 1 ? 's' : ''}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Level Names (optional)
                </label>
                <div className="space-y-2">
                  {Array.from({ length: formData.maxDepth }, (_, i) => i + 1).map(level => (
                    <div key={level} className="flex items-center gap-2">
                      <span className="text-sm text-gray-600 w-16">Level {level}:</span>
                      <input
                        type="text"
                        value={formData.levelNames[level.toString()] || ''}
                        onChange={e => updateLevelName(level, e.target.value)}
                        placeholder={`Level ${level}`}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  CSV File *
                </label>
                <div className="flex items-center gap-3">
                  <div className="flex-1 relative">
                    <input
                      type="file"
                      accept=".csv"
                      onChange={e => setFormData({...formData, file: e.target.files?.[0] || null})}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      id="create-file-input"
                    />
                    <div className="flex items-center gap-3 px-4 py-2.5 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors">
                      <span className="text-sm text-gray-500 truncate flex-1">
                        {formData.file ? formData.file.name : 'No file chosen'}
                      </span>
                    </div>
                  </div>
                  <label
                    htmlFor="create-file-input"
                    className="px-6 py-2.5 bg-indigo-50 text-indigo-700 font-medium rounded-lg hover:bg-indigo-100 transition-colors cursor-pointer whitespace-nowrap border border-indigo-200"
                  >
                    Choose file...
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  ℹ️ Required: id, label, parent_id, level | Optional: definition, synonyms
                </p>
              </div>

              {/* Modal Error Message - Below file chooser */}
              {modalMessage && (
                <div className={`p-4 rounded-lg text-sm ${
                  modalMessage.type === 'success' 
                    ? 'bg-green-50 text-green-800 border border-green-200' 
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                  <div className="flex items-start gap-2">
                    <span className="text-lg flex-shrink-0">
                      {modalMessage.type === 'error' ? '⚠️' : '✅'}
                    </span>
                    <div className="flex-1">
                      <p className="font-medium mb-1">
                        {modalMessage.type === 'error' ? 'Import Error' : 'Success'}
                      </p>
                      <p className="break-words">{modalMessage.text}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-200">
              <button
                onClick={() => setCreateModalOpen(false)}
                disabled={submitting}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={submitting || !formData.key || !formData.file}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Creating...' : 'Create & Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModalOpen && selectedTaxonomy && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Edit Taxonomy: {selectedTaxonomy.key}</h2>
              <button
                onClick={() => setEditModalOpen(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-2">
                  Key (cannot be changed)
                </label>
                <input
                  type="text"
                  value={formData.key}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Maximum Depth (current: {selectedTaxonomy.maxDepth})
                </label>
                <select
                  value={formData.maxDepth}
                  onChange={e => setFormData({...formData, maxDepth: parseInt(e.target.value)})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900"
                >
                  {[1, 2, 3, 4, 5].map(d => (
                    <option key={d} value={d}>{d} level{d > 1 ? 's' : ''}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Level Names
                </label>
                <div className="space-y-2">
                  {Array.from({ length: formData.maxDepth }, (_, i) => i + 1).map(level => (
                    <div key={level} className="flex items-center gap-2">
                      <span className="text-sm text-gray-600 w-16">Level {level}:</span>
                      <input
                        type="text"
                        value={formData.levelNames[level.toString()] || ''}
                        onChange={e => updateLevelName(level, e.target.value)}
                        placeholder={`Level ${level}`}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-orange-800 mb-2">⚠️ Update Nodes (optional)</h4>
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex-1 relative">
                    <input
                      type="file"
                      accept=".csv"
                      onChange={e => setFormData({...formData, file: e.target.files?.[0] || null})}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      id="edit-file-input"
                    />
                    <div className="flex items-center gap-3 px-4 py-2.5 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors">
                      <span className="text-sm text-gray-500 truncate flex-1">
                        {formData.file ? formData.file.name : 'No file chosen'}
                      </span>
                    </div>
                  </div>
                  <label
                    htmlFor="edit-file-input"
                    className="px-6 py-2.5 bg-indigo-50 text-indigo-700 font-medium rounded-lg hover:bg-indigo-100 transition-colors cursor-pointer whitespace-nowrap border border-indigo-200"
                  >
                    Choose file...
                  </label>
                </div>
                <p className="text-xs text-orange-700">
                  ⚠️ WARNING: This will REPLACE all existing nodes with the uploaded CSV
                </p>
              </div>
            </div>

            <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-200">
              <button
                onClick={() => setEditModalOpen(false)}
                disabled={submitting}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleEdit}
                disabled={submitting}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteModalOpen && selectedTaxonomy && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full shadow-xl">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-red-600">⚠️ Danger Zone</h3>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-gray-700">You are about to delete taxonomy:</p>
              <p className="font-semibold text-gray-900">"{selectedTaxonomy.key}"</p>
              
              <div className="text-sm text-gray-600 space-y-1">
                <p>This will:</p>
                <ul className="list-disc list-inside pl-2">
                  <li>Soft-delete the taxonomy (can restore later)</li>
                  <li>Hide it from active use</li>
                  <li>Preserve {selectedTaxonomy.nodeCount} nodes and {selectedTaxonomy.annotationCount} annotations</li>
                </ul>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Type <code className="bg-gray-100 px-2 py-1 rounded text-red-600 font-mono">DELETE</code> to confirm:
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-900"
                  autoFocus
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 border-t border-gray-200">
              <button
                onClick={() => {
                  setDeleteModalOpen(false)
                  setConfirmText('')
                }}
                disabled={submitting}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={confirmText !== 'DELETE' || submitting}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Deleting...' : 'Delete Taxonomy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
