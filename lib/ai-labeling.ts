const API_URL = process.env.AI_LABELING_API_URL
const API_KEY = process.env.AI_LABELING_API_KEY

export function ensureAIConfig() {
  if (!API_URL || !API_KEY) {
    throw new Error('AI labeling service is not configured. Please set AI_LABELING_API_URL and AI_LABELING_API_KEY.')
  }
}

export async function callAILabelingEndpoint<T = any>(path: string, payload: unknown): Promise<T> {
  ensureAIConfig()

  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`AI labeling API error (${res.status}): ${text || res.statusText}`)
  }

  return res.json() as Promise<T>
}

