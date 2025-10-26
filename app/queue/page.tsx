"use client"
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import PageHeader from '@/components/PageHeader'
import FilterPanel, { type QueueFilters } from '@/components/queue/FilterPanel'
import QueueToolbar from '@/components/queue/QueueToolbar'
import SentenceRow from '@/components/queue/SentenceRow'
import PaginationControls from '@/components/queue/PaginationControls'
import BulkLabelPanel from '@/components/queue/BulkLabelPanel'
import AssignmentModal from '@/components/queue/AssignmentModal'

type Sentence = {
  id: string
  field1: string
  field2?: string | null
  field3?: string | null
  field4?: string | null
  field5?: string | null
  fieldMapping: Record<string, string>
  status: string
  flagged: boolean
  lastEditedAt: string | null
  lastEditor?: {
    name: string | null
    email: string
  } | null
  assignments?: Array<{
    user: {
      id: string
      username: string
      name: string | null
    }
  }>
  annotations: Array<{
    id: string
    level: number
    nodeCode: number
    nodeLabel?: string | null
    source: 'user' | 'ai'
    taxonomy: { key: string; displayName: string }
  }>
  comments?: Array<{
    id: string
    body: string
    createdAt: string
    author: { name: string | null }
  }>
  _count?: {
    comments: number
  }
}

