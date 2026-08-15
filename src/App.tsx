import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import './App.css'
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

const availableClasses = [
  { id: 'spin-0700', time: '07:00', name: 'Spin' },
  { id: 'yoga-0930', time: '09:30', name: 'Yoga' },
  { id: 'body-pump-1800', time: '18:00', name: 'Body Pump' },
  { id: 'pilates-1930', time: '19:30', name: 'Pilates' },
]

type AppView = 'schedule' | 'settings'

interface AddClassModalProps {
  day: string
  onClose: () => void
}

function AddClassModal({ day, onClose }: AddClassModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [selectedClass, setSelectedClass] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()

    return () => {
      if (dialog?.open) {
        dialog.close()
      }
    }
  }, [])

  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) {
      onClose()
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
            <h2 id="class-dialog-title">Add class for {day}</h2>
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

        <div className="class-options" role="list" aria-label={`Classes for ${day}`}>
          {availableClasses.map((classOption) => {
            const isSelected = selectedClass === classOption.id

            return (
              <button
                className={`class-option${isSelected ? ' selected' : ''}`}
                type="button"
                role="listitem"
                aria-pressed={isSelected}
                key={classOption.id}
                onClick={() => setSelectedClass(classOption.id)}
              >
                <span className="class-time">{classOption.time}</span>
                <span>{classOption.name}</span>
                <span className="selection-indicator" aria-hidden="true">
                  {isSelected ? '✓' : ''}
                </span>
              </button>
            )
          })}
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
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

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

  const handleSaveCredentials = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSettingsMessage('Backend connection not configured yet')
    setPassword('')
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

          <section className="week-grid" aria-label="Weekly class schedule">
            {days.map((day) => (
              <article className="day-card" key={day}>
                <h2>{day}</h2>
                <p>No classes selected</p>
                <button type="button" onClick={() => setSelectedDay(day)}>
                  Add class
                </button>
              </article>
            ))}
          </section>
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
                onChange={(event) => setUsername(event.target.value)}
              />

              <label htmlFor="leisure-password">Password</label>
              <input
                id="leisure-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />

              <button type="submit">Save credentials</button>

              {settingsMessage && (
                <p className="settings-message" role="status">
                  {settingsMessage}
                </p>
              )}
            </form>
          </div>
        </main>
      )}

      {selectedDay && (
        <AddClassModal day={selectedDay} onClose={() => setSelectedDay(null)} />
      )}
    </div>
  )
}

export default App
