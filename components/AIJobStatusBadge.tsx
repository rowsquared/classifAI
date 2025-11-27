'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, CheckCircle2, XCircle, Clock, X } from 'lucide-react'
import Link from 'next/link'

type AIJob = {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  totalSentences: number
  processedSentences: number
  failedSentences: number
  startedAt: string
  taxonomy: {
    key: string
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
        setCurrentSessionId(sessionId)
        const jobIds = new Set(sessionJobs
          .filter((sj: any) => sj.sessionId === sessionId)
          .map((sj: any) => sj.jobId))
        setSessionJobIds(jobIds)
      } else {
        // If no session ID in storage, clear state
        setCurrentSessionId(null)
        setSessionJobIds(new Set())
        // Also clear jobs if no session
        setActiveJobs([])
        setQueuedJobs([])
      }
    }

    updateSessionTracking()
    // Also update when storage changes (e.g., when new jobs are added)
    const interval = setInterval(updateSessionTracking, 1000)
    return () => clearInterval(interval)
  }, [])

  // Poll for active jobs and check queue status (only if admin)
  useEffect(() => {
    if (!isAdmin) return

    const fetchActiveJobs = async () => {
      try {
        setLoading(true)
        // Fetch jobs that belong to current session
        const sessionJobIdsArray = Array.from(sessionJobIds)
        if (sessionJobIdsArray.length > 0) {
          // Fetch specific jobs by ID if we have session job IDs
          const jobsPromises = sessionJobIdsArray.map(jobId => 
            fetch(`/api/ai-labeling/jobs/${jobId}`).then(res => res.ok ? res.json() : null).catch(() => null)
          )
          const jobResults = await Promise.all(jobsPromises)
          const sessionJobs = jobResults
            .filter(result => result?.ok && result.job)
            .map(result => result.job)
            .filter((job: AIJob) => 
              job.status === 'pending' || 
              job.status === 'processing' || 
              job.status === 'completed' || 
              job.status === 'failed'
            )
          setActiveJobs(sessionJobs)
        } else {
          // No session jobs yet, don't show anything
          setActiveJobs([])
        }
      } catch (error) {
        console.error('Failed to fetch active jobs:', error)
      } finally {
        setLoading(false)
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
            setQueuedJobs(queued)
          } else {
            setQueuedJobs([])
          }
        } else {
          setQueuedJobs([])
        }
      } catch (error) {
        console.error('Failed to read queue status:', error)
        setQueuedJobs([])
      }
    }

    fetchActiveJobs()
    updateQueuedJobs()
    const interval = setInterval(() => {
      fetchActiveJobs()
      updateQueuedJobs()
    }, 2000) // Poll every 2 seconds for faster updates

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

  // Filter jobs to only show those from current session (calculate before early return)
  const sessionJobs = activeJobs.filter(job => sessionJobIds.has(job.id))
  const sessionQueuedJobs = queuedJobs.filter(job => {
    // Check if this queued job belongs to current session
    const queueStatusStr = sessionStorage.getItem('aiQueueStatus')
    if (queueStatusStr) {
      const queueStatus = JSON.parse(queueStatusStr) as { sessionId?: string }
      return queueStatus.sessionId === currentSessionId
    }
    return false
  })

  // Get total job count from session jobs (stored when jobs are created)
  // This is more reliable than queue status which might be cleared
  const getTotalJobCount = () => {
    try {
      // Get the count from session jobs - this is the source of truth
      const sessionJobsData = JSON.parse(sessionStorage.getItem('aiSessionJobs') || '[]')
      const sessionJobCount = sessionJobsData.filter((sj: any) => sj.sessionId === currentSessionId).length
      
      // Also check queue status for queued jobs not yet created
      const queueStatusStr = sessionStorage.getItem('aiQueueStatus')
      if (queueStatusStr && currentSessionId) {
        const queueStatus = JSON.parse(queueStatusStr) as { current: string | null; remaining: string[]; sessionId?: string }
        if (queueStatus.sessionId === currentSessionId) {
          // Count: session jobs (already created) + remaining (not yet created)
          return sessionJobCount + queueStatus.remaining.length
        }
      }
      
      // Fallback: use session job count or actual jobs count
      return sessionJobCount > 0 ? sessionJobCount : (sessionJobs.length + sessionQueuedJobs.length)
    } catch {
      return sessionJobs.length + sessionQueuedJobs.length
    }
  }

  // Combine session jobs and queued jobs for display
  const allJobs = [...sessionJobs, ...sessionQueuedJobs] as (AIJob | QueuedJob)[]
  // Count total jobs in session (for button display) - use queue status for accurate count
  const totalJobCount = getTotalJobCount()
  // Count active jobs (processing, pending, or queued) - for determining when all are done
  const activeCount = allJobs.filter(job => 
    job.status === 'pending' || 
    job.status === 'processing' || 
    ('isQueued' in job && job.isQueued)
  ).length
  
  // Check if all jobs are completed - need to check queue status, not just jobs
  // The queue status is the source of truth because jobs are created sequentially
  const checkAllCompleted = () => {
    if (!currentSessionId) return false
    
    try {
      const queueStatusStr = sessionStorage.getItem('aiQueueStatus')
      if (queueStatusStr) {
        const queueStatus = JSON.parse(queueStatusStr) as { current: string | null; remaining: string[]; sessionId?: string }
        if (queueStatus.sessionId === currentSessionId) {
          // All jobs are done when:
          // 1. No remaining jobs in queue (remaining.length === 0)
          // 2. No current job (current === null) OR current job is completed
          // 3. All actual jobs we know about are completed
          
          const hasRemainingJobs = queueStatus.remaining.length > 0
          const hasCurrentJob = queueStatus.current !== null
          
          // If there are remaining jobs, we're not done
          if (hasRemainingJobs) {
            return false
          }
          
          // If there's a current job, check if it's completed
          if (hasCurrentJob) {
            // Check if the current job is in our completed jobs
            const currentJobCompleted = sessionJobs.some(job => 
              job.taxonomy.key === queueStatus.current &&
              (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled')
            )
            if (!currentJobCompleted) {
              return false
            }
          }
          
          // All jobs in allJobs should be completed (no pending/processing/queued)
          const allJobsCompleted = allJobs.length > 0 && allJobs.every(job => 
            job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled'
          )
          
          // Only return true if no remaining jobs AND all known jobs are completed
          return !hasRemainingJobs && allJobsCompleted
        }
      }
    } catch (error) {
      console.error('Error checking completion status:', error)
    }
    
    // Fallback: if queue status doesn't exist, check session jobs from storage
    // This handles the case where queue status was cleared but jobs are still running
    try {
      const sessionJobsData = JSON.parse(sessionStorage.getItem('aiSessionJobs') || '[]')
      const sessionJobEntries = sessionJobsData.filter((sj: any) => sj.sessionId === currentSessionId)
      const expectedJobCount = sessionJobEntries.length
      
      if (expectedJobCount > 0) {
        // All session jobs must be completed AND we must have all expected jobs
        const allJobsCompleted = sessionJobs.every(job => 
          job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled'
        )
        // Only return true if we have all expected jobs completed
        // This prevents premature completion when only some jobs are done
        return allJobsCompleted && sessionJobs.length >= expectedJobCount
      }
    } catch {
      // If we can't check, be conservative and return false
    }
    
    // Final fallback: be conservative - if we can't verify, assume not done
    return false
  }
  
  const allCompleted = checkAllCompleted()

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

  // Only show for admin users (early return after all hooks)
  if (!isAdmin) {
    return null
  }

  // Hide badge if no current session (all jobs done and cleaned up)
  if (!currentSessionId) {
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

  const getProgress = (job: AIJob) => {
    if (job.totalSentences === 0) return 0
    return Math.round((job.processedSentences / job.totalSentences) * 100)
  }

  const handleCancelJob = async (jobId: string, taxonomyKey: string, isQueued: boolean = false) => {
    try {
      if (isQueued) {
        // For queued jobs, update the sessionStorage to remove from queue
        const queueStatusStr = sessionStorage.getItem('aiQueueStatus')
        if (queueStatusStr) {
          const queueStatus = JSON.parse(queueStatusStr) as { current: string | null; remaining: string[] }
          const updatedRemaining = queueStatus.remaining.filter(key => key !== taxonomyKey)
          const updatedStatus = {
            ...queueStatus,
            remaining: updatedRemaining
          }
          sessionStorage.setItem('aiQueueStatus', JSON.stringify(updatedStatus))
          setQueuedJobs(prev => prev.filter(job => job.taxonomy.key !== taxonomyKey))
        }
      } else {
        // For actual jobs, cancel via API
        const res = await fetch(`/api/ai-labeling/jobs/${jobId}/cancel`, {
          method: 'POST'
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to cancel job')
        }
        // Remove the cancelled job from the list
        setActiveJobs(prev => prev.filter(job => job.id !== jobId))
      }
    } catch (error) {
      console.error('Failed to cancel AI job:', error)
      alert(error instanceof Error ? error.message : 'Failed to cancel job')
    }
  }

  // Sort jobs by start time to maintain original order (oldest first)
  // This keeps jobs in the same position as they progress
  const sortedJobs = allJobs.sort((a, b) => {
    const timeA = new Date(a.startedAt).getTime()
    const timeB = new Date(b.startedAt).getTime()
    return timeA - timeB
  })

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
                              {job.taxonomy.key}
                            </span>
                          </div>
                          <div className={`text-xs ${isCompleted ? 'text-gray-500' : 'text-gray-600'}`}>
                            {isQueued ? (
                              `${job.totalSentences || 0} sentences queued`
                            ) : (
                              <>
                                {job.processedSentences} / {job.totalSentences} sentences
                                {job.failedSentences > 0 && (
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
                          {!isCompleted && (job.status === 'pending' || isQueued) && (
                            <button
                              onClick={() => handleCancelJob(job.id, job.taxonomy.key, isQueued)}
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

