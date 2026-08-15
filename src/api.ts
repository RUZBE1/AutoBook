import { getStoredAccessToken } from './auth'

const LEISURE_CENTRE_SETTINGS_URL =
  'https://iojgrjmve9.execute-api.eu-west-2.amazonaws.com/settings/leisure-centre'
const CLASSES_URL =
  'https://iojgrjmve9.execute-api.eu-west-2.amazonaws.com/classes'

export class SettingsApiError extends Error {}
export class ClassesApiError extends Error {}

export interface LeisureClass {
  activityInstanceId: string
  className: string
  time: string
  session: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]

    if (typeof value === 'string') {
      return value
    }
  }

  return null
}

function normalizeClass(value: unknown): LeisureClass | null {
  if (!isRecord(value)) {
    return null
  }

  const rawId = value.id
  const activityInstanceId =
    typeof rawId === 'string' || typeof rawId === 'number'
      ? String(rawId)
      : null
  const className = getString(value, ['name'])
  const time = getString(value, ['time'])
  const session = getString(value, ['session'])

  if (!activityInstanceId || !className || !time || !session) {
    return null
  }

  return { activityInstanceId, className, time, session }
}

async function getValidationMessage(response: Response) {
  try {
    const body = (await response.json()) as unknown

    if (typeof body === 'object' && body !== null) {
      if ('message' in body && typeof body.message === 'string') {
        return body.message
      }

      if ('error' in body && typeof body.error === 'string') {
        return body.error
      }
    }
  } catch {
    // The response did not contain a JSON validation message.
  }

  return 'Check the username and password and try again.'
}

export async function saveLeisureCentreCredentials(
  username: string,
  password: string,
) {
  const accessToken = getStoredAccessToken()

  if (!accessToken) {
    throw new SettingsApiError('Your session has expired. Please sign in again.')
  }

  let response: Response

  try {
    response = await fetch(LEISURE_CENTRE_SETTINGS_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ username, password }),
    })
  } catch {
    throw new SettingsApiError('Unable to save credentials')
  }

  if (response.status === 200) {
    return
  }

  if (response.status === 400) {
    throw new SettingsApiError(await getValidationMessage(response))
  }

  if (response.status === 401) {
    throw new SettingsApiError('Your session has expired. Please sign in again.')
  }

  throw new SettingsApiError('Unable to save credentials')
}

export async function getClasses(date: string, signal?: AbortSignal) {
  const accessToken = getStoredAccessToken()

  if (!accessToken) {
    throw new ClassesApiError('Your session has expired. Please sign in again.')
  }

  const url = new URL(CLASSES_URL)
  url.searchParams.set('date', date)

  let response: Response

  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    throw new ClassesApiError('Unable to get classes.')
  }

  if (response.status === 401) {
    throw new ClassesApiError('Your session has expired. Please sign in again.')
  }

  if (!response.ok) {
    throw new ClassesApiError('Unable to get classes.')
  }

  let body: unknown

  try {
    body = await response.json()
  } catch {
    throw new ClassesApiError('Unable to get classes.')
  }

  if (!isRecord(body) || !Array.isArray(body.classes)) {
    throw new ClassesApiError('Unable to get classes.')
  }

  return body.classes
    .map(normalizeClass)
    .filter((classItem): classItem is LeisureClass => classItem !== null)
    .sort((first, second) =>
      first.time.localeCompare(second.time, undefined, { numeric: true }),
    )
}
