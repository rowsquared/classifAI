"use client"

interface QueueToolbarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  selectedTaxonomy: string | null
  onTaxonomyChange: (taxonomyKey: string | null) => void
  taxonomies: Array<{ key: string; displayName: string }>
  stats: {
    total: number
    submitted: number
    pending: number
    progress: number
  }
}

export default function QueueToolbar({
  searchQuery,
  onSearchChange,
  selectedTaxonomy,
  onTaxonomyChange,
  taxonomies,
  stats
}: QueueToolbarProps) {
  return (
    <div className="bg-white border-b border-gray-200 p-4 space-y-3">
      {/* Search and Taxonomy Selector Row */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Search sentences..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100"
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Taxonomy Selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 whitespace-nowrap">View labels:</span>
          <select
            value={selectedTaxonomy || 'all'}
            onChange={(e) => onTaxonomyChange(e.target.value === 'all' ? null : e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="all">All Taxonomies</option>
            {taxonomies.map(t => (
              <option key={t.key} value={t.key}>
                {t.key}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-6 text-sm text-gray-600">
        <div>
          <span className="font-medium text-gray-900">{stats.submitted.toLocaleString()}</span> of{' '}
          <span className="font-medium text-gray-900">{stats.total.toLocaleString()}</span> labeled
          <span className="text-gray-500 ml-2">({stats.progress}%)</span>
        </div>
        <div className="text-gray-400">|</div>
        <div>
          <span className="font-medium text-yellow-700">{stats.pending.toLocaleString()}</span> pending
        </div>
      </div>
    </div>
  )
}

