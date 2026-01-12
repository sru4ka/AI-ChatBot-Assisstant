import { useState, useEffect } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase, Business } from './lib/supabase'
import Login from './components/Login'
import Dashboard from './components/Dashboard'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [business, setBusiness] = useState<Business | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        loadBusiness(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        loadBusiness(session.user.id)
      } else {
        setBusiness(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadBusiness(userId: string) {
    try {
      // Try to find existing business for this user
      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('id', userId)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading business:', error)
      }

      if (data) {
        setBusiness(data)
      } else {
        // Create a new business for this user
        const { data: newBusiness, error: createError } = await supabase
          .from('businesses')
          .insert({
            id: userId,
            name: 'My Business',
          })
          .select()
          .single()

        if (createError) {
          console.error('Error creating business:', createError)
        } else {
          setBusiness(newBusiness)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  function handleBusinessUpdate(updatedBusiness: Business) {
    setBusiness(updatedBusiness)
  }

  if (loading) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return <Login />
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Freshdesk AI Assistant</h1>
        <div>
          <span style={{ marginRight: '1rem' }}>{session.user.email}</span>
          <button onClick={handleSignOut}>Sign Out</button>
        </div>
      </header>
      <main className="main-content">
        {business && (
          <Dashboard
            business={business}
            onBusinessUpdate={handleBusinessUpdate}
          />
        )}
      </main>
    </div>
  )
}

export default App