type QueueResponse = {
  sentences: Sentence[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
}

type Stats = {
  total: number
  pending: number
  submitted: number
  skipped: number
  flagged: number
  progress: number
}

type Taxonomy = {
  key: string
  displayName: string
}

const DEFAULT_FILTERS: QueueFilters = {
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

export default function QueuePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session } = useSession()
  
  // UI State - remember filter panel state in localStorage
  const [filterCollapsed, setFilterCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('queueFilterCollapsed')
      return saved !== null ? JSON.parse(saved) : true // Default to collapsed
    }
    return true
  })
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'submitted' | 'skipped'>('pending')
  const [selectedTaxonomy, setSelectedTaxonomy] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [bulkLabelOpen, setBulkLabelOpen] = useState(false)
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false)
  
  // Data State
  const [queue, setQueue] = useState<QueueResponse | null>(null)
  const [stats, setStats] = useState<Stats>({
    total: 0,
    pending: 0,
    submitted: 0,
    skipped: 0,
    flagged: 0,
    progress: 0
  })
  const [taxonomies, setTaxonomies] = useState<Taxonomy[]>([])
  const [loading, setLoading] = useState(false)
  const [canAssign, setCanAssign] = useState(false)
  const [users, setUsers] = useState<Array<{ id: string; username: string; name: string | null }>>([])
  
  // Filter & Pagination State
  const [filters, setFilters] = useState<QueueFilters>(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  
  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  
  // Auto-refresh State
  const [lastRefresh, setLastRefresh] = useState(Date.now())

  // Check if user can assign sentences
  useEffect(() => {
    const checkCanAssign = async () => {
      if (!session?.user?.id) return
      
      // Admins can always assign
      if (session.user.role === 'admin') {
        setCanAssign(true)
        return
      }
      
      // Supervisors can assign if they have labellers
      if (session.user.role === 'supervisor') {
        try {
          const res = await fetch(`/api/users/${session.user.id}`)
          if (res.ok) {
            const data = await res.json()
            // Can assign if they supervise at least one user
            setCanAssign(data.user?.labellers?.length > 0)
          }
        } catch (error) {
          console.error('Failed to check assignment permissions:', error)
        }
      }
      // Labellers cannot assign
    }
    checkCanAssign()
  }, [session])

  // Fetch users for admin/supervisor
  useEffect(() => {
    const loadUsers = async () => {
      if (!session?.user) return
      if (session.user.role !== 'admin' && session.user.role !== 'supervisor') return
      
      try {
        const res = await fetch('/api/users')
        if (res.ok) {
          const data = await res.json()
          setUsers(data.users.map((u: any) => ({
            id: u.id,
            username: u.username,
            name: u.name
          })))
        }
      } catch (error) {
        console.error('Failed to load users:', error)
      }
    }
    
    loadUsers()
  }, [session])

  // Fetch taxonomies
  useEffect(() => {
    const loadTaxonomies = async () => {
      try {
        const res = await fetch('/api/taxonomies/active')
        if (!res.ok) throw new Error('Failed to fetch taxonomies')
        const data = await res.json()
        if (data.ok) {
          setTaxonomies(data.taxonomies)
        }
      } catch (error) {
        console.error('Failed to load taxonomies:', error)
      }
    }
    
    loadTaxonomies()
  }, [])

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/sentences/stats')
      if (!res.ok) throw new Error('Failed to fetch stats')
      const data = await res.json()
      if (data.ok) {
        setStats(data.stats)
      }
    } catch (error) {
      console.error('Failed to load stats:', error)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats, lastRefresh])

  // Fetch sentences
  const fetchQueue = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      
      // Search
      if (searchQuery) params.set('q', searchQuery)
      
      // Tab-based status filter
      if (activeTab !== 'all') {
        params.set('status', activeTab)
      }
      
      // Additional status filters from filter panel
      if (filters.status.length > 0 && activeTab === 'all') {
        params.set('status', filters.status.join(','))
      }
      
      // Other filters
      if (filters.userId) params.set('userId', filters.userId)
      if (filters.assignedToUserId) params.set('assignedToUserId', filters.assignedToUserId)
      if (filters.dateRange.from) params.set('lastEditedFrom', filters.dateRange.from)
      if (filters.dateRange.to) params.set('lastEditedTo', filters.dateRange.to)
      if (filters.taxonomyKey) params.set('taxonomyKey', filters.taxonomyKey)
      if (filters.level) params.set('level', filters.level)
      if (filters.code) params.set('code', filters.code)
      if (filters.source) params.set('source', filters.source)
      if (filters.flagged !== null) params.set('flagged', String(filters.flagged))
      if (filters.hasComments !== null) params.set('hasComments', String(filters.hasComments))
      
      // Support filters
      Object.entries(filters.supportFilters).forEach(([key, value]) => {
        if (value) params.set(key, value)
      })
      
      // Pagination
      params.set('page', String(page))
      params.set('limit', String(pageSize))
      params.set('sort', 'createdAt')
      params.set('order', 'asc')

      const res = await fetch(`/api/sentences?${params}`)
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      const data = await res.json()
      setQueue(data)
    } catch (error) {
      console.error('Failed to fetch queue:', error)
      setQueue({
        sentences: [],
        pagination: { page: 1, limit: pageSize, total: 0, pages: 0 }
      })
    } finally {
      setLoading(false)
    }
  }, [searchQuery, activeTab, filters, page, pageSize])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  // Auto-refresh polling (every 30 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      setLastRefresh(Date.now())
    }, 30000)
    
    return () => clearInterval(interval)
  }, [])

  // Handle tab change
  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab)
    setPage(1)
    setSelectedIds(new Set())
  }

  // Handle filter apply
  const handleApplyFilters = (newFilters: QueueFilters) => {
    setFilters(newFilters)
    setPage(1)
    setSelectedIds(new Set())
  }

  // Handle filter reset
  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS)
    setSearchQuery('')
    setPage(1)
    setSelectedIds(new Set())
  }

  // Handle search
  const handleSearch = (query: string) => {
    setSearchQuery(query)
    setPage(1)
    setSelectedIds(new Set())
  }

  // Handle selection
  const handleSelectAll = (checked: boolean) => {
    if (checked && queue) {
      setSelectedIds(new Set(queue.sentences.map(s => s.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  const handleSelect = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds)
    if (checked) {
      newSelected.add(id)
    } else {
      newSelected.delete(id)
    }
    setSelectedIds(newSelected)
  }

  // Refresh queue after any changes
  const refreshQueue = async () => {
    await fetchQueue()
    await fetchStats()
  }

  // Handle bulk label
  const handleBulkLabel = async (taxonomyKey: string, annotations: Array<{ level: number; nodeCode: number }>) => {
    try {
      const res = await fetch('/api/sentences/bulk-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sentenceIds: Array.from(selectedIds),
          taxonomyKey,
          annotations
        })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to bulk label')
      }

      // Success - refresh queue and stats
      await refreshQueue()
      setSelectedIds(new Set())
      setBulkLabelOpen(false)
      
      // Show success message
      alert(`Successfully labeled ${selectedIds.size} sentence(s)`)
    } catch (error: any) {
      console.error('Bulk label error:', error)
      throw error
    }
  }

  // Handle page size change
  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    setPage(1)
  }

  const allSelected = queue && queue.sentences.length > 0 && selectedIds.size === queue.sentences.length
  const someSelected = selectedIds.size > 0

  return (
    <>
      <PageHeader 
        title="Queue"
        actions={someSelected ? (
          <>
            <span className="text-sm font-medium text-gray-900">
              {selectedIds.size} {selectedIds.size === 1 ? 'sentence' : 'sentences'} selected
            </span>
            <div className="h-4 w-px bg-gray-300"></div>
            <button
              onClick={() => setBulkLabelOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
              title="Apply the same label to all selected sentences"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              Bulk Label
            </button>
            {canAssign && (
              <button
                onClick={() => setAssignmentModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                title="Assign sentences to users"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Assign
              </button>
            )}
            <div className="h-4 w-px bg-gray-300"></div>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors text-sm"
            >
              Clear Selection
            </button>
          </>
        ) : undefined}
      />

      <div className="flex h-[calc(100vh-66px)]">
        {/* Filter Panel */}
        <FilterPanel
          collapsed={filterCollapsed}
          onToggle={() => {
            const newState = !filterCollapsed
            setFilterCollapsed(newState)
            if (typeof window !== 'undefined') {
              localStorage.setItem('queueFilterCollapsed', JSON.stringify(newState))
            }
          }}
          filters={filters}
          onApply={handleApplyFilters}
          onReset={handleResetFilters}
          taxonomies={taxonomies}
          users={users}
          showAssignedToFilter={session?.user?.role === 'admin' || session?.user?.role === 'supervisor'}
        />

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {/* Toolbar */}
          <QueueToolbar
            searchQuery={searchQuery}
            onSearchChange={handleSearch}
            selectedTaxonomy={selectedTaxonomy}
            onTaxonomyChange={setSelectedTaxonomy}
            taxonomies={taxonomies}
            stats={stats}
          />

          {/* Tabs */}
          <div className="border-b border-gray-200 px-6">
            <nav className="flex gap-6">
              {[
                { key: 'all', label: 'All', count: stats.total },
                { key: 'pending', label: 'Pending', count: stats.pending },
                { key: 'submitted', label: 'Submitted', count: stats.submitted },
                { key: 'skipped', label: 'Skipped', count: stats.skipped }
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => handleTabChange(tab.key as typeof activeTab)}
                  className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.key
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label} ({tab.count.toLocaleString()})
                </button>
              ))}
            </nav>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="p-12 text-center text-gray-600">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <p className="mt-2">Loading sentences...</p>
              </div>
            ) : queue?.sentences.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <p className="text-lg">No sentences found</p>
                <p className="text-sm mt-1">Try adjusting your filters or search query</p>
              </div>
            ) : (
              <>
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                    <tr>
              <th className="px-4 py-3 text-left w-12">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer"
                />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider w-[40%]">
                        Content
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider w-[18%]">
                        Labels
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Edited
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Editor
                      </th>
                      {(session?.user?.role === 'admin' || session?.user?.role === 'supervisor') && (
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Assigned
                        </th>
                      )}
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider w-12">
                        
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {queue?.sentences.map((sentence) => (
                      <SentenceRow
                        key={sentence.id}
                        sentence={sentence}
                        selected={selectedIds.has(sentence.id)}
                        onSelect={(checked) => handleSelect(sentence.id, checked)}
                        taxonomyView={selectedTaxonomy}
                        showAssignedTo={session?.user?.role === 'admin' || session?.user?.role === 'supervisor'}
                      />
                    ))}
                  </tbody>
                </table>

                {/* Pagination - below table */}
                {queue && queue.pagination.total > 0 && (
                  <PaginationControls
                    page={page}
                    pageSize={pageSize}
                    total={queue.pagination.total}
                    totalPages={queue.pagination.pages}
                    onPageChange={setPage}
                    onPageSizeChange={handlePageSizeChange}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bulk Label Panel */}
      {bulkLabelOpen && (
        <BulkLabelPanel
          sentenceIds={Array.from(selectedIds)}
          onClose={() => setBulkLabelOpen(false)}
          onSuccess={refreshQueue}
        />
      )}

      {/* Assignment Modal */}
      {assignmentModalOpen && (
        <AssignmentModal
          sentenceIds={Array.from(selectedIds)}
          onClose={() => setAssignmentModalOpen(false)}
          onSuccess={() => {
            setAssignmentModalOpen(false)
            setSelectedIds(new Set())
            refreshQueue()
          }}
        />
      )}
    </>
  )
}
