import {
  AI_JOB_POLL_INTERVAL_MS,
  AI_JOB_POLL_TIMEOUT_MS
} from '@/lib/constants'

const API_URL = process.env.AI_LABELING_API_URL
const API_KEY = process.env.AI_LABELING_API_KEY

export function ensureAIConfig() {
  if (!API_URL || !API_KEY) {
    throw new Error('AI labeling service is not configured. Please set AI_LABELING_API_URL and AI_LABELING_API_KEY.')
  }
}

async function requestAI<T = unknown>(path: string, options: RequestInit): Promise<T> {
  ensureAIConfig()

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`AI labeling API error (${res.status}): ${text || res.statusText}`)
  }

  return res.json() as Promise<T>
}

export async function callAILabelingEndpoint<T = unknown>(path: string, payload: unknown): Promise<T> {
  return requestAI<T>(path, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export type AIJobStatusResponse = {
  status?: string
  result?: unknown
  error?: string
  [key: string]: unknown
}

export type AIJobResult =
  | { success: true; data: AIJobStatusResponse }
  | { success: false; data?: AIJobStatusResponse; error: string }

export async function startAIJob(path: string, payload: unknown): Promise<string> {
  const response = await requestAI<{ job_id?: string; jobId?: string }>(path, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  const jobId = response.job_id || response.jobId
  if (!jobId) {
    throw new Error('AI job response did not include a job_id')
  }
  return jobId
}

export async function fetchAIJobStatus(statusPath: string): Promise<AIJobStatusResponse> {
  return requestAI<AIJobStatusResponse>(statusPath, { method: 'GET' })
}

export async function waitForAIJobResult(jobId: string, statusPath: string): Promise<AIJobResult> {
  const startedAt = Date.now()
  while (true) {
    try {
      const status = await fetchAIJobStatus(statusPath)
      const normalized = (status.status || '').toLowerCase()
      if (normalized === 'complete' || normalized === 'completed' || normalized === 'success') {
        return { success: true, data: status }
      }
      if (normalized === 'failed' || normalized === 'error') {
        return { success: false, data: status, error: status.error || 'AI job failed' }
      }
    } catch (error: unknown) {
      if (Date.now() - startedAt >= AI_JOB_POLL_TIMEOUT_MS) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage || `AI job ${jobId} failed` }
      }
      // continue polling after delay
    }

    if (Date.now() - startedAt >= AI_JOB_POLL_TIMEOUT_MS) {
      return { success: false, error: `AI job ${jobId} timed out after ${AI_JOB_POLL_TIMEOUT_MS}ms` }
    }

    await new Promise((resolve) => setTimeout(resolve, AI_JOB_POLL_INTERVAL_MS))
  }
}

export function monitorAIJob(
  jobId: string,
  statusPath: string,
  handler: (result: AIJobResult) => Promise<void> | void
) {
  waitForAIJobResult(jobId, statusPath)
    .then(handler)
    .catch(error => handler({ success: false, error: error instanceof Error ? error.message : String(error) }))
}

