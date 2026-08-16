import { getStoredAccessToken } from './auth'

const LEISURE_CENTRE_SETTINGS_URL =
  'https://iojgrjmve9.execute-api.eu-west-2.amazonaws.com/settings/leisure-centre'
const CLASSES_URL =
  'https://iojgrjmve9.execute-api.eu-west-2.amazonaws.com/classes'
const SCHEDULE_URL =
  'https://iojgrjmve9.execute-api.eu-west-2.amazonaws.com/schedule'

const scheduleDays = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

export class SettingsApiError extends Error {}
export class ClassesApiError extends Error {}
export class ScheduleApiError extends Error {}

export interface LeisureClass {
  name: string
  time: string
  session: number
}

export interface ScheduleClass {
  className: string
  session: number
}

export type WeeklySchedule = Record<string, ScheduleClass[]>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeClass(value: unknown): LeisureClass | null {
  if (!isRecord(value)) {
    return null
  }

  const { name, time, session } = value

  if (
    typeof name !== 'string' ||
    typeof time !== 'string' ||
    typeof session !== 'number' ||
    !Number.isFinite(session)
  ) {
    return null
  }

  return { name, time, session }
}

function normalizeScheduleClass(value: unknown): ScheduleClass | null {
  if (!isRecord(value)) {
    return null
  }

  const { className, session } = value

  if (
    typeof className !== 'string' ||
    typeof session !== 'number' ||
    !Number.isFinite(session)
  ) {
    return null
  }

  return { className, session }
}

function parseScheduleClasses(value: unknown) {
  if (!Array.isArray(value)) {
    return null
  }

  const classes = value.map(normalizeScheduleClass)
  return classes.every((classItem) => classItem !== null)
    ? (classes as ScheduleClass[])
    : null
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

export async function getSchedule() {
  const accessToken = getStoredAccessToken()

  if (!accessToken) {
    throw new ScheduleApiError('Your session has expired. Please sign in again.')
  }

  let response: Response

  try {
    response = await fetch(SCHEDULE_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
  } catch {
    throw new ScheduleApiError('Unable to load schedule.')
  }

  if (response.status === 401) {
    throw new ScheduleApiError('Your session has expired. Please sign in again.')
  }

  if (!response.ok) {
    throw new ScheduleApiError('Unable to load schedule.')
  }

  let body: unknown

  try {
    body = await response.json()
  } catch {
    throw new ScheduleApiError('Unable to load schedule.')
  }

  if (!isRecord(body) || !isRecord(body.schedule)) {
    throw new ScheduleApiError('Unable to load schedule.')
  }

  const schedule: WeeklySchedule = {}

  for (const day of scheduleDays) {
    const classes = parseScheduleClasses(body.schedule[day])

    if (!classes) {
      throw new ScheduleApiError('Unable to load schedule.')
    }

    schedule[day] = classes
  }

  return schedule
}

export async function saveScheduleDay(day: string, classes: ScheduleClass[]) {
  const accessToken = getStoredAccessToken()

  if (!accessToken) {
    throw new ScheduleApiError('Your session has expired. Please sign in again.')
  }

  let response: Response

  try {
    response = await fetch(SCHEDULE_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ day, classes }),
    })
  } catch {
    throw new ScheduleApiError('Unable to save schedule.')
  }

  if (response.status === 401) {
    throw new ScheduleApiError('Your session has expired. Please sign in again.')
  }

  if (!response.ok) {
    throw new ScheduleApiError('Unable to save schedule.')
  }

  let body: unknown

  try {
    body = await response.json()
  } catch {
    throw new ScheduleApiError('Unable to save schedule.')
  }

  if (!isRecord(body) || typeof body.day !== 'string') {
    throw new ScheduleApiError('Unable to save schedule.')
  }

  const savedClasses = parseScheduleClasses(body.classes)

  if (!savedClasses) {
    throw new ScheduleApiError('Unable to save schedule.')
  }

  return { day: body.day, classes: savedClasses }
}
