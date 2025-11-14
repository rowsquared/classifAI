"use client"
import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
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
    nodeDefinition?: string | null
    isLeaf?: boolean
    taxonomy: { key: string }
  }>
  _count?: { comments: number }
}

export default function LabelingPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const sentenceId = params.sentenceId as string
  
  // Get navigation list from URL params (reactive to URL changes)
  const { sentenceIds, currentIndex } = useMemo(() => {
    const listParam = searchParams.get('list')
    const indexParam = searchParams.get('index')
    const ids = listParam ? listParam.split(',') : []
    let idx = indexParam ? parseInt(indexParam, 10) : -1
    
    // Verify that the currentIndex matches the sentenceId (in case URL was manually changed)
    if (ids.length > 0 && idx >= 0 && idx < ids.length) {
      if (ids[idx] !== sentenceId) {
        // Find the correct index
        const correctIndex = ids.indexOf(sentenceId)
        if (correctIndex >= 0) {
          idx = correctIndex
        }
      }
    }
    
    return { sentenceIds: ids, currentIndex: idx }
  }, [searchParams, sentenceId])
  
  const [sentence, setSentence] = useState<Sentence | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedLabels, setSelectedLabels] = useState<SelectedLabel[]>([])
  const [comment, setComment] = useState('')
  const [showCommentDialog, setShowCommentDialog] = useState(false)
  const [hasComment, setHasComment] = useState(false)
  const [showResolvedComments, setShowResolvedComments] = useState(false)
  const [hasResolvedComments, setHasResolvedComments] = useState(false)
  const [existingComments, setExistingComments] = useState<Array<{
    id: string
    body: string
    createdAt: string
    resolved: boolean
    resolvedAt: string | null
    author: { name: string | null }
  }>>([])
  const [taxonomies, setTaxonomies] = useState<Taxonomy[]>([])
  const [activeTaxonomyIndex, setActiveTaxonomyIndex] = useState(0)
  const [completedTaxonomies, setCompletedTaxonomies] = useState<Set<string>>(new Set())
  const [labelingStartedAt] = useState<Date>(new Date()) // Record when user opened this sentence
  const [currentTaxonomyLevel, setCurrentTaxonomyLevel] = useState(1) // Current level being viewed in TaxonomyBrowser

  // Get active taxonomy
  const activeTaxonomy = taxonomies[activeTaxonomyIndex] || null

  // Helper function to calculate completed taxonomies from annotations
  // Since the frontend only allows submission when a leaf/unknown is selected,
  // if annotations exist for a taxonomy, we can assume they are complete
  const calculateCompletedTaxonomies = (annotations: any[], taxonomiesList: Taxonomy[]) => {
    const completed = new Set<string>()
    taxonomiesList.forEach(tax => {
      const taxAnnotations = annotations.filter((ann: any) => ann.taxonomy.key === tax.key)
      // If annotations exist, they must be complete (leaf or unknown) because
      // the frontend submit button only enables in those cases
      if (taxAnnotations.length > 0) {
        completed.add(tax.key)
      }
    })
    return completed
  }

  // Load all active taxonomies
  useEffect(() => {
    const loadTaxonomies = async () => {
      try {
        const res = await fetch('/api/taxonomies/active')
        if (!res.ok) throw new Error('Failed to fetch taxonomies')
        const data = await res.json()
        if (data.ok && data.taxonomies.length > 0) {
          const loadedTaxonomies = data.taxonomies.map((t: any) => ({
            key: t.key,
            displayName: t.displayName,
            maxDepth: t.maxDepth || 5,
            levelNames: t.levelNames
          }))
          setTaxonomies(loadedTaxonomies)
          setActiveTaxonomyIndex(0) // Start with first taxonomy
        }
      } catch (error) {
        console.error('Failed to load taxonomies:', error)
      }
    }
    loadTaxonomies()
  }, [])

  // Load sentence data (can load in parallel with taxonomies)
  useEffect(() => {
    if (!sentenceId) return
    const loadSentence = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/sentences/${sentenceId}`)
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`)
        }
        const data = await res.json()
        setSentence(data)
        
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
  }, [sentenceId])

  // Initialize selected labels when both sentence and active taxonomy are available
  useEffect(() => {
    if (sentence?.annotations && activeTaxonomy) {
      const labels: SelectedLabel[] = sentence.annotations
        .filter((ann: any) => ann.taxonomy.key === activeTaxonomy.key)
        .map((ann: any) => ({
          level: ann.level,
          nodeCode: ann.nodeCode,
          taxonomyKey: ann.taxonomy.key,
          label: ann.nodeLabel || '',
          definition: ann.nodeDefinition || undefined,
          isLeaf: ann.isLeaf || false
        }))
      setSelectedLabels(labels)
    }
  }, [sentence, activeTaxonomy?.key])

  // Recalculate completed taxonomies whenever sentence annotations or taxonomies change
  useEffect(() => {
    if (sentence?.annotations && taxonomies.length > 0) {
      const completed = calculateCompletedTaxonomies(sentence.annotations, taxonomies)
      setCompletedTaxonomies(completed)
    }
  }, [sentence, taxonomies])

  // Load existing comments
  const loadComments = async (includeResolved = showResolvedComments) => {
    try {
      const res = await fetch(`/api/sentences/${sentenceId}/comments?includeResolved=${includeResolved ? 'true' : 'false'}`)
      if (res.ok) {
        const data = await res.json()
        setExistingComments(data.comments || [])
        setHasResolvedComments(Boolean(data.hasResolved))
        const hasUnresolved = (data.comments || []).some((c: any) => !c.resolved)
        setHasComment(hasUnresolved)
      }
    } catch (error) {
      console.error('Failed to load comments:', error)
    }
  }

  const toggleShowResolvedComments = async () => {
    const nextValue = !showResolvedComments
    setShowResolvedComments(nextValue)
    await loadComments(nextValue)
  }

  const handleResolveComment = async (commentId: string, resolved: boolean) => {
    try {
      const res = await fetch(`/api/sentences/${sentenceId}/comments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId, resolved })
      })
      if (!res.ok) {
        console.error('Failed to update comment')
        alert('Failed to update comment. Please try again.')
        return
      }
      await loadComments(showResolvedComments)
    } catch (error) {
      console.error('Failed to update comment:', error)
      alert('Failed to update comment. Please try again.')
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    try {
      const res = await fetch(`/api/sentences/${sentenceId}/comments`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId })
      })
      if (!res.ok) {
        console.error('Failed to delete comment')
        alert('Failed to delete comment. Please try again.')
        return
      }
      await loadComments(showResolvedComments)
    } catch (error) {
      console.error('Failed to delete comment:', error)
      alert('Failed to delete comment. Please try again.')
    }
  }

  // Check if we have a leaf or unknown selected
  const hasLeafOrUnknown = selectedLabels.some(l => l.isLeaf || l.nodeCode === -99)

  // Handle Unknown
  const handleUnknown = () => {
    // Mark current level as unknown, preserving lower level labels
    if (!activeTaxonomy) return
    
    // Keep labels at levels below the current level
    const lowerLevelLabels = selectedLabels.filter(l => 
      l.taxonomyKey === activeTaxonomy.key && l.level < currentTaxonomyLevel
    )
    
    // Add unknown at the current level
    const unknownLabel: SelectedLabel = {
      level: currentTaxonomyLevel,
      nodeCode: -99,
      taxonomyKey: activeTaxonomy.key,
      label: 'Unknown',
      isLeaf: true
    }
    
    // Combine: lower levels + unknown at current level
    setSelectedLabels([...lowerLevelLabels, unknownLabel])
  }
  
  // Handle taxonomy tab change
  const handleTaxonomyTabChange = (index: number) => {
    if (index < 0 || index >= taxonomies.length) return
    setActiveTaxonomyIndex(index)
    setCurrentTaxonomyLevel(1) // Reset to level 1 when switching taxonomies
    
    // Load selected labels for the new taxonomy
    if (sentence && taxonomies[index]) {
      const labels: SelectedLabel[] = sentence.annotations
        .filter((ann: any) => ann.taxonomy.key === taxonomies[index].key)
        .map((ann: any) => ({
          level: ann.level,
          nodeCode: ann.nodeCode,
          taxonomyKey: ann.taxonomy.key,
          label: ann.nodeLabel || '',
          definition: ann.nodeDefinition || undefined,
          isLeaf: ann.isLeaf || false
        }))
      setSelectedLabels(labels)
    } else {
      setSelectedLabels([])
    }
  }

  // Navigate to a sentence in the list
  const navigateToSentence = (targetIndex: number) => {
    if (sentenceIds.length === 0 || targetIndex < 0 || targetIndex >= sentenceIds.length) {
      // No list or out of bounds, go back to queue
      router.push('/queue')
      return
    }
    
    const targetId = sentenceIds[targetIndex]
    const params = new URLSearchParams()
    params.set('list', sentenceIds.join(','))
    params.set('index', targetIndex.toString())
    router.push(`/queue/${targetId}?${params.toString()}`)
  }

  // Navigate to previous sentence in the list
  const handlePrevious = () => {
    if (currentIndex > 0) {
      navigateToSentence(currentIndex - 1)
    }
  }

  // Navigate to next sentence in the list
  const handleNext = () => {
    if (currentIndex >= 0 && currentIndex < sentenceIds.length - 1) {
      navigateToSentence(currentIndex + 1)
    } else {
      // End of list, go back to queue
      router.push('/queue')
    }
  }

  // Get next sentence ID from the list (for Submit/Skip)
  const getNextSentenceId = (): string | null => {
    if (sentenceIds.length === 0 || currentIndex < 0) {
      return null
    }
    if (currentIndex < sentenceIds.length - 1) {
      return sentenceIds[currentIndex + 1]
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
        // Navigate to next sentence in the list
        const nextId = getNextSentenceId()
        if (nextId && currentIndex >= 0) {
          navigateToSentence(currentIndex + 1)
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
    if (!hasLeafOrUnknown || !activeTaxonomy) {
      alert('Please select a complete path or mark as unknown')
      return
    }

    try {
      // Prepare annotations (including unknown as -99)
      const annotations = selectedLabels.map(l => ({ 
        level: l.level, 
        nodeCode: l.nodeCode, // -99 for unknown
        taxonomyKey: activeTaxonomy.key
      }))

      const res = await fetch(`/api/sentences/${sentenceId}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'submitted', // Will be updated to 'pending' if not all taxonomies done
          annotations,
          flagged: sentence?.flagged,
          labelingStartedAt: labelingStartedAt.toISOString()
        })
      })

      if (res.ok) {
        const responseData = await res.json()
        
        // Update sentence status from response (avoid full reload)
        if (sentence) {
          setSentence({ ...sentence, status: responseData.status })
        }
        
        // Update completed taxonomies from response
        if (responseData.completedTaxonomies) {
          setCompletedTaxonomies(new Set(responseData.completedTaxonomies))
        }
        
        // Check if all taxonomies are completed
        const allCompleted = responseData.allCompleted || false
        
        if (allCompleted) {
          // All taxonomies done, move to next sentence in the list
          const nextId = getNextSentenceId()
          if (nextId && currentIndex >= 0) {
            navigateToSentence(currentIndex + 1)
          } else {
            // No more sentences, go back to queue
            router.push('/queue')
          }
        } else {
          // Move to next taxonomy tab
          const nextIndex = activeTaxonomyIndex + 1
          if (nextIndex < taxonomies.length) {
            handleTaxonomyTabChange(nextIndex)
          } else {
            // All taxonomies done, move to next sentence in the list
            const nextId = getNextSentenceId()
            if (nextId && currentIndex >= 0) {
              navigateToSentence(currentIndex + 1)
            } else {
              router.push('/queue')
            }
          }
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
          loadComments(showResolvedComments)
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
  }, [selectedLabels, sentence, showResolvedComments])

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

  if (taxonomies.length === 0) {
    return (
      <>
        <PageHeader title="Labeling" />
        <div className="flex items-center justify-center h-screen">
          <div className="text-red-600">No active taxonomies found</div>
        </div>
      </>
    )
  }
  
  // Calculate progress
  const completedCount = completedTaxonomies.size
  const totalCount = taxonomies.length
  const progressText = `${completedCount}/${totalCount} taxonomies completed`

  // Get tab colors based on taxonomy index (matches TaxonomyBrowser)
  const getTabColors = (index: number) => {
    const colors = [
      { active: 'text-indigo-600', checkmark: 'text-indigo-600' },  // Index 0: Primary/Teal
      { active: 'text-purple-600', checkmark: 'text-purple-600' },  // Index 1: Purple
      { active: 'text-pink-600', checkmark: 'text-pink-600' },      // Index 2: Pink
      { active: 'text-rose-600', checkmark: 'text-rose-600' },      // Index 3: Rose
      { active: 'text-orange-600', checkmark: 'text-orange-600' },   // Index 4: Orange
    ]
    return colors[index % colors.length] || colors[0]
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
          storageKey="labeling-left-panel-width"
          className="bg-white border-r border-gray-200 relative flex flex-col"
        >
          <div className="flex-1 overflow-y-auto p-6">
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
          </div>

          {/* Navigation Buttons - Bottom Right */}
          <div className="p-4 flex justify-end gap-2 bg-white">
            <button
              onClick={handlePrevious}
              className="p-2 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
              title="Previous sentence"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={handleNext}
              className="p-2 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
              title="Next sentence"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </ResizablePanel>

        {/* Right Panel - Taxonomy */}
        <div className="flex-1 bg-white relative flex flex-col overflow-hidden">
          {/* Taxonomy Tabs */}
          {taxonomies.length > 1 && (
            <div className="border-b border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between px-4 py-2">
                <div className="flex gap-1">
                  {taxonomies.map((tax, index) => {
                    const tabColors = getTabColors(index)
                    return (
                      <button
                        key={tax.key}
                        onClick={() => handleTaxonomyTabChange(index)}
                        className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors relative ${
                          activeTaxonomyIndex === index
                            ? `bg-white ${tabColors.active} border-t border-l border-r border-gray-200`
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                        }`}
                      >
                        {tax.key}
                        {completedTaxonomies.has(tax.key) && (
                          <span className={`ml-2 ${tabColors.checkmark}`}>✓</span>
                        )}
                      </button>
                    )
                  })}
                </div>
                <div className="text-xs text-gray-600 font-medium">
                  {progressText}
                </div>
              </div>
            </div>
          )}
          
          {/* Taxonomy Browser */}
          {activeTaxonomy && (
            <TaxonomyBrowser
              key={activeTaxonomy.key} // Force remount when taxonomy changes to reset navigation state
              taxonomy={activeTaxonomy}
              selectedLabels={selectedLabels}
              onLabelsChange={setSelectedLabels}
              taxonomyIndex={activeTaxonomyIndex}
              onCurrentLevelChange={setCurrentTaxonomyLevel}
            />
          )}

          {/* Sticky Action Buttons */}
          <div className="p-4 bg-white">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => {
                  loadComments(showResolvedComments)
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
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  sentence?.status === 'skipped'
                    ? 'bg-yellow-200 text-yellow-800 hover:bg-yellow-300'
                    : 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200'
                }`}
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
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Comments</h3>
              <button
                onClick={() => setShowCommentDialog(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Existing comments</span>
              <button
                onClick={toggleShowResolvedComments}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                {showResolvedComments ? 'Hide resolved' : 'Show resolved'}
              </button>
            </div>
            {!showResolvedComments && hasResolvedComments && (
              <p className="text-xs text-gray-500 mb-3">
                Resolved comments are hidden. Click &quot;Show resolved&quot; to view them.
              </p>
            )}

            {existingComments.length > 0 ? (
              <div className="mb-4 space-y-3 max-h-60 overflow-y-auto pr-1">
                {existingComments.map((c) => (
                  <div
                    key={c.id}
                    className={`p-3 rounded-lg border ${
                      c.resolved
                        ? 'bg-gray-100 border-gray-300 opacity-80'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <div>
                        <span className="text-xs font-medium text-gray-700">
                          {c.author.name || 'Unknown'}
                        </span>
                        {c.resolved && (
                          <span className="ml-2 text-xs font-semibold text-green-600">
                            Resolved
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(c.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-900 whitespace-pre-wrap">{c.body}</p>
                    <div className="flex justify-end gap-2 mt-3">
                      <button
                        onClick={() => handleResolveComment(c.id, !c.resolved)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                          c.resolved
                            ? 'border-indigo-200 text-indigo-600 hover:bg-indigo-50'
                            : 'border-green-200 text-green-700 hover:bg-green-50'
                        }`}
                      >
                        {c.resolved ? 'Reopen' : 'Mark resolved'}
                      </button>
                      <button
                        onClick={() => handleDeleteComment(c.id)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-700 hover:bg-red-50 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 mb-4">
                {showResolvedComments ? 'No comments found.' : 'No unresolved comments yet.'}
              </p>
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
                Close
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
                      await loadComments(showResolvedComments)
                      setShowCommentDialog(false)
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





