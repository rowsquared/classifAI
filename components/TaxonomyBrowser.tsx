"use client"
import { useState, useEffect } from 'react'

export type TaxonomyNode = {
  code: number
  label: string
  level: number
  parentCode: number | null
  isLeaf: boolean
  definition?: string
}

export type SelectedLabel = {
  level: number
  nodeCode: number
  taxonomyKey: string
  label?: string
  isLeaf?: boolean
}

export type Taxonomy = {
  key: string
  displayName: string
  maxDepth: number
  levelNames?: Record<string, string> | null
}

interface TaxonomyBrowserProps {
  taxonomy: Taxonomy
  selectedLabels: SelectedLabel[]
  onLabelsChange: (labels: SelectedLabel[]) => void
  onNavigate?: (level: number, parent: number | null) => void
}

export default function TaxonomyBrowser({
  taxonomy,
  selectedLabels,
  onLabelsChange,
  onNavigate
}: TaxonomyBrowserProps) {
  const [currentLevel, setCurrentLevel] = useState(1)
  const [currentParent, setCurrentParent] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [taxonomyNodes, setTaxonomyNodes] = useState<TaxonomyNode[]>([])
  const [breadcrumb, setBreadcrumb] = useState<TaxonomyNode[]>([])
  const [showLevelNames, setShowLevelNames] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('showLevelNames')
      return saved !== null ? JSON.parse(saved) : true
    }
    return true
  })

  // Helper to get level label
  const getLevelLabel = (level: number): string => {
    if (!showLevelNames || !taxonomy.levelNames) {
      return `Level ${level}`
    }
    return taxonomy.levelNames[level] || `Level ${level}`
  }

  // Toggle level names
  const toggleLevelNames = () => {
    const newValue = !showLevelNames
    setShowLevelNames(newValue)
    if (typeof window !== 'undefined') {
      localStorage.setItem('showLevelNames', JSON.stringify(newValue))
    }
  }

  // Load taxonomy nodes based on current level/parent or search
  useEffect(() => {
    if (!taxonomy) return
    
    const loadNodes = async () => {
      try {
        const params = new URLSearchParams({
          level: String(currentLevel)
        })
        if (currentParent !== null) {
          params.set('parentCode', String(currentParent))
        }

        const res = await fetch(`/api/taxonomies/${taxonomy.key}/nodes?${params}`)
        if (!res.ok) throw new Error('Failed to fetch nodes')
        const data = await res.json()
        setTaxonomyNodes(data.items || [])
      } catch (error) {
        console.error('Failed to load nodes:', error)
      }
    }

    loadNodes()
  }, [taxonomy, currentLevel, currentParent])

  // Search across all levels
  useEffect(() => {
    if (!taxonomy || !searchQuery) {
      return
    }

    const searchNodes = async () => {
      try {
        const params = new URLSearchParams({
          q: searchQuery
        })

        const res = await fetch(`/api/taxonomies/${taxonomy.key}/nodes?${params}`)
        if (!res.ok) throw new Error('Failed to search')
        const data = await res.json()
        setTaxonomyNodes(data.items || [])
      } catch (error) {
        console.error('Failed to search:', error)
      }
    }

    const debounce = setTimeout(searchNodes, 300)
    return () => clearTimeout(debounce)
  }, [taxonomy, searchQuery])

  // Handle node click
  const handleNodeClick = (node: TaxonomyNode) => {
    // Determine if this node is a leaf
    const isLeaf = node.isLeaf || node.level >= taxonomy.maxDepth

    // If in search mode, first we need to reconstruct the breadcrumb to this node
    // and set the selected labels accordingly
    if (searchQuery) {
      // For now, just add this node to selected labels
      // In a real app, you might want to fetch the full path
      const newLabel: SelectedLabel = {
        level: node.level,
        nodeCode: node.code,
        taxonomyKey: taxonomy.key,
        label: node.label,
        isLeaf
      }
      
      // Remove any existing selections at this level or higher
      const newLabels = selectedLabels.filter(l => l.level < node.level)
      newLabels.push(newLabel)
      onLabelsChange(newLabels)
      
      // Clear search and navigate to children (if not a leaf)
      setSearchQuery('')
      if (!isLeaf) {
        setCurrentLevel(node.level + 1)
        setCurrentParent(node.code)
        onNavigate?.(node.level + 1, node.code)
      }
    } else {
      // Normal navigation mode
      const newLabel: SelectedLabel = {
        level: node.level,
        nodeCode: node.code,
        taxonomyKey: taxonomy.key,
        label: node.label,
        isLeaf
      }
      
      // Remove any selections at this level or higher, then add this one
      const newLabels = selectedLabels.filter(l => l.level < node.level)
      newLabels.push(newLabel)
      onLabelsChange(newLabels)
      
      // Update breadcrumb
      const newBreadcrumb = [...breadcrumb]
      if (node.level > currentLevel) {
        // Shouldn't happen but handle it
        newBreadcrumb.push(node)
      } else if (node.level === currentLevel) {
        newBreadcrumb.push(node)
      }
      setBreadcrumb(newBreadcrumb)
      
      // Navigate to children if not a leaf
      if (!isLeaf) {
        setCurrentLevel(node.level + 1)
        setCurrentParent(node.code)
        onNavigate?.(node.level + 1, node.code)
      }
    }
  }

  // Handle breadcrumb click
  const handleBreadcrumbClick = (index: number) => {
    if (index < 0) {
      // Go to root
      setCurrentLevel(1)
      setCurrentParent(null)
      setBreadcrumb([])
      onNavigate?.(1, null)
    } else {
      const targetNode = breadcrumb[index]
      setCurrentLevel(targetNode.level + 1)
      setCurrentParent(targetNode.code)
      setBreadcrumb(breadcrumb.slice(0, index + 1))
      onNavigate?.(targetNode.level + 1, targetNode.code)
    }
  }

  // Handle chip click (navigate to that level)
  const handleChipClick = (label: SelectedLabel) => {
    if (label.level === -1) return // Don't navigate for Unknown
    
    // Rebuild breadcrumb up to this level
    const newBreadcrumb = selectedLabels
      .filter(l => l.level < label.level && l.level > 0)
      .sort((a, b) => a.level - b.level)
      .map(l => ({
        code: l.nodeCode,
        label: l.label || '',
        level: l.level,
        parentCode: null,
        isLeaf: false
      }))
    
    setBreadcrumb(newBreadcrumb)
    setCurrentLevel(label.level)
    setCurrentParent(label.level === 1 ? null : selectedLabels.find(l => l.level === label.level - 1)?.nodeCode || null)
    setSearchQuery('')
  }

  // Handle chip delete
  const handleChipDelete = (label: SelectedLabel) => {
    // Remove this label and any labels at higher levels
    const remainingLabels = selectedLabels.filter(l => l.level < label.level)
    onLabelsChange(remainingLabels)
    
    // Navigate back to this level to select a different path
    const newBreadcrumb = remainingLabels
      .sort((a, b) => a.level - b.level)
      .map(l => ({
        code: l.nodeCode,
        label: l.label || '',
        level: l.level,
        parentCode: null,
        isLeaf: false
      }))
    
    setBreadcrumb(newBreadcrumb)
    
    // Navigate to show children at the level we just deleted
    const lastRemainingLabel = remainingLabels.length > 0 
      ? remainingLabels[remainingLabels.length - 1] 
      : null
    
    if (lastRemainingLabel) {
      setCurrentLevel(lastRemainingLabel.level + 1)
      setCurrentParent(lastRemainingLabel.nodeCode)
      onNavigate?.(lastRemainingLabel.level + 1, lastRemainingLabel.nodeCode)
    } else {
      setCurrentLevel(1)
      setCurrentParent(null)
      onNavigate?.(1, null)
    }
    
    setSearchQuery('')
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 flex flex-col">
      <div className="space-y-4 flex-shrink-0">
        {/* Selected Labels as Chips */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Selected Labels</h3>
          <div className="flex flex-wrap gap-2">
            {selectedLabels.length === 0 ? (
              <span className="text-gray-500 text-sm">No labels selected</span>
            ) : (
              selectedLabels
                .sort((a, b) => a.level - b.level)
                .map((label, i) => (
                  <div
                    key={i}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-indigo-100 text-indigo-800 border border-indigo-200 cursor-pointer hover:bg-indigo-200 transition-colors"
                    onClick={() => handleChipClick(label)}
                  >
                    <span className="text-xs bg-indigo-200 text-indigo-700 px-2 py-0.5 rounded">
                      L{label.level}
                    </span>
                    <span className="ml-2 font-medium">
                      {label.nodeCode === -1 ? 'Unknown' : `${label.nodeCode} - ${label.label || 'Loading...'}`}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleChipDelete(label)
                      }}
                      className="ml-2 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-200 rounded-full w-4 h-4 flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${taxonomy?.key || 'taxonomy'}`}
            className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-5 h-5 flex items-center justify-center"
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>

        {/* Level Indicator & Navigation */}
        {!searchQuery && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium text-gray-700">
                {getLevelLabel(currentLevel)}
              </h4>
              {taxonomy.levelNames && Object.keys(taxonomy.levelNames).length > 0 && (
                <button
                  onClick={toggleLevelNames}
                  className="text-xs text-indigo-600 hover:text-indigo-800"
                  title={showLevelNames ? 'Show as Level 1, Level 2, ...' : 'Show custom level names'}
                >
                  {showLevelNames ? '123' : 'ABC'}
                </button>
              )}
            </div>
            {breadcrumb.length > 0 && (
              <button
                onClick={() => handleBreadcrumbClick(breadcrumb.length - 2)}
                className="text-gray-600 hover:text-gray-800 text-xs px-2 py-1 border rounded"
              >
                ↑ Up
              </button>
            )}
          </div>
        )}

        {/* Taxonomy Nodes */}
        <div className="space-y-0 flex-1 overflow-y-auto border-t border-gray-200">
          {taxonomyNodes.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchQuery ? (
                <div>
                  <div className="text-lg mb-2">No results found</div>
                  <div className="text-sm">Try a different search term</div>
                </div>
              ) : (
                <div className="text-gray-500">
                  No labels available. <a href="/admin/taxonomy" className="text-indigo-600 hover:text-indigo-700 underline">Import taxonomy</a>
                </div>
              )}
            </div>
          ) : (
            taxonomyNodes.map((node) => {
              const isSelected = selectedLabels.some(l => l.level === node.level && l.nodeCode === node.code)
              return (
                <div
                  key={node.code}
                  onClick={() => handleNodeClick(node)}
                  className={`px-4 py-3 cursor-pointer transition-colors border-b border-gray-100 ${
                    isSelected 
                      ? 'bg-indigo-50' 
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      {/* Code - fixed width for alignment */}
                      <div className={`text-[15px] font-semibold flex-shrink-0 w-12 ${
                        isSelected ? 'text-indigo-600' : 'text-indigo-500'
                      }`}>
                        {node.code}
                      </div>
                      
                      {/* Label and definition */}
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] text-gray-900 leading-snug">
                          {node.label}
                        </div>
                        {searchQuery && (
                          <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">
                            {getLevelLabel(node.level)}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Arrow/Indicator */}
                    <div className={`flex-shrink-0 text-sm ${
                      isSelected ? 'text-indigo-600' : 'text-gray-400'
                    }`}>
                      {isSelected ? '✓' : (node.isLeaf ? '•' : '→')}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

