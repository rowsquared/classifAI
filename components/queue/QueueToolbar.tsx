"use client"

interface QueueToolbarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
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
  stats
}: QueueToolbarProps) {
  return (
    <div className="bg-white border-b border-gray-200 p-4">
      {/* Search and Progress Row */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative w-96 max-w-[50%]">
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

        {/* Progress Indicator */}
        <div className="text-sm text-gray-600">
          <span className="font-medium text-gray-900">{stats.submitted.toLocaleString()}</span> of{' '}
          <span className="font-medium text-gray-900">{stats.total.toLocaleString()}</span> labeled
          <span className="text-gray-500 ml-2">({stats.progress}%)</span>
        </div>
      </div>
    </div>
  )
}

