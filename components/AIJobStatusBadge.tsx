'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, CheckCircle2, XCircle, Clock, X } from 'lucide-react'
import Link from 'next/link'

type AIJob = {
  id: string
  type: 'labeling' | 'learning' | 'taxonomy_sync' | 'external_training'
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  taxonomy: string
  totalSentences?: number
  processedSentences?: number
  failedSentences?: number
  recordCount?: number
  fileName?: string
  startedAt: string
  createdBy?: {
    id: string
    name: string | null
    email: string
  }
}

type QueuedJob = {
  id: string // taxonomy key as temporary ID
  status: 'pending'
  totalSentences: number
  processedSentences: number
  failedSentences: number
  startedAt: string
  taxonomy: {
    key: string
  }
  isQueued: true // Flag to indicate this is a queued job, not in DB yet
}

export default function AIJobStatusBadge() {
  const { data: session } = useSession()
  const [activeJobs, setActiveJobs] = useState<AIJob[]>([])
  const [queuedJobs, setQueuedJobs] = useState<QueuedJob[]>([])
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Track if popup is open to suppress toasts
  useEffect(() => {
    if (showDropdown) {
      sessionStorage.setItem('aiJobsPopupOpen', 'true')
    } else {
      sessionStorage.removeItem('aiJobsPopupOpen')
    }
  }, [showDropdown])

  const isAdmin = session?.user && session.user.role === 'admin'

  // Get current session ID to filter jobs
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [sessionJobIds, setSessionJobIds] = useState<Set<string>>(new Set())

  // Load and update session tracking
  useEffect(() => {
    const updateSessionTracking = () => {
      const sessionId = sessionStorage.getItem('currentAISessionId')
      const sessionJobs = JSON.parse(sessionStorage.getItem('aiSessionJobs') || '[]')
      if (sessionId) {
        // Only update if session ID actually changed
        setCurrentSessionId(prev => prev === sessionId ? prev : sessionId)
        const jobIds = new Set(sessionJobs
          .filter((sj: any) => sj.sessionId === sessionId)
          .map((sj: any) => sj.jobId))
        // Only update if job IDs actually changed
        setSessionJobIds(prev => {
          const prevArray = Array.from(prev).sort()
          const newArray = Array.from(jobIds).sort()
          if (prevArray.length !== newArray.length) return jobIds
          if (prevArray.some((id, i) => id !== newArray[i])) return jobIds
          return prev // No change, return previous to avoid re-render
        })
      } else {
        // If no session ID in storage, clear session-related state only
        // Don't clear activeJobs/queuedJobs here - they may contain non-session jobs (taxonomy sync, etc.)
        // Only update if state actually changed
        setCurrentSessionId(prev => prev === null ? prev : null)
        setSessionJobIds(prev => {
          if (prev.size === 0) return prev // Already empty, no change
          return new Set()
        })
        // Only clear queued jobs (these are session-specific)
        setQueuedJobs(prev => {
          // Only clear if they were session-based queued jobs
          const hasSessionQueued = prev.some(job => 'isQueued' in job && job.isQueued)
          return hasSessionQueued ? [] : prev
        })
      }
    }

    updateSessionTracking()
    // Also update when storage changes (e.g., when new jobs are added)
    // Increase interval to reduce flashing - check every 2 seconds instead of 1
    const interval = setInterval(updateSessionTracking, 2000)
    return () => clearInterval(interval)
  }, [])

  // Poll for active jobs across all types (only if admin)
  useEffect(() => {
    if (!isAdmin) return

    const fetchActiveJobs = async () => {
      try {
        // Only set loading on the very first load to avoid flashing
        if (isInitialLoad) {
          setLoading(true)
        }
        
        // Fetch all active jobs from the unified endpoint
        try {
          const res = await fetch('/api/ai-jobs/active')
          if (res.ok) {
            const data = await res.json()
            if (data.ok && data.jobs) {
              // Filter to only show active jobs (pending/processing)
              const active = data.jobs.filter((job: AIJob) => 
                job.status === 'pending' || job.status === 'processing'
              )
              // Only update if there's a meaningful change to avoid unnecessary re-renders
              setActiveJobs(prev => {
                // Check if the job list actually changed
                const prevIds = new Set(prev.map(j => j.id))
                const newIds = new Set(active.map(j => j.id))
                const idsChanged = prevIds.size !== newIds.size || 
                  [...prevIds].some(id => !newIds.has(id)) ||
                  [...newIds].some(id => !prevIds.has(id))
                
                // Also check if any job status changed
                const statusChanged = prev.some(pJob => {
                  const nJob = active.find(a => a.id === pJob.id)
                  return nJob && nJob.status !== pJob.status
                })
                
                // Only update if something actually changed
                if (idsChanged || statusChanged) {
                  return active
                }
                return prev // Return previous to avoid re-render
              })
            } else {
              // Only clear if we had jobs before
              setActiveJobs(prev => prev.length > 0 ? [] : prev)
            }
          } else if (res.status === 401) {
            // User is not authorized (not admin), silently ignore
            setActiveJobs([])
          } else {
            // Only clear if we had jobs before
            setActiveJobs(prev => prev.length > 0 ? [] : prev)
          }
        } catch (fetchError) {
          // Handle fetch errors for the /api/ai-jobs/active endpoint
          if (fetchError instanceof TypeError && fetchError.message === 'Failed to fetch') {
            setActiveJobs([])
          } else {
            console.error('Failed to fetch active jobs:', fetchError)
          }
        }
        
        // Also check for session-based queued jobs (for labeling from queue page)
        const sessionJobIdsArray = Array.from(sessionJobIds)
        if (sessionJobIdsArray.length > 0) {
          // Fetch specific labeling jobs by ID for session tracking
          const jobsPromises = sessionJobIdsArray.map(jobId => 
            fetch(`/api/ai-labeling/jobs/${jobId}`).then(res => res.ok ? res.json() : null).catch(() => null)
          )
          const jobResults = await Promise.all(jobsPromises)
          const sessionJobs = jobResults
            .filter(result => result?.ok && result.job)
            .map(result => ({
              ...result.job,
              type: 'labeling' as const,
              taxonomy: result.job.taxonomy.key
            }))
            .filter((job: AIJob) => 
              job.status === 'pending' || 
              job.status === 'processing'
            )
          // Merge session jobs with active jobs (avoid duplicates)
          setActiveJobs(prev => {
            const existingIds = new Set(prev.map(j => j.id))
            const newSessionJobs = sessionJobs.filter((j: AIJob) => !existingIds.has(j.id))
            if (newSessionJobs.length === 0) {
              return prev // No new jobs, return previous to avoid re-render
            }
            return [...prev, ...newSessionJobs]
          })
        }
      } catch (error) {
        // Silently handle network errors - don't spam console
        // Only log if it's not a network error (which is common during development)
        if (error instanceof TypeError && error.message === 'Failed to fetch') {
          // Network error - likely server is down or endpoint doesn't exist
          // Silently clear jobs
          setActiveJobs([])
        } else {
          console.error('Failed to fetch active jobs:', error)
        }
      } finally {
        if (isInitialLoad) {
          setLoading(false)
          setIsInitialLoad(false)
        }
      }
    }

    const updateQueuedJobs = () => {
      try {
        const queueStatusStr = sessionStorage.getItem('aiQueueStatus')
        const sessionId = sessionStorage.getItem('currentAISessionId')
        if (queueStatusStr && sessionId) {
          const queueStatus = JSON.parse(queueStatusStr) as { current: string | null; remaining: string[]; sessionId?: string }
          // Only show queued jobs from current session
          if (queueStatus.sessionId === sessionId) {
            // Create queued job entries for remaining taxonomies
            const queued: QueuedJob[] = queueStatus.remaining.map((taxonomyKey, index) => ({
              id: `queued-${taxonomyKey}`,
              status: 'pending' as const,
              totalSentences: 0, // We don't know this until job is created
              processedSentences: 0,
              failedSentences: 0,
              startedAt: new Date().toISOString(),
              taxonomy: { key: taxonomyKey },
              isQueued: true
            }))
            // Only update if the queue actually changed
            setQueuedJobs(prev => {
              const prevKeys = new Set(prev.filter(j => 'isQueued' in j && j.isQueued).map(j => j.taxonomy.key))
              const newKeys = new Set(queued.map(j => j.taxonomy.key))
              const changed = prevKeys.size !== newKeys.size || 
                [...prevKeys].some(k => !newKeys.has(k)) ||
                [...newKeys].some(k => !prevKeys.has(k))
              return changed ? queued : prev
            })
          } else {
            // Only clear session-based queued jobs
            setQueuedJobs(prev => prev.filter(j => !('isQueued' in j && j.isQueued)))
          }
        } else {
          // Only clear session-based queued jobs
          setQueuedJobs(prev => prev.filter(j => !('isQueued' in j && j.isQueued)))
        }
      } catch (error) {
        console.error('Failed to read queue status:', error)
        // Only clear session-based queued jobs on error
        setQueuedJobs(prev => prev.filter(j => !('isQueued' in j && j.isQueued)))
      }
    }

    fetchActiveJobs()
    updateQueuedJobs()
    const interval = setInterval(() => {
      fetchActiveJobs()
      updateQueuedJobs()
    }, 3000) // Poll every 3 seconds

    return () => clearInterval(interval)
  }, [isAdmin, sessionJobIds])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showDropdown])

  // Also include session-based queued jobs (for labeling from queue page)
  // Memoize to prevent unnecessary re-renders
  const sessionQueuedJobs = useMemo(() => {
    return queuedJobs.filter(job => {
      const queueStatusStr = sessionStorage.getItem('aiQueueStatus')
      if (queueStatusStr && currentSessionId) {
        const queueStatus = JSON.parse(queueStatusStr) as { sessionId?: string }
        return queueStatus.sessionId === currentSessionId
      }
      return false
    })
  }, [queuedJobs, currentSessionId])

  // Combine all active jobs and queued jobs for display
  // Memoize to prevent unnecessary re-renders
  const allJobs = useMemo(() => {
    if (!activeJobs || !sessionQueuedJobs) {
      return []
    }
    return [...activeJobs, ...sessionQueuedJobs] as (AIJob | QueuedJob)[]
  }, [activeJobs, sessionQueuedJobs])
  
  // Count total active jobs - memoize to prevent recalculation
  const totalJobCount = useMemo(() => allJobs.length, [allJobs])
  const activeCount = useMemo(() => {
    return allJobs.filter(job => 
      job.status === 'pending' || 
      job.status === 'processing' || 
      ('isQueued' in job && job.isQueued)
    ).length
  }, [allJobs])
  
  // Check if all jobs are completed - memoize to prevent recalculation
  const allCompleted = useMemo(() => {
    // If there are any active jobs, we're not done
    if (activeCount > 0) {
      return false
    }
    
    // Also check session queue status for labeling jobs
    if (currentSessionId) {
      try {
        const queueStatusStr = sessionStorage.getItem('aiQueueStatus')
        if (queueStatusStr) {
          const queueStatus = JSON.parse(queueStatusStr) as { current: string | null; remaining: string[]; sessionId?: string }
          if (queueStatus.sessionId === currentSessionId) {
            // If there are remaining jobs in queue, we're not done
            if (queueStatus.remaining.length > 0 || queueStatus.current !== null) {
              return false
            }
          }
        }
      } catch (error) {
        console.error('Error checking completion status:', error)
      }
    }
    
    // All jobs are done if no active jobs
    return activeCount === 0 && allJobs.length === 0
  }, [activeCount, currentSessionId, allJobs.length])

  // Auto-close popup when all jobs in session are completed (must be before early return)
  useEffect(() => {
    if (showDropdown && currentSessionId && allCompleted) {
      // Small delay to show final state before closing
      const timer = setTimeout(() => {
        setShowDropdown(false)
        // Clean up session tracking
        sessionStorage.removeItem('currentAISessionId')
        sessionStorage.removeItem('aiSessionJobs')
        sessionStorage.removeItem('aiQueueStatus')
        // Clear state to hide badge
        setCurrentSessionId(null)
        setSessionJobIds(new Set())
        setActiveJobs([])
        setQueuedJobs([])
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [showDropdown, allCompleted, currentSessionId])

  // Clean up session and hide button when all jobs are done (even if popup wasn't opened)
  useEffect(() => {
    if (currentSessionId && allCompleted) {
      // All jobs in session are completed, clean up
      sessionStorage.removeItem('currentAISessionId')
      sessionStorage.removeItem('aiSessionJobs')
      sessionStorage.removeItem('aiQueueStatus')
      // Clear state to hide badge
      setCurrentSessionId(null)
      setSessionJobIds(new Set())
      setActiveJobs([])
      setQueuedJobs([])
    }
  }, [currentSessionId, allCompleted])

  // Sort jobs by start time to maintain original order (oldest first)
  // This keeps jobs in the same position as they progress
  // Memoize to prevent unnecessary re-sorting
  // MUST be before any early returns to follow Rules of Hooks
  const sortedJobs = useMemo(() => {
    if (!allJobs || allJobs.length === 0) {
      return []
    }
    return [...allJobs].sort((a, b) => {
      const timeA = new Date(a.startedAt).getTime()
      const timeB = new Date(b.startedAt).getTime()
      return timeA - timeB
    })
  }, [allJobs])

  // Only show for admin users (early return after all hooks)
  if (!isAdmin) {
    return null
  }

  // Hide badge if no jobs at all (0 total jobs)
  if (totalJobCount === 0) {
    return null
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />
      case 'processing':
        return <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
      default:
        return <Clock className="w-4 h-4 text-gray-500" />
    }
  }

  const getProgress = (job: AIJob | QueuedJob) => {
    if ('isQueued' in job && job.isQueued) {
      return 0
    }
    if (job.type === 'external_training' || job.type === 'learning' || job.type === 'taxonomy_sync') {
      // These jobs don't have progress tracking, show as indeterminate
      return job.status === 'processing' ? 50 : 0
    }
    if (!job.totalSentences || job.totalSentences === 0) return 0
    return Math.round((job.processedSentences || 0) / job.totalSentences * 100)
  }

  const getJobTypeLabel = (job: AIJob | QueuedJob) => {
    if ('isQueued' in job && job.isQueued) {
      return 'Labeling'
    }
    if ('type' in job) {
      switch (job.type) {
        case 'labeling':
          return 'Labeling'
        case 'learning':
          return 'Learning'
        case 'taxonomy_sync':
          return 'Taxonomy Sync'
        case 'external_training':
          return 'External Training'
        default:
          return 'AI Job'
      }
    }
    return 'AI Job'
  }

  const getTaxonomyKey = (job: AIJob | QueuedJob): string => {
    if (typeof job.taxonomy === 'string') {
      return job.taxonomy
    }
    return job.taxonomy.key
  }

  const handleCancelJob = async (job: AIJob | QueuedJob) => {
    try {
      if ('isQueued' in job && job.isQueued) {
        // For queued jobs, update the sessionStorage to remove from queue
        const queueStatusStr = sessionStorage.getItem('aiQueueStatus')
        if (queueStatusStr) {
          const queueStatus = JSON.parse(queueStatusStr) as { current: string | null; remaining: string[] }
          const updatedRemaining = queueStatus.remaining.filter(key => key !== job.taxonomy)
          const updatedStatus = {
            ...queueStatus,
            remaining: updatedRemaining
          }
          sessionStorage.setItem('aiQueueStatus', JSON.stringify(updatedStatus))
          setQueuedJobs(prev => prev.filter(j => j.taxonomy.key !== job.taxonomy))
        }
      } else {
        // For actual jobs, cancel via unified API endpoint
        if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
          return // Can't cancel completed/failed/cancelled jobs
        }
        
        const res = await fetch(`/api/ai-jobs/${job.id}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: job.type })
        })
        
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to cancel job')
        }
        
        // Refresh jobs list
        const activeRes = await fetch('/api/ai-jobs/active')
        if (activeRes.ok) {
          const activeData = await activeRes.json()
          if (activeData.ok) {
            setActiveJobs(activeData.jobs || [])
          }
        }
      }
    } catch (error) {
      console.error('Failed to cancel AI job:', error)
      alert(error instanceof Error ? error.message : 'Failed to cancel job')
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative flex items-center gap-2 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="font-medium">{totalJobCount}</span>
        <span className="text-sm">AI job{totalJobCount !== 1 ? 's' : ''}</span>
      </button>

      {showDropdown && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-y-auto">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Active AI Jobs</h3>
              <Link
                href="/admin/ai-jobs"
                className="text-sm text-indigo-600 hover:text-indigo-700"
                onClick={() => setShowDropdown(false)}
              >
                View all
              </Link>
            </div>
          </div>
          <div className="p-2">
            {sortedJobs.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">No active jobs</div>
            ) : (
              <div className="space-y-2">
                {/* Display all jobs in original order */}
                {sortedJobs.map((job) => {
                  const progress = getProgress(job)
                  const isCompleted = job.status === 'completed' || job.status === 'failed'
                  const isQueued = 'isQueued' in job && job.isQueued
                  
                  return (
                    <div
                      key={job.id}
                      className={`p-3 rounded-lg border transition-colors ${
                        isCompleted 
                          ? 'border-gray-200 opacity-75' 
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {getStatusIcon(job.status)}
                            <span className="font-medium text-sm text-gray-900 truncate">
                              {getJobTypeLabel(job)}: {getTaxonomyKey(job)}
                            </span>
                          </div>
                          <div className={`text-xs ${isCompleted ? 'text-gray-500' : 'text-gray-600'}`}>
                            {isQueued ? (
                              `${job.totalSentences || 0} sentences queued`
                            ) : ('type' in job && job.type === 'external_training') ? (
                              `${job.recordCount || 0} records${job.fileName ? ` (${job.fileName})` : ''}`
                            ) : ('type' in job && (job.type === 'learning' || job.type === 'taxonomy_sync')) ? (
                              'Processing...'
                            ) : (
                              <>
                                {job.processedSentences || 0} / {job.totalSentences || 0} sentences
                                {(job.failedSentences || 0) > 0 && (
                                  <span className="text-red-600 ml-1">
                                    ({job.failedSentences} failed)
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!isCompleted && (
                            <span className="text-xs text-gray-600 whitespace-nowrap font-medium">
                              {progress}%
                            </span>
                          )}
                          {isCompleted && (
                            <span className="text-xs text-gray-500 whitespace-nowrap">
                              {job.status === 'completed' ? 'Done' : 'Failed'}
                            </span>
                          )}
                          {!isCompleted && (job.status === 'pending' || isQueued) && ('type' in job ? job.type === 'labeling' : true) && (
                            <button
                              onClick={() => handleCancelJob(job)}
                              className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                              title="Cancel job"
                            >
                              <X className="w-3 h-3" />
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                      {!isQueued && (
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all duration-300 ${
                              isCompleted
                                ? job.status === 'completed' 
                                  ? 'bg-green-500' 
                                  : 'bg-red-500'
                                : 'bg-indigo-500'
                            }`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

