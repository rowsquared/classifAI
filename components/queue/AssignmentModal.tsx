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
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchUsers()
  }, [])

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
    } finally {
      setLoading(false)
    }
  }

  const handleToggleUser = (userId: string) => {
    const newSet = new Set(selectedUserIds)
    if (newSet.has(userId)) {
      newSet.delete(userId)
    } else {
      newSet.add(userId)
    }
    setSelectedUserIds(newSet)
  }

  const handleSelectAll = () => {
    if (selectedUserIds.size === users.length) {
      setSelectedUserIds(new Set())
    } else {
      setSelectedUserIds(new Set(users.map(u => u.id)))
    }
  }

  const handleAssign = async () => {
    if (selectedUserIds.size === 0) {
      setError('Please select at least one user')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/sentences/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sentenceIds,
          userIds: Array.from(selectedUserIds)
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
            {/* Select All */}
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-200">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedUserIds.size === assignableUsers.length && assignableUsers.length > 0}
                  onChange={handleSelectAll}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer"
                />
                <span className="text-sm font-medium text-gray-700">
                  Select All ({assignableUsers.length} users)
                </span>
              </label>
              {selectedUserIds.size > 0 && (
                <span className="text-sm text-gray-600">
                  {selectedUserIds.size} selected
                </span>
              )}
            </div>

            {/* User List */}
            <div className="flex-1 overflow-y-auto space-y-2">
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
                      type="checkbox"
                      checked={selectedUserIds.has(user.id)}
                      onChange={() => handleToggleUser(user.id)}
                      className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer"
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
                disabled={submitting || selectedUserIds.size === 0}
                className="flex-1 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {submitting ? 'Assigning...' : `Assign to ${selectedUserIds.size} ${selectedUserIds.size === 1 ? 'User' : 'Users'}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

