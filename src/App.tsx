import { useEffect, useState, type FormEvent } from 'react'
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
  const [isSignedIn, setIsSignedIn] = useState(hasStoredTokens)
  const [isProcessingSignIn, setIsProcessingSignIn] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [email, setEmail] = useState('')

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const code = searchParams.get('code')

    if (!code) {
      return
    }

    setIsProcessingSignIn(true)

    void exchangeAuthorizationCode(code, searchParams.get('state'))
      .then(() => {
        setIsSignedIn(true)
        removeOAuthParameters()
      })
      .catch((error: unknown) => {
        setAuthError(
          error instanceof Error ? error.message : 'Sign-in could not be completed.',
        )
      })
      .finally(() => {
        setIsProcessingSignIn(false)
      })
  }, [])

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAuthError(null)

    const normalizedEmail = email.trim()

    if (!normalizedEmail) {
      setAuthError('Enter your email address to continue.')
      return
    }

    setIsProcessingSignIn(true)

    try {
      await beginSignIn(normalizedEmail)
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Sign-in could not be started.',
      )
      setIsProcessingSignIn(false)
    }
  }

  if (!isSignedIn) {
    return (
      <main className="login-page">
        <section className="login-card" aria-labelledby="login-heading">
          <div className="login-brand">
            <span className="brand-mark login-brand-mark" aria-hidden="true">
              A
            </span>
            <span className="brand-name">AutoBook</span>
          </div>

          <div className="login-heading-block">
            <h1 id="login-heading">Sign in to AutoBook</h1>
            <p>Enter your email to continue to your weekly schedule.</p>
          </div>

          <form className="login-form" onSubmit={handleSignIn}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              disabled={isProcessingSignIn}
              onChange={(event) => setEmail(event.target.value)}
            />

            {authError && (
              <p className="auth-error" role="alert">
                {authError}
              </p>
            )}

            <button type="submit" disabled={isProcessingSignIn}>
              {isProcessingSignIn ? 'Signing you in…' : 'Continue with email'}
            </button>
          </form>
        </section>
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
