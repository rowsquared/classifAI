'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'

type User = {
  id: string
  name: string | null
  email: string
  role: 'admin' | 'supervisor' | 'labeller'
}

type AssignmentModalProps = {
  sentenceIds: string[]
  onClose: () => void
  onSuccess: () => void
}

export default function AssignmentModal({ sentenceIds, onClose, onSuccess }: AssignmentModalProps) {
  const { data: session } = useSession()
  const [users, setUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null) // Single user or null for unassign
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [loadingAssignments, setLoadingAssignments] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setLoadingAssignments(true)
      await Promise.all([fetchUsers(), fetchCurrentAssignments()])
      setLoading(false)
      setLoadingAssignments(false)
    }
    loadData()
  }, [sentenceIds])

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users')
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users)
      }
    } catch (error) {
      console.error('Failed to fetch users:', error)
      setError('Failed to load users')
    }
  }

  const fetchCurrentAssignments = async () => {
    try {
      // Fetch assignments for the first sentence to determine current assignment
      // For backwards compatibility, if multiple assignments exist, we'll use the first one
      if (sentenceIds.length === 0) return
      
      const res = await fetch(`/api/sentences/${sentenceIds[0]}`)
      if (res.ok) {
        const data = await res.json()
        // Get the first assignment if any exist (backwards compatible with multiple assignments)
        if (data.assignments && data.assignments.length > 0 && data.assignments[0].user?.id) {
          setSelectedUserId(data.assignments[0].user.id)
        } else {
          setSelectedUserId(null) // No assignment
        }
      }
    } catch (error) {
      console.error('Failed to fetch current assignments:', error)
      // Don't set error here, just proceed without pre-selection
    }
  }

  const handleAssign = async () => {
    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/sentences/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sentenceIds,
          userId: selectedUserId // Single userId or null to unassign
        })
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to assign sentences')
        setSubmitting(false)
        return
      }

      onSuccess()
      onClose()
    } catch (error) {
      console.error('Assignment error:', error)
      setError('An error occurred')
      setSubmitting(false)
    }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-indigo-100 text-indigo-700'
      case 'supervisor': return 'bg-indigo-100 text-indigo-700'
      case 'labeller': return 'bg-green-100 text-green-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  // Filter users based on role permissions
  const assignableUsers = session?.user?.role === 'admin' 
    ? users 
    : users.filter(u => {
        // Supervisors can only assign to themselves or their supervised users
        // This is a simplified filter - the API will do the full validation
        return u.role === 'labeller' || u.id === session?.user?.id
      })

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Assign Sentences</h2>
            <p className="text-sm text-gray-600 mt-1">
              Assign {sentenceIds.length} {sentenceIds.length === 1 ? 'sentence' : 'sentences'} to users
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="text-gray-500">Loading users...</div>
          </div>
        ) : (
          <>
            {/* Info text */}
            <div className="mb-3 pb-3 border-b border-gray-200">
              <p className="text-sm text-gray-600">
                Select one user to assign to, or choose "Unassign" to remove assignment
              </p>
            </div>

            {/* User List with Radio Buttons */}
            <div className="flex-1 overflow-y-auto space-y-2">
              {/* Unassign Option */}
              <label
                className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer border border-transparent hover:border-gray-200 transition-colors"
              >
                <input
                  type="radio"
                  name="assignment"
                  value=""
                  checked={selectedUserId === null}
                  onChange={() => setSelectedUserId(null)}
                  className="w-4 h-4 border-gray-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">
                      Unassign
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                      Remove assignment
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">No user will be assigned to these sentences</div>
                </div>
              </label>

              {assignableUsers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No users available for assignment
                </div>
              ) : (
                assignableUsers.map(user => (
                  <label
                    key={user.id}
                    className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer border border-transparent hover:border-gray-200 transition-colors"
                  >
                    <input
                      type="radio"
                      name="assignment"
                      value={user.id}
                      checked={selectedUserId === user.id}
                      onChange={() => setSelectedUserId(user.id)}
                      className="w-4 h-4 border-gray-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {user.name || 'Unnamed User'}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${getRoleBadgeColor(user.role)}`}>
                          {user.role}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 truncate">{user.email}</div>
                    </div>
                  </label>
                ))
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 mt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={submitting || loadingAssignments}
                className="flex-1 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {submitting 
                  ? 'Processing...' 
                  : selectedUserId === null 
                    ? 'Unassign' 
                    : `Assign to ${assignableUsers.find(u => u.id === selectedUserId)?.name || 'User'}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

