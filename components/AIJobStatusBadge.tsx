'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react'
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

export default function AIJobStatusBadge() {
  const { data: session } = useSession()
  const [activeJobs, setActiveJobs] = useState<AIJob[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const isAdmin = session?.user && session.user.role === 'admin'

  // Poll for active jobs (only if admin)
  useEffect(() => {
    if (!isAdmin) return

    const fetchActiveJobs = async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/ai-labeling/jobs?status=pending&status=processing&limit=10')
        if (res.ok) {
          const data = await res.json()
          setActiveJobs(data.jobs || [])
        }
      } catch (error) {
        console.error('Failed to fetch active jobs:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchActiveJobs()
    const interval = setInterval(fetchActiveJobs, 5000) // Poll every 5 seconds

    return () => clearInterval(interval)
  }, [isAdmin])

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

  // Only show for admin users
  if (!isAdmin) {
    return null
  }

  const activeCount = activeJobs.length

  if (activeCount === 0) {
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

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative flex items-center gap-2 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="font-medium">{activeCount}</span>
        <span className="text-sm">AI job{activeCount !== 1 ? 's' : ''}</span>
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
            {activeJobs.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">No active jobs</div>
            ) : (
              <div className="space-y-2">
                {activeJobs.map((job) => {
                  const progress = getProgress(job)
                  return (
                    <div
                      key={job.id}
                      className="p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {getStatusIcon(job.status)}
                            <span className="font-medium text-sm text-gray-900 truncate">
                              {job.taxonomy.key}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500">
                            {job.processedSentences} / {job.totalSentences} sentences
                            {job.failedSentences > 0 && (
                              <span className="text-red-600 ml-1">
                                ({job.failedSentences} failed)
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          {progress}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
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

