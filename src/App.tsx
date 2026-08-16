import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import './App.css'
import {
  ClassesApiError,
  getClasses,
  getSchedule,
  saveLeisureCentreCredentials,
  saveScheduleDay,
  ScheduleApiError,
  SettingsApiError,
  type LeisureClass,
  type ScheduleClass,
  type WeeklySchedule,
} from './api'
import {
  beginSignIn,
  exchangeAuthorizationCode,
  hasStoredTokens,
  removeOAuthParameters,
  signOut,
} from './auth'

const days = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

type AppView = 'schedule' | 'settings'
type SettingsMessage = { text: string; tone: 'success' | 'error' }
type SelectedDay = { day: string; date: string; fullDate: string }

function getClassIdentity(classItem: LeisureClass) {
  return JSON.stringify([classItem.name, classItem.time, classItem.session])
}

function getScheduleClassIdentity(classItem: ScheduleClass) {
  return JSON.stringify([classItem.className, classItem.session])
}

function createEmptySchedule(): WeeklySchedule {
  return Object.fromEntries(days.map((day) => [day, []]))
}

function formatOrdinal(value: number) {
  const remainder100 = Math.abs(value) % 100

  if (remainder100 >= 11 && remainder100 <= 13) {
    return `${value}th`
  }

  switch (Math.abs(value) % 10) {
    case 1:
      return `${value}st`
    case 2:
      return `${value}nd`
    case 3:
      return `${value}rd`
    default:
      return `${value}th`
  }
}

function getNextWeekday(day: string): SelectedDay {
  const targetDay = days.indexOf(day) + 1
  const today = new Date()
  let daysUntilTarget = (targetDay - today.getDay() + 7) % 7

  if (daysUntilTarget === 0) {
    daysUntilTarget = 7
  }

  const targetDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + daysUntilTarget,
  )
  const date = [
    targetDate.getFullYear(),
    String(targetDate.getMonth() + 1).padStart(2, '0'),
    String(targetDate.getDate()).padStart(2, '0'),
  ].join('-')
  const fullDate = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(targetDate)

  return { day, date, fullDate }
}

interface AddClassModalProps {
  selectedDay: SelectedDay
  savedClasses: ScheduleClass[]
  onAddSelected: (classes: LeisureClass[]) => Promise<void>
  onClose: () => void
}

