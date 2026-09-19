import { getStoredAccessToken, recoverFromExpiredSession } from './auth'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '')

if (!API_BASE_URL) {
  throw new Error('VITE_API_BASE_URL is not configured.')
}

const LEISURE_CENTRE_SETTINGS_URL =
  `${API_BASE_URL}/settings/leisure-centre`
const CLASSES_URL = `${API_BASE_URL}/classes`
const SCHEDULE_URL = `${API_BASE_URL}/schedule`
const BOOKING_LOGS_URL = `${API_BASE_URL}/booking-logs`

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
export class BookingLogApiError extends Error {}

class AuthenticationExpiredError extends Error {}

async function authenticatedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const accessToken = getStoredAccessToken()

  if (!accessToken) {
    recoverFromExpiredSession()
    throw new AuthenticationExpiredError()
  }

  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${accessToken}`)

  const response = await fetch(input, { ...init, headers })

  if (response.status === 401) {
    recoverFromExpiredSession()
    throw new AuthenticationExpiredError()
  }

  return response
}

export interface LeisureClass {
  name: string
  time: string
  session: number
}

export interface ScheduleClass {
  className: string
  session: number
  backup?: {
    className: string
    session: number
  }
}

export type WeeklySchedule = Record<string, ScheduleClass[]>

export interface BookingLogEntry {
  bookingDate: string
  day: string
  priority: number
  className: string
  session: number
  classTime: string
  status: string
  failureReason?: string
  backup?: {
    className: string
    session: number
    classTime?: string
    status: string
    failureReason?: string
  }
}

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

  let backup: ScheduleClass['backup']

  if (Object.prototype.hasOwnProperty.call(value, 'backup')) {
    if (!isRecord(value.backup)) {
      return null
    }

    const backupClassName = value.backup.className
    const backupSession = value.backup.session

    if (
      typeof backupClassName !== 'string' ||
      typeof backupSession !== 'number' ||
      !Number.isFinite(backupSession)
    ) {
      return null
    }

    backup = {
      className: backupClassName,
      session: backupSession,
    }
  }

  return {
    className,
    session,
    ...(backup ? { backup } : {}),
  }
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

function normalizeBookingLogEntry(value: unknown): BookingLogEntry | null {
  if (!isRecord(value)) {
    return null
  }

  const {
    bookingDate,
    day,
    priority,
    className,
    session,
    classTime,
    status,
    failureReason,
  } = value

  if (
    typeof bookingDate !== 'string' ||
    typeof day !== 'string' ||
    typeof priority !== 'number' ||
    !Number.isInteger(priority) ||
    typeof className !== 'string' ||
    typeof session !== 'number' ||
    !Number.isFinite(session) ||
    typeof classTime !== 'string' ||
    typeof status !== 'string'
  ) {
    return null
  }

  let backup: BookingLogEntry['backup']

  if (isRecord(value.backup)) {
    const backupClassName = value.backup.className
    const backupSession = value.backup.session
    const backupClassTime = value.backup.classTime
    const backupStatus = value.backup.status
    const backupFailureReason = value.backup.failureReason

    if (
      typeof backupClassName === 'string' &&
      typeof backupSession === 'number' &&
      Number.isFinite(backupSession) &&
      typeof backupStatus === 'string'
    ) {
      backup = {
        className: backupClassName,
        session: backupSession,
        ...(typeof backupClassTime === 'string'
          ? { classTime: backupClassTime }
          : {}),
        status: backupStatus,
        ...(typeof backupFailureReason === 'string'
          ? { failureReason: backupFailureReason }
          : {}),
      }
    }
  }

  return {
    bookingDate,
    day,
    priority,
    className,
    session,
    classTime,
    status,
    ...(typeof failureReason === 'string' ? { failureReason } : {}),
    ...(backup ? { backup } : {}),
  }
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
  let response: Response

  try {
    response = await authenticatedFetch(LEISURE_CENTRE_SETTINGS_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    })
  } catch (error) {
    if (error instanceof AuthenticationExpiredError) {
      throw new SettingsApiError('Your session has expired. Please sign in again.')
    }

    throw new SettingsApiError('Unable to save credentials')
  }

  if (response.status === 200) {
    return
  }

  if (response.status === 400) {
    throw new SettingsApiError(await getValidationMessage(response))
  }

  throw new SettingsApiError('Unable to save credentials')
}

export async function getClasses(date: string, signal?: AbortSignal) {
  const url = new URL(CLASSES_URL)
  url.searchParams.set('date', date)

  let response: Response

  try {
    response = await authenticatedFetch(url, {
      method: 'GET',
      signal,
    })
  } catch (error) {
    if (error instanceof AuthenticationExpiredError) {
      throw new ClassesApiError('Your session has expired. Please sign in again.')
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    throw new ClassesApiError('Unable to get classes.')
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
  let response: Response

  try {
    response = await authenticatedFetch(SCHEDULE_URL, {
      method: 'GET',
    })
  } catch (error) {
    if (error instanceof AuthenticationExpiredError) {
      throw new ScheduleApiError('Your session has expired. Please sign in again.')
    }

    throw new ScheduleApiError('Unable to load schedule.')
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
  let response: Response

  try {
    response = await authenticatedFetch(SCHEDULE_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ day, classes }),
    })
  } catch (error) {
    if (error instanceof AuthenticationExpiredError) {
      throw new ScheduleApiError('Your session has expired. Please sign in again.')
    }

    throw new ScheduleApiError('Unable to save schedule.')
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

export async function getBookingLogs() {
  let response: Response

  try {
    response = await authenticatedFetch(BOOKING_LOGS_URL, {
      method: 'GET',
    })
  } catch (error) {
    if (error instanceof AuthenticationExpiredError) {
      throw new BookingLogApiError(
        'Your session has expired. Please sign in again.',
      )
    }

    throw new BookingLogApiError('Unable to load booking log.')
  }

  if (!response.ok) {
    throw new BookingLogApiError('Unable to load booking log.')
  }

  let body: unknown

  try {
    body = await response.json()
  } catch {
    throw new BookingLogApiError('Unable to load booking log.')
  }

  if (!isRecord(body) || !Array.isArray(body.entries)) {
    throw new BookingLogApiError('Unable to load booking log.')
  }

  return body.entries
    .map(normalizeBookingLogEntry)
    .filter((entry): entry is BookingLogEntry => entry !== null)
}
