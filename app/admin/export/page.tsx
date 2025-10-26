"use client"
import { useState } from 'react'
import PageHeader from '@/components/PageHeader'

export default function ExportAdminPage() {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleExport = async () => {
    try {
      const res = await fetch('/api/export')
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `export-${new Date().toISOString()}.csv`
        a.click()
        setMessage({ type: 'success', text: 'Export downloaded successfully!' })
      } else {
        setMessage({ type: 'error', text: 'Export failed' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Export failed' })
    }
  }

  return (
    <>
      <PageHeader title="Export Data" />
      <div className="px-8 py-8">
        <div className="mb-8">
          <p className="text-sm text-gray-600">
            Export labeled sentences with annotations
          </p>
        </div>

        {/* Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' 
              ? 'bg-green-50 text-green-800 border border-green-200' 
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* Export Data */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">📥</span>
            <h2 className="text-lg font-semibold text-gray-900">Export Labeled Data</h2>
          </div>
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status Filter
                </label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">All</option>
                  <option value="submitted">Submitted Only</option>
                  <option value="pending">Pending Only</option>
                  <option value="skipped">Skipped Only</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date Range
                </label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">Last 7 Days</option>
                  <option value="month">Last 30 Days</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleExport}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              Export CSV
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Export Format</h3>
            <p className="text-xs text-gray-600">
              The exported CSV will include: sentence ID, all field columns, annotations (taxonomy code, level), 
              status, comments, flags, editor, and timestamps.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

