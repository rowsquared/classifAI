import { cookies, headers } from 'next/headers'

function buildBaseUrl() {
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL
  }
  const headerStore = headers()
  const protocol = headerStore.get('x-forwarded-proto') ?? 'http'
  const host = headerStore.get('host') ?? 'localhost:3000'
  return `${protocol}://${host}`
}

function buildCookieHeader() {
  const cookieStore = cookies()
  const serialized = cookieStore.getAll().map(({ name, value }) => `${name}=${value}`).join('; ')
  return serialized || undefined
}

export async function serverFetchJSON<T>(
  path: string,
  init: RequestInit = {},
  { silent } = { silent: false }
): Promise<T | null> {
  const baseUrl = buildBaseUrl()
  const cookieHeader = buildCookieHeader()
  const headersInit: HeadersInit = {
    ...(init.headers || {}),
    ...(cookieHeader ? { Cookie: cookieHeader } : {})
  }

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: headersInit,
      cache: init.cache ?? 'no-store'
    })

    if (!res.ok) {
      if (!silent) {
        console.error(`serverFetchJSON ${path} failed:`, res.status, res.statusText)
      }
      return null
    }

    return res.json()
  } catch (error) {
    if (!silent) {
      console.error(`serverFetchJSON ${path} threw:`, error)
    }
    return null
  }
}

