import './App.css'

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
