"use client"
import { formatFieldName, formatRelativeTime, formatDateTime } from '@/lib/utils'
import { useRouter } from 'next/navigation'

type Annotation = {
  id: string
  level: number
  nodeCode: string
  nodeLabel?: string | null
  source: 'user' | 'ai'
  taxonomy: {
    key: string
    displayName: string
  }
}

type Comment = {
  id: string
  body: string
  createdAt: string
  author: {
    name: string | null
  }
}

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
  annotations: Annotation[]
  comments?: Comment[]
  _count?: {
    comments: number
  }
}

interface SentenceRowProps {
  sentence: Sentence
  selected: boolean
  onSelect: (checked: boolean) => void
  showAssignedTo?: boolean
  taxonomies?: Array<{ key: string }> // Ordered list of taxonomies to match color order
  sentenceIds?: string[] // List of sentence IDs in current view (for navigation)
  currentIndex?: number // Current index in the list
}

export default function SentenceRow({
  sentence,
  selected,
  onSelect,
  showAssignedTo = false,
  taxonomies = [],
  sentenceIds = [],
  currentIndex = 0
}: SentenceRowProps) {
  const router = useRouter()

  const handleRowClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking checkbox
    if ((e.target as HTMLElement).closest('input[type="checkbox"]')) {
      return
    }
    // Include list and index in URL for navigation context
    const params = new URLSearchParams()
    if (sentenceIds.length > 0) {
      params.set('list', sentenceIds.join(','))
      params.set('index', currentIndex.toString())
    }
    const queryString = params.toString()
    router.push(`/queue/${sentence.id}${queryString ? `?${queryString}` : ''}`)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-gray-100 text-gray-800'
      case 'submitted':
        return 'bg-green-100 text-green-800'
      case 'skipped':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  // Generate consistent color based on username
  const getUserColor = (username: string) => {
    const colors = [
      'bg-indigo-100 text-indigo-700',
      'bg-purple-100 text-purple-700',
      'bg-pink-100 text-pink-700',
      'bg-rose-100 text-rose-700',
      'bg-orange-100 text-orange-700',
      'bg-amber-100 text-amber-700',
      'bg-lime-100 text-lime-700',
      'bg-emerald-100 text-emerald-700',
      'bg-teal-100 text-teal-700',
      'bg-cyan-100 text-cyan-700',
      'bg-sky-100 text-sky-700',
      'bg-blue-100 text-blue-700',
    ]
    
    // Simple hash function to get consistent color for each username
    let hash = 0
    for (let i = 0; i < username.length; i++) {
      hash = ((hash << 5) - hash) + username.charCodeAt(i)
      hash = hash & hash // Convert to 32bit integer
    }
    
    return colors[Math.abs(hash) % colors.length]
  }

  // Build content string with "Field Name: Value" format
  const buildContentString = () => {
    const parts: { name: string; value: string }[] = []
    
    // Iterate through field mapping in order
    Object.entries(sentence.fieldMapping || {}).forEach(([num, name]) => {
      const value = sentence[`field${num}` as keyof Sentence] as string | null
      if (value) {
        parts.push({ name: formatFieldName(name), value })
      }
    })
    
    return parts
  }

  const contentParts = buildContentString()

  // Group annotations by taxonomy
  const annotationsByTaxonomy = sentence.annotations.reduce((acc, ann) => {
    const key = ann.taxonomy.key
    if (!acc[key]) {
      acc[key] = []
    }
    acc[key].push(ann)
    return acc
  }, {} as Record<string, Annotation[]>)

  // Color scheme for different taxonomies (matches TaxonomyBrowser)
  const taxonomyColors = [
    'bg-indigo-100 text-indigo-700',  // Index 0: Primary/Teal
    'bg-purple-100 text-purple-700',  // Index 1: Purple
    'bg-pink-100 text-pink-700',      // Index 2: Pink
    'bg-rose-100 text-rose-700',      // Index 3: Rose
    'bg-orange-100 text-orange-700',   // Index 4: Orange
  ]

  const getTaxonomyColor = (taxonomyKey: string) => {
    // Use the ordered taxonomies list if provided, otherwise fall back to alphabetical sort
    const orderedTaxonomies = taxonomies.length > 0 
      ? taxonomies.map(t => t.key)
      : Object.keys(annotationsByTaxonomy).sort()
    
    const index = orderedTaxonomies.indexOf(taxonomyKey)
    return taxonomyColors[index % taxonomyColors.length] || 'bg-gray-100 text-gray-700'
  }

  const commentCount = sentence._count?.comments || sentence.comments?.length || 0

  return (
    <tr
      onClick={handleRowClick}
      className="hover:bg-indigo-50 cursor-pointer transition-colors border-b border-gray-100"
    >
      {/* Checkbox */}
      <td className="px-4 py-3 w-12" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer"
        />
      </td>

      {/* Content */}
      <td className="px-4 py-3 w-[40%]">
        <div className="flex items-start gap-2">
          {/* Icons at the beginning */}
          <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
            {sentence.flagged && (
              <span
                className="text-gray-500 cursor-help text-sm"
                title="Flagged"
              >
                🚩
              </span>
            )}
            {commentCount > 0 && (
              <span
                className="text-gray-500 cursor-help text-sm"
                title={
                  sentence.comments && sentence.comments.length > 0
                    ? sentence.comments.map(c => `${c.author.name || 'Unknown'}: ${c.body}`).join('\n---\n')
                    : `${commentCount} comment(s)`
                }
              >
                💬
              </span>
            )}
          </div>
          
          {/* Field values with "Name Value" format */}
          <div className="flex-1 min-w-0">
            <div className="text-sm text-gray-900 line-clamp-2">
              {contentParts.map((part, i) => (
                <span key={i}>
                  {i > 0 && ' '}
                  <span className="text-[11px] font-medium text-gray-500">{part.name}</span>{' '}
                  {part.value}
                </span>
              ))}
            </div>
          </div>
        </div>
      </td>

      {/* Labels */}
      <td className="px-4 py-3 w-[18%]">
        <div className="flex flex-col gap-1.5">
          {Object.keys(annotationsByTaxonomy).length > 0 ? (
            Object.entries(annotationsByTaxonomy).map(([taxonomyKey, annotations]) => (
              <div key={taxonomyKey} className="flex flex-wrap gap-1">
                {annotations.map((ann, i) => (
                  <span
                    key={i}
                    className={`text-xs px-2 py-1 rounded whitespace-nowrap ${getTaxonomyColor(taxonomyKey)}`}
                    title={`${ann.taxonomy.key} L${ann.level}: ${ann.nodeCode}${
                      ann.nodeLabel ? ` - ${ann.nodeLabel}` : ''
                    }`}
                  >
                    {ann.source === 'ai' && '🤖 '}
                    {ann.nodeCode}
                  </span>
                ))}
              </div>
            ))
          ) : (
            <span className="text-gray-400 text-xs">—</span>
          )}
        </div>
      </td>

      {/* Last Edited */}
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
        <span title={formatDateTime(sentence.lastEditedAt)}>
          {formatRelativeTime(sentence.lastEditedAt)}
        </span>
      </td>

      {/* Last Editor */}
      <td className="px-4 py-3 whitespace-nowrap">
        {sentence.lastEditor?.name ? (
          <span 
            className={`text-xs px-2 py-0.5 rounded ${getUserColor(sentence.lastEditor.name)}`}
            title={sentence.lastEditor.name}
          >
            {sentence.lastEditor.name}
          </span>
        ) : (
          <span className="text-gray-400 text-sm">—</span>
        )}
      </td>

      {/* Assigned To */}
      {showAssignedTo && (
        <td className="px-4 py-3 whitespace-nowrap">
          {sentence.assignments && sentence.assignments.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {sentence.assignments.map((assignment, idx) => (
                <span 
                  key={idx}
                  className={`text-xs px-2 py-0.5 rounded ${getUserColor(assignment.user.username)}`}
                  title={assignment.user.name || assignment.user.username}
                >
                  {assignment.user.username}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-gray-400 text-sm">—</span>
          )}
        </td>
      )}

      {/* Status */}
      <td className="px-4 py-3 whitespace-nowrap">
        <span className={`text-xs px-2 py-0.5 rounded ${getStatusColor(sentence.status)}`}>
          {sentence.status}
        </span>
      </td>

      {/* Action */}
      <td className="px-4 py-3 text-center w-12">
        <button
          onClick={handleRowClick}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          title="Open sentence"
        >
          →
        </button>
      </td>
    </tr>
  )
}
