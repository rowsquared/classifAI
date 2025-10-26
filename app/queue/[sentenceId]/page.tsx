"use client"
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import TaxonomyBrowser, { type Taxonomy, type SelectedLabel } from '@/components/TaxonomyBrowser'
import ResizablePanel from '@/components/ResizablePanel'
import { formatFieldName } from '@/lib/utils'

type Sentence = {
  id: string
  field1: string
  field2?: string | null
  field3?: string | null
  field4?: string | null
  field5?: string | null
  support1?: string | null
  support2?: string | null
  support3?: string | null
  support4?: string | null
  support5?: string | null
  fieldMapping: Record<string, string>
  supportMapping?: Record<string, string> | null
  status: string
  flagged: boolean
  lastEditedAt: string | null
  annotations: Array<{
    level: number
    nodeCode: number
    nodeLabel?: string
    isLeaf?: boolean
    taxonomy: { key: string }
  }>
  _count?: { comments: number }
}

export default function LabelingPage() {
  const params = useParams()
  const router = useRouter()
  const sentenceId = params.sentenceId as string
  
  const [sentence, setSentence] = useState<Sentence | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedLabels, setSelectedLabels] = useState<SelectedLabel[]>([])
  const [comment, setComment] = useState('')
  const [showCommentDialog, setShowCommentDialog] = useState(false)
  const [hasComment, setHasComment] = useState(false)
  const [existingComments, setExistingComments] = useState<Array<{
    id: string
    body: string
    createdAt: string
    author: { name: string | null }
  }>>([])
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null)
  const [labelingStartedAt] = useState<Date>(new Date()) // Record when user opened this sentence

  // Load taxonomy metadata
  useEffect(() => {
    const loadTaxonomy = async () => {
      try {
        const res = await fetch('/api/taxonomies')
        if (!res.ok) throw new Error('Failed to fetch taxonomies')
        const data = await res.json()
        if (data.ok && data.taxonomies.length > 0) {
          const iscoTaxonomy = data.taxonomies.find((t: any) => t.key === 'ISCO' && t.isActive)
          if (iscoTaxonomy) {
            setTaxonomy({
              key: iscoTaxonomy.key,
              displayName: iscoTaxonomy.displayName,
              maxDepth: iscoTaxonomy.maxDepth || 5,
              levelNames: iscoTaxonomy.levelNames
            })
          }
        }
      } catch (error) {
        console.error('Failed to load taxonomy:', error)
      }
    }
    loadTaxonomy()
  }, [])

  // Load sentence data
  useEffect(() => {
    if (!sentenceId) return
    const loadSentence = async () => {
      try {
        const res = await fetch(`/api/sentences/${sentenceId}`)
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`)
        }
        const data = await res.json()
        setSentence(data)
        
        // Initialize selected labels from existing annotations
        if (data.annotations && taxonomy) {
          const labels: SelectedLabel[] = data.annotations
            .filter((ann: any) => ann.taxonomy.key === taxonomy.key)
            .map((ann: any) => ({
              level: ann.level,
              nodeCode: ann.nodeCode,
              taxonomyKey: ann.taxonomy.key,
              label: ann.nodeLabel || '',
              isLeaf: ann.isLeaf || false
            }))
          setSelectedLabels(labels)
        }
        
        // Check if sentence has comments
        const hasExistingComments = data._count?.comments > 0 || (data.comments && data.comments.length > 0)
        setHasComment(hasExistingComments)
      } catch (error) {
        console.error('Failed to load sentence:', error)
        setSentence(null)
      } finally {
        setLoading(false)
      }
    }
    loadSentence()
  }, [sentenceId, taxonomy])

  // Load existing comments
  const loadComments = async () => {
    try {
      const res = await fetch(`/api/sentences/${sentenceId}/comments`)
      if (res.ok) {
        const data = await res.json()
        setExistingComments(data.comments || [])
      }
    } catch (error) {
      console.error('Failed to load comments:', error)
    }
  }

  // Check if we have a leaf or unknown selected
  const hasLeafOrUnknown = selectedLabels.some(l => l.isLeaf || l.nodeCode === -99)

  // Handle Unknown
  const handleUnknown = () => {
    // Mark as unknown using special code -99
    setSelectedLabels([{
      level: 1,
      nodeCode: -99,
      taxonomyKey: taxonomy?.key || 'ISCO',
      label: 'Unknown',
      isLeaf: true
    }])
  }

  // Get next sentence ID from queue
  const getNextSentenceId = async () => {
    try {
      const res = await fetch('/api/sentences?status=pending&page=1&limit=1&sort=createdAt&order=asc')
      if (res.ok) {
        const data = await res.json()
        if (data.sentences && data.sentences.length > 0) {
          return data.sentences[0].id
        }
      }
    } catch (error) {
      console.error('Failed to fetch next sentence:', error)
    }
    return null
  }

  // Handle Flag
  const handleFlag = async () => {
    if (!sentence) return
    try {
      const res = await fetch(`/api/sentences/${sentenceId}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: sentence.status,
          annotations: [],
          flagged: !sentence.flagged
        })
      })
      if (res.ok) {
        setSentence({ ...sentence, flagged: !sentence.flagged })
      }
    } catch (error) {
      console.error('Failed to toggle flag:', error)
    }
  }

  // Handle Skip
  const handleSkip = async () => {
    try {
      const res = await fetch(`/api/sentences/${sentenceId}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'skipped',
          annotations: [],
          flagged: sentence?.flagged,
          labelingStartedAt: labelingStartedAt.toISOString()
        })
      })
      if (res.ok) {
        // Navigate to next sentence
        const nextId = await getNextSentenceId()
        if (nextId) {
          router.push(`/queue/${nextId}`)
        } else {
          // No more sentences, go back to queue
          router.push('/queue')
        }
      }
    } catch (error) {
      console.error('Failed to skip:', error)
    }
  }

  // Handle Submit
  const handleSubmit = async () => {
    if (!hasLeafOrUnknown || !taxonomy) {
      alert('Please select a complete path or mark as unknown')
      return
    }

    try {
      // Prepare annotations (including unknown as -99)
      const annotations = selectedLabels.map(l => ({ 
        level: l.level, 
        nodeCode: l.nodeCode, // -99 for unknown
        taxonomyKey: taxonomy.key
      }))

      const res = await fetch(`/api/sentences/${sentenceId}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'submitted',
          annotations,
          flagged: sentence?.flagged,
          labelingStartedAt: labelingStartedAt.toISOString()
        })
      })

      if (res.ok) {
        // Navigate to next sentence
        const nextId = await getNextSentenceId()
        if (nextId) {
          router.push(`/queue/${nextId}`)
        } else {
          // No more sentences, go back to queue
          router.push('/queue')
        }
      } else {
        const data = await res.json()
        alert(`Failed to submit annotations: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Failed to submit:', error)
      alert('Failed to submit annotations')
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      
      switch (e.key.toLowerCase()) {
        case 'c':
          loadComments()
          setShowCommentDialog(true)
          break
        case 'f':
          handleFlag()
          break
        case 'u':
          handleUnknown()
          break
        case 's':
          handleSkip()
          break
        case 'enter':
          if (hasLeafOrUnknown) {
            handleSubmit()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [selectedLabels, sentence])

  if (loading) {
    return (
      <>
        <PageHeader title="Labeling" />
        <div className="flex items-center justify-center h-screen">
          <div className="text-gray-600">Loading...</div>
        </div>
      </>
    )
  }

  if (!sentence) {
    return (
      <>
        <PageHeader title="Labeling" />
        <div className="flex items-center justify-center h-screen">
          <div className="text-red-600">Sentence not found</div>
        </div>
      </>
    )
  }

  if (!taxonomy) {
    return (
      <>
        <PageHeader title="Labeling" />
        <div className="flex items-center justify-center h-screen">
          <div className="text-red-600">No active taxonomy found</div>
        </div>
      </>
    )
  }

  const backButton = (
    <Link
      href="/queue"
      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
    >
      ← Back to Queue
    </Link>
  )

  return (
    <>
      <PageHeader title="Labeling" actions={backButton} />
      <div className="h-[calc(100vh-66px)] bg-gray-50 flex overflow-hidden">
        {/* Left Panel - Sentence Fields */}
        <ResizablePanel
          defaultWidth={50}
          minWidth={30}
          maxWidth={70}
          side="left"
          className="p-6 bg-white overflow-y-auto border-r border-gray-200"
        >
          <div className="space-y-6">
            {/* Field Columns */}
            {sentence.fieldMapping && Object.entries(sentence.fieldMapping).map(([num, name]) => {
              const value = sentence[`field${num}` as keyof Sentence] as string | null
              if (!value) return null
              
              return (
                <div key={num}>
                  <h2 className="text-sm font-semibold text-indigo-700 mb-3">
                    {formatFieldName(name)}
                  </h2>
                  <div className="p-5 bg-indigo-50/30 border border-indigo-100 rounded-lg">
                    <p className="text-gray-900 whitespace-pre-wrap leading-relaxed text-[15px]">
                      {value}
                    </p>
                  </div>
                </div>
              )
            })}
            
            {/* Support Columns */}
            {sentence.supportMapping && Object.keys(sentence.supportMapping).length > 0 && (
              <div className="pt-6 border-t border-gray-200">
                <h2 className="text-base font-semibold text-gray-900 mb-4">
                  Support Information
                </h2>
                <div className="space-y-4">
                  {Object.entries(sentence.supportMapping).map(([num, name]) => {
                    const value = sentence[`support${num}` as keyof Sentence] as string | null
                    if (!value) return null
                    
                    return (
                      <div key={num}>
                        <h3 className="text-xs font-semibold text-indigo-600 mb-2">
                          {formatFieldName(name)}
                        </h3>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                          {value}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </ResizablePanel>

        {/* Right Panel - Taxonomy */}
        <div className="flex-1 bg-white relative flex flex-col overflow-hidden">
          {/* Taxonomy Browser */}
          <TaxonomyBrowser
            taxonomy={taxonomy}
            selectedLabels={selectedLabels}
            onLabelsChange={setSelectedLabels}
          />

          {/* Sticky Action Buttons */}
          <div className="p-4 bg-white">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => {
                  loadComments()
                  setShowCommentDialog(true)
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  hasComment 
                    ? 'bg-green-200 text-green-800 hover:bg-green-300' 
                    : 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200'
                }`}
                title="Add Comment (C)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span className="text-sm font-medium">Comment</span>
                <span className="text-xs bg-white px-1 rounded">C</span>
              </button>
              <button
                onClick={handleFlag}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  sentence.flagged 
                    ? 'bg-red-200 text-red-800 hover:bg-red-300' 
                    : 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200'
                }`}
                title="Flag/Unflag (F)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                </svg>
                <span className="text-sm font-medium">Flag</span>
                <span className="text-xs bg-white px-1 rounded">F</span>
              </button>
              <button
                onClick={handleUnknown}
                className="flex items-center gap-2 px-3 py-2 bg-indigo-100 text-indigo-800 hover:bg-indigo-200 rounded-lg transition-colors"
                title="Unknown (U)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-medium">Unknown</span>
                <span className="text-xs bg-white px-1 rounded">U</span>
              </button>
              <button
                onClick={handleSkip}
                className="flex items-center gap-2 px-3 py-2 bg-indigo-100 text-indigo-800 hover:bg-indigo-200 rounded-lg transition-colors"
                title="Skip (S)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
                <span className="text-sm font-medium">Skip</span>
                <span className="text-xs bg-white px-1 rounded">S</span>
              </button>
              <button
                onClick={handleSubmit}
                disabled={!hasLeafOrUnknown}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ml-auto ${
                  hasLeafOrUnknown 
                    ? 'bg-indigo-500 text-white hover:bg-indigo-600' 
                    : 'bg-indigo-100 text-indigo-400 cursor-not-allowed'
                }`}
                title="Submit (Enter)"
              >
                <span className="text-sm font-medium">Submit</span>
                <div className={`flex items-center justify-center w-5 h-5 rounded text-xs ${
                  hasLeafOrUnknown ? 'bg-indigo-400' : 'bg-white'
                }`}>
                  ↵
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Comment Dialog */}
      {showCommentDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-[32rem] max-h-[80vh] flex flex-col">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Comments</h3>
            
            {/* Existing Comments */}
            {existingComments.length > 0 && (
              <div className="mb-4 space-y-3 max-h-60 overflow-y-auto">
                {existingComments.map((c) => (
                  <div key={c.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-start justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700">
                        {c.author.name || 'Unknown'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(c.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-900 whitespace-pre-wrap">{c.body}</p>
                  </div>
                ))}
              </div>
            )}
            
            {/* New Comment Input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Add new comment:
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Enter your comment..."
                className="w-full p-3 border border-gray-300 rounded-md h-24 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCommentDialog(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!comment.trim()) {
                    setShowCommentDialog(false)
                    return
                  }
                  try {
                    const res = await fetch(`/api/sentences/${sentenceId}/comments`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ body: comment })
                    })
                    if (res.ok) {
                      setHasComment(true)
                      setComment('')
                      await loadComments()
                    } else {
                      console.error('Failed to save comment')
                      alert('Failed to save comment. Please try again.')
                    }
                  } catch (error) {
                    console.error('Failed to save comment:', error)
                    alert('Failed to save comment. Please try again.')
                  }
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}





