"use client"
import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export type QueueFilters = {
  status: string[]
  userId: string | null
  userScope: 'all' | 'me' | 'specific'
  assignedToUserId: string | null
  dateRange: {
    from: string | null
    to: string | null
  }
  taxonomyKey: string | null
  level: string | null
  code: string | null
  source: 'all' | 'ai' | 'user' | null
  flagged: boolean | null
  hasComments: boolean | null
  supportFilters: Record<string, string>
}

interface FilterPanelProps {
  collapsed: boolean
  onToggle: () => void
  filters: QueueFilters
  onApply: (filters: QueueFilters) => void
  onReset: () => void
  taxonomies: Array<{ key: string; displayName: string }>
  users?: Array<{ id: string; username: string; name: string | null }>
  showAssignedToFilter?: boolean
}

export default function FilterPanel({
  collapsed,
  onToggle,
  filters,
  onApply,
  onReset,
  taxonomies,
  users = [],
  showAssignedToFilter = false
}: FilterPanelProps) {
  const [localFilters, setLocalFilters] = useState<QueueFilters>(filters)

  const handleApply = () => {
    onApply(localFilters)
  }

  const handleReset = () => {
    const emptyFilters: QueueFilters = {
      status: [],
      userId: null,
      userScope: 'all',
      assignedToUserId: null,
      dateRange: { from: null, to: null },
      taxonomyKey: null,
      level: null,
      code: null,
      source: null,
      flagged: null,
      hasComments: null,
      supportFilters: {}
    }
    setLocalFilters(emptyFilters)
    onReset()
  }

  const toggleStatus = (status: string) => {
    setLocalFilters(prev => ({
      ...prev,
      status: prev.status.includes(status)
        ? prev.status.filter(s => s !== status)
        : [...prev.status, status]
    }))
  }

  // Count active filters
  const activeFilterCount = 
    filters.status.length +
    (filters.flagged !== null ? 1 : 0) +
    (filters.hasComments !== null ? 1 : 0) +
    (filters.assignedToUserId ? 1 : 0) +
    (filters.dateRange.from || filters.dateRange.to ? 1 : 0) +
    (filters.taxonomyKey ? 1 : 0) +
    (filters.level ? 1 : 0) +
    (filters.code ? 1 : 0) +
    (filters.source ? 1 : 0) +
    Object.keys(filters.supportFilters).filter(k => filters.supportFilters[k]).length

  if (collapsed) {
    return (
      <div className="w-12 bg-gray-50 border-r border-gray-200 flex flex-col items-center py-4">
        <div className="relative">
          <button
            onClick={onToggle}
            className="p-2 hover:bg-gray-200 rounded transition-colors"
            title="Show filters"
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-indigo-600 text-white text-xs font-medium rounded-full flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-gray-900">Filters</h2>
          {activeFilterCount > 0 && (
            <span className="px-2 py-0.5 bg-indigo-600 text-white text-xs font-medium rounded-full">
              {activeFilterCount}
            </span>
          )}
        </div>
        <button
          onClick={onToggle}
          className="p-1 hover:bg-gray-200 rounded transition-colors"
          title="Hide filters"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* Filter Sections */}
      <div className="flex-1 p-4 space-y-6 overflow-y-auto">
        {/* Status */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Status</h3>
          <div className="space-y-2">
            {['pending', 'submitted', 'skipped'].map(status => (
              <label key={status} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localFilters.status.includes(status)}
                  onChange={() => toggleStatus(status)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700 capitalize">{status}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Flags & Comments */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Flags & Comments</h3>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={localFilters.flagged === true}
                onChange={(e) => setLocalFilters(prev => ({
                  ...prev,
                  flagged: e.target.checked ? true : null
                }))}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">🚩 Flagged only</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={localFilters.hasComments === true}
                onChange={(e) => setLocalFilters(prev => ({
                  ...prev,
                  hasComments: e.target.checked ? true : null
                }))}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">💬 Has comments</span>
            </label>
          </div>
        </div>

        {/* Assigned To */}
        {showAssignedToFilter && users.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Assigned To</h3>
            <select
              value={localFilters.assignedToUserId || ''}
              onChange={(e) => setLocalFilters(prev => ({
                ...prev,
                assignedToUserId: e.target.value || null
              }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All users</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>
                  {user.name || user.username}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Date Range */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Last Edited</h3>
          <div className="space-y-2">
            {/* Quick preset buttons */}
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={() => {
                  const today = new Date()
                  const todayStr = today.toISOString().split('T')[0]
                  setLocalFilters(prev => ({
                    ...prev,
                    dateRange: { from: todayStr, to: todayStr }
                  }))
                }}
                className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 transition-colors"
              >
                Today
              </button>
              <button
                onClick={() => {
                  const today = new Date()
                  const weekAgo = new Date(today)
                  weekAgo.setDate(today.getDate() - 7)
                  setLocalFilters(prev => ({
                    ...prev,
                    dateRange: {
                      from: weekAgo.toISOString().split('T')[0],
                      to: today.toISOString().split('T')[0]
                    }
                  }))
                }}
                className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 transition-colors"
              >
                Last 7d
              </button>
              <button
                onClick={() => {
                  const today = new Date()
                  const monthAgo = new Date(today)
                  monthAgo.setDate(today.getDate() - 30)
                  setLocalFilters(prev => ({
                    ...prev,
                    dateRange: {
                      from: monthAgo.toISOString().split('T')[0],
                      to: today.toISOString().split('T')[0]
                    }
                  }))
                }}
                className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 transition-colors"
              >
                Last 30d
              </button>
              <button
                onClick={() => {
                  setLocalFilters(prev => ({
                    ...prev,
                    dateRange: { from: null, to: null }
                  }))
                }}
                className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 transition-colors text-gray-600"
              >
                Clear
              </button>
            </div>

            {/* Custom date range */}
            <div className="pt-2 border-t border-gray-200">
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-600 block mb-1">From</label>
                  <input
                    type="date"
                    value={localFilters.dateRange.from || ''}
                    onChange={(e) => setLocalFilters(prev => ({
                      ...prev,
                      dateRange: { ...prev.dateRange, from: e.target.value || null }
                    }))}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600 block mb-1">To</label>
                  <input
                    type="date"
                    value={localFilters.dateRange.to || ''}
                    onChange={(e) => setLocalFilters(prev => ({
                      ...prev,
                      dateRange: { ...prev.dateRange, to: e.target.value || null }
                    }))}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Taxonomy/Labels */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Labels</h3>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-gray-600">Taxonomy</label>
              <select
                value={localFilters.taxonomyKey || ''}
                onChange={(e) => setLocalFilters(prev => ({
                  ...prev,
                  taxonomyKey: e.target.value || null
                }))}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Any</option>
                {taxonomies.map(t => (
                  <option key={t.key} value={t.key}>{t.key}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600">Level</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  placeholder="Any"
                  value={localFilters.level || ''}
                  onChange={(e) => setLocalFilters(prev => ({
                    ...prev,
                    level: e.target.value || null
                  }))}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Code</label>
                <input
                  type="text"
                  placeholder="Any"
                  value={localFilters.code || ''}
                  onChange={(e) => setLocalFilters(prev => ({
                    ...prev,
                    code: e.target.value || null
                  }))}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-600">Source</label>
              <select
                value={localFilters.source || 'all'}
                onChange={(e) => setLocalFilters(prev => ({
                  ...prev,
                  source: e.target.value === 'all' ? null : e.target.value as 'ai' | 'user'
                }))}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All</option>
                <option value="user">Human only</option>
                <option value="ai">AI only</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-gray-200 space-y-2">
        <button
          onClick={handleApply}
          className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
        >
          Apply Filters
        </button>
        <button
          onClick={handleReset}
          className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
        >
          Reset
        </button>
      </div>
    </div>
  )
}