function AddClassModal({
  selectedDay,
  savedClasses,
  onAddSelected,
  onClose,
}: AddClassModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const requestControllerRef = useRef<AbortController | null>(null)
  const [classes, setClasses] = useState<LeisureClass[]>([])
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(
    () => new Set(),
  )
  const [isLoading, setIsLoading] = useState(true)
  const [classesError, setClassesError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const loadClasses = useCallback(() => {
    requestControllerRef.current?.abort()
    const controller = new AbortController()
    requestControllerRef.current = controller

    setIsLoading(true)
    setClassesError(null)

    void getClasses(selectedDay.date, controller.signal)
      .then((classItems) => {
        setClasses(classItems)
        const savedClassKeys = new Set(savedClasses.map(getScheduleClassIdentity))
        setSelectedClasses(
          new Set(
            classItems
              .filter((classItem) =>
                savedClassKeys.has(
                  getScheduleClassIdentity({
                    className: classItem.name,
                    session: classItem.session,
                  }),
                ),
              )
              .map(getClassIdentity),
          ),
        )
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        setClassesError(
          error instanceof ClassesApiError
            ? error.message
            : 'Unable to get classes.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      })
  }, [savedClasses, selectedDay.date])

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    loadClasses()

    return () => {
      requestControllerRef.current?.abort()

      if (dialog?.open) {
        dialog.close()
      }
    }
  }, [loadClasses])

  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  const toggleClass = (classIdentity: string) => {
    setSelectedClasses((currentSelection) => {
      const nextSelection = new Set(currentSelection)

      if (nextSelection.has(classIdentity)) {
        nextSelection.delete(classIdentity)
      } else {
        nextSelection.add(classIdentity)
      }

      return nextSelection
    })
  }

  const handleClassKeyDown = (
    event: KeyboardEvent<HTMLTableRowElement>,
    classIdentity: string,
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleClass(classIdentity)
    }
  }

  const handleAddSelected = async () => {
    const selectedItems = classes.filter((classItem) =>
      selectedClasses.has(getClassIdentity(classItem)),
    )

    setIsSaving(true)
    setSaveError(null)

    try {
      await onAddSelected(selectedItems)
      onClose()
    } catch (error) {
      setSaveError(
        error instanceof ScheduleApiError
          ? error.message
          : 'Unable to save schedule.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="class-dialog"
      aria-labelledby="class-dialog-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={handleBackdropClick}
    >
      <div className="dialog-card">
        <div className="dialog-header">
          <div>
            <p className="eyebrow">Available classes</p>
            <h2 id="class-dialog-title">Add class for {selectedDay.day}</h2>
            <p className="dialog-date">{selectedDay.fullDate}</p>
          </div>
          <button
            className="dialog-close"
            type="button"
            aria-label="Close add class dialog"
            autoFocus
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="classes-content" aria-live="polite">
          {isLoading && <p className="classes-status">Getting classes...</p>}

          {!isLoading && classesError && (
            <div className="classes-status error" role="alert">
              <p>{classesError}</p>
              <button type="button" onClick={loadClasses}>
                Try again
              </button>
            </div>
          )}

          {!isLoading && !classesError && classes.length === 0 && (
            <p className="classes-status">No classes available.</p>
          )}

          {!isLoading && !classesError && classes.length > 0 && (
            <div className="classes-table-wrap">
              <table className="classes-table">
                <thead>
                  <tr>
                    <th scope="col">Class</th>
                    <th scope="col">Time</th>
                    <th scope="col">Session</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map((classItem) => {
                    const classIdentity = getClassIdentity(classItem)
                    const isSelected = selectedClasses.has(classIdentity)

                    return (
                      <tr
                        className={isSelected ? 'selected' : undefined}
                        aria-selected={isSelected}
                        tabIndex={0}
                        key={classIdentity}
                        onClick={() => toggleClass(classIdentity)}
                        onKeyDown={(event) =>
                          handleClassKeyDown(event, classIdentity)
                        }
                      >
                        <td>
                          <span className="row-selection" aria-hidden="true">
                            {isSelected ? '✓' : ''}
                          </span>
                          {classItem.name}
                        </td>
                        <td>{classItem.time}</td>
                        <td>{formatOrdinal(classItem.session)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="dialog-actions">
          {saveError && (
            <p className="dialog-save-error" role="alert">
              {saveError}
            </p>
          )}
          <button
            type="button"
            disabled={selectedClasses.size === 0 || isSaving}
            onClick={handleAddSelected}
          >
            {isSaving ? 'Saving...' : 'Add selected'}
          </button>
        </div>
      </div>
    </dialog>
  )
}

function App() {
  const [isSignedIn, setIsSignedIn] = useState(
    () =>
      hasStoredTokens() &&
      !new URLSearchParams(window.location.search).has('code'),
  )
  const [authError, setAuthError] = useState<string | null>(null)
  const [view, setView] = useState<AppView>('schedule')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [settingsMessage, setSettingsMessage] = useState<SettingsMessage | null>(
    null,
  )
  const [isSavingCredentials, setIsSavingCredentials] = useState(false)
  const [selectedDay, setSelectedDay] = useState<SelectedDay | null>(null)
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklySchedule>(
    createEmptySchedule,
  )
  const [isScheduleLoading, setIsScheduleLoading] = useState(true)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [savingDays, setSavingDays] = useState<Set<string>>(() => new Set())
  const hasLoadedSchedule = useRef(false)

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const code = searchParams.get('code')

    if (code) {
      void exchangeAuthorizationCode(code, searchParams.get('state'))
        .then(() => {
          setIsSignedIn(true)
          removeOAuthParameters()
        })
        .catch((error: unknown) => {
          setAuthError(
            error instanceof Error
              ? error.message
              : 'Sign-in could not be completed.',
          )
        })

      return
    }

    if (hasStoredTokens()) {
      return
    }

    void beginSignIn()
      .catch((error: unknown) => {
        setAuthError(
          error instanceof Error ? error.message : 'Sign-in could not be started.',
        )
      })
  }, [])

  useEffect(() => {
    if (!isSignedIn || hasLoadedSchedule.current) {
      return
    }

    hasLoadedSchedule.current = true
    setIsScheduleLoading(true)
    setScheduleError(null)

    void getSchedule()
      .then(setWeeklySchedule)
      .catch((error: unknown) => {
        setScheduleError(
          error instanceof ScheduleApiError
            ? error.message
            : 'Unable to load schedule.',
        )
      })
      .finally(() => {
        setIsScheduleLoading(false)
      })
  }, [isSignedIn])

  const handleSaveCredentials = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSettingsMessage(null)

    const normalizedUsername = username.trim()

    if (!normalizedUsername || !password.trim()) {
      setSettingsMessage({
        text: 'Enter both a username and password.',
        tone: 'error',
      })
      return
    }

    setIsSavingCredentials(true)

    try {
      await saveLeisureCentreCredentials(normalizedUsername, password)
      setSettingsMessage({ text: 'Credentials saved', tone: 'success' })
    } catch (error) {
      setSettingsMessage({
        text:
          error instanceof SettingsApiError
            ? error.message
            : 'Unable to save credentials',
        tone: 'error',
      })
    } finally {
      setPassword('')
      setIsSavingCredentials(false)
    }
  }

  const handleAddSelected = async (
    day: string,
    selectedClasses: LeisureClass[],
  ) => {
    if (savingDays.has(day)) {
      throw new ScheduleApiError('Unable to save schedule.')
    }

    const classesByKey = new Map(
      weeklySchedule[day].map((classItem) => [
        getScheduleClassIdentity(classItem),
        classItem,
      ]),
    )

    for (const classItem of selectedClasses) {
      const scheduleClass = {
        className: classItem.name,
        session: classItem.session,
      }
      classesByKey.set(getScheduleClassIdentity(scheduleClass), scheduleClass)
    }

    const candidateClasses = Array.from(classesByKey.values())
    setSavingDays((current) => new Set(current).add(day))

    try {
      const savedDay = await saveScheduleDay(day, candidateClasses)
      setWeeklySchedule((current) => ({
        ...current,
        [savedDay.day]: savedDay.classes,
      }))
    } finally {
      setSavingDays((current) => {
        const next = new Set(current)
        next.delete(day)
        return next
      })
    }
  }

  const handleRemoveClass = async (day: string, classToRemove: ScheduleClass) => {
    if (savingDays.has(day)) {
      return
    }

    const classKey = getScheduleClassIdentity(classToRemove)
    const candidateClasses = weeklySchedule[day].filter(
      (classItem) => getScheduleClassIdentity(classItem) !== classKey,
    )

    setSavingDays((current) => new Set(current).add(day))
    setScheduleError(null)

    try {
      const savedDay = await saveScheduleDay(day, candidateClasses)
      setWeeklySchedule((current) => ({
        ...current,
        [savedDay.day]: savedDay.classes,
      }))
    } catch (error) {
      setScheduleError(
        error instanceof ScheduleApiError
          ? error.message
          : 'Unable to save schedule.',
      )
    } finally {
      setSavingDays((current) => {
        const next = new Set(current)
        next.delete(day)
        return next
      })
    }
  }

  if (!isSignedIn) {
    return (
      <main className="loading-page">
        <p role={authError ? 'alert' : 'status'}>
          {authError ?? 'Loading AutoBook...'}
        </p>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-content">
          <span className="brand-mark" aria-hidden="true">
            A
          </span>
          <span className="brand-name">AutoBook</span>
          <nav className="header-nav" aria-label="Account navigation">
            <button type="button" onClick={() => setView('settings')}>
              Settings
            </button>
            <button type="button" onClick={signOut}>
              Sign out
            </button>
          </nav>
        </div>
      </header>

      {view === 'schedule' ? (
        <main className="main-content">
          <div className="title-block">
            <p className="eyebrow">Weekly schedule</p>
            <h1>Your Week</h1>
            <p className="subtitle">Build a simple plan for the week ahead.</p>
          </div>

          {isScheduleLoading ? (
            <p className="schedule-status" role="status">
              Loading schedule...
            </p>
          ) : (
            <>
              {scheduleError && (
                <p className="schedule-status error" role="alert">
                  {scheduleError}
                </p>
              )}
              <section className="week-grid" aria-label="Weekly class schedule">
                {days.map((day) => (
                  <article className="day-card" key={day}>
                    <h2>{day}</h2>
                    {weeklySchedule[day].length === 0 ? (
                      <p>No classes selected</p>
                    ) : (
                      <ul
                        className="schedule-class-list"
                        aria-label={`${day} classes`}
                      >
                        {weeklySchedule[day].map((classItem) => (
                          <li
                            className="schedule-class-row"
                            key={getScheduleClassIdentity(classItem)}
                          >
                            <span className="schedule-class-name">
                              {classItem.className}
                            </span>
                            <span>{formatOrdinal(classItem.session)}</span>
                            <button
                              className="remove-class-button"
                              type="button"
                              disabled={savingDays.has(day)}
                              aria-label={`Remove ${classItem.className} ${formatOrdinal(classItem.session)} session`}
                              onClick={() => handleRemoveClass(day, classItem)}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                                focusable="false"
                              >
                                <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-1 11H8L7 9Zm3 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z" />
                              </svg>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {savingDays.has(day) && (
                      <span className="day-saving-status" role="status">
                        Saving...
                      </span>
                    )}
                    <button
                      className="add-class-button"
                      type="button"
                      disabled={savingDays.has(day)}
                      onClick={() => setSelectedDay(getNextWeekday(day))}
                    >
                      Add class
                    </button>
                  </article>
                ))}
              </section>
            </>
          )}
        </main>
      ) : (
        <main className="main-content settings-view">
          <button
            className="back-button"
            type="button"
            onClick={() => setView('schedule')}
          >
            ← Back to your week
          </button>

          <div className="settings-panel">
            <div className="title-block">
              <p className="eyebrow">Settings</p>
              <h1>Leisure centre</h1>
              <p className="subtitle">
                Enter the account details used by your leisure centre.
              </p>
            </div>

            <form className="settings-form" onSubmit={handleSaveCredentials}>
              <label htmlFor="leisure-username">Username</label>
              <input
                id="leisure-username"
                type="text"
                autoComplete="username"
                value={username}
                disabled={isSavingCredentials}
                onChange={(event) => setUsername(event.target.value)}
              />

              <label htmlFor="leisure-password">Password</label>
              <input
                id="leisure-password"
                type="password"
                autoComplete="current-password"
                value={password}
                disabled={isSavingCredentials}
                onChange={(event) => setPassword(event.target.value)}
              />

              <button type="submit" disabled={isSavingCredentials}>
                {isSavingCredentials ? 'Saving...' : 'Save credentials'}
              </button>

              {settingsMessage && (
                <p
                  className={`settings-message ${settingsMessage.tone}`}
                  role={settingsMessage.tone === 'error' ? 'alert' : 'status'}
                >
                  {settingsMessage.text}
                </p>
              )}
            </form>
          </div>
        </main>
      )}

      {selectedDay && (
        <AddClassModal
          selectedDay={selectedDay}
          savedClasses={weeklySchedule[selectedDay.day]}
          onAddSelected={(classes) =>
            handleAddSelected(selectedDay.day, classes)
          }
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  )
}

export default App
