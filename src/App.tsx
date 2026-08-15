import { useEffect, useState } from 'react'
import './App.css'
import {
  beginSignIn,
  exchangeAuthorizationCode,
  hasStoredTokens,
  removeOAuthParameters,
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

function App() {
  const [isSignedIn, setIsSignedIn] = useState(
    () =>
      hasStoredTokens() &&
      !new URLSearchParams(window.location.search).has('code'),
  )
  const [authError, setAuthError] = useState<string | null>(null)

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
        </div>
      </header>

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
              <button type="button">Add class</button>
            </article>
          ))}
        </section>
      </main>
    </div>
  )
}

export default App
