import { useState, useEffect } from 'react'
import { signIn, signUp, signOut, getCurrentUser, generateReply, GenerateReplyResponse } from '../utils/api'
import { User } from '@supabase/supabase-js'

type Tab = 'main' | 'account'
type AuthMode = 'login' | 'signup'
type Tone = 'professional' | 'friendly' | 'concise'

interface TicketInfo {
  customerMessage: string
  ticketSubject?: string
}

export default function Popup() {
  const [activeTab, setActiveTab] = useState<Tab>('main')
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isOnFreshdesk, setIsOnFreshdesk] = useState(false)
  const [isOnTicket, setIsOnTicket] = useState(false)

  // Main tab state
  const [ticketInfo, setTicketInfo] = useState<TicketInfo | null>(null)
  const [tone, setTone] = useState<Tone>('professional')
  const [generatedReply, setGeneratedReply] = useState('')
  const [sources, setSources] = useState<GenerateReplyResponse['sources']>([])
  const [generating, setGenerating] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [inserting, setInserting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Auth state
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  useEffect(() => {
    init()
  }, [])

  async function init() {
    setLoading(true)
    try {
      const currentUser = await getCurrentUser()
      setUser(currentUser)

      // Check if on Freshdesk
      chrome.runtime.sendMessage({ type: 'CHECK_FRESHDESK' }, (response) => {
        setIsOnFreshdesk(response?.isOnFreshdesk || false)
        setIsOnTicket(response?.isOnTicket || false)
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) {
      setError('Please enter email and password')
      return
    }

    setAuthLoading(true)
    setError(null)

    try {
      const loggedInUser = await signIn(email, password)
      setUser(loggedInUser)
      setSuccess('Logged in successfully!')
      setActiveTab('main')
      setEmail('')
      setPassword('')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password || !businessName) {
      setError('Please fill in all fields')
      return
    }

    setAuthLoading(true)
    setError(null)

    try {
      const newUser = await signUp(email, password, businessName)
      setUser(newUser)
      setSuccess('Account created! You can now upload documents in the Admin Dashboard.')
      setActiveTab('main')
      setEmail('')
      setPassword('')
      setBusinessName('')
      setTimeout(() => setSuccess(null), 5000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed')
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleLogout() {
    try {
      await signOut()
      setUser(null)
      setSuccess('Logged out successfully')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Logout failed')
    }
  }

  async function handleScan() {
    setScanning(true)
    setError(null)
    setTicketInfo(null)
    setGeneratedReply('')
    setSources([])

    try {
      const response = await new Promise<{ success: boolean; customerMessage?: string; ticketSubject?: string; error?: string }>((resolve) => {
        chrome.runtime.sendMessage({ type: 'SCAN_TICKET' }, resolve)
      })

      if (!response.success) {
        throw new Error(response.error || 'Failed to scan ticket')
      }

      setTicketInfo({
        customerMessage: response.customerMessage!,
        ticketSubject: response.ticketSubject,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan ticket')
    } finally {
      setScanning(false)
    }
  }

  async function handleGenerate() {
    if (!ticketInfo?.customerMessage) return

    setGenerating(true)
    setError(null)

    try {
      const response = await generateReply(ticketInfo.customerMessage, tone)
      setGeneratedReply(response.reply)
      setSources(response.sources)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate reply')
    } finally {
      setGenerating(false)
    }
  }

  async function handleInsert() {
    if (!generatedReply) return

    setInserting(true)
    setError(null)

    try {
      const response = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        chrome.runtime.sendMessage({ type: 'INSERT_REPLY', payload: generatedReply }, resolve)
      })

      if (!response.success) {
        throw new Error(response.error || 'Failed to insert reply')
      }

      setSuccess('Reply inserted into Freshdesk!')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to insert reply')
    } finally {
      setInserting(false)
    }
  }

  if (loading) {
    return (
      <div className="popup">
        <header className="header">
          <h1>Freshdesk AI Assistant</h1>
        </header>
        <div className="content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <span className="spinner" style={{ width: 24, height: 24 }} />
        </div>
      </div>
    )
  }

  return (
    <div className="popup">
      <header className="header">
        <h1>Freshdesk AI Assistant</h1>
        <p>AI-powered reply suggestions</p>
      </header>

      <div className="tabs">
        <button className={`tab ${activeTab === 'main' ? 'active' : ''}`} onClick={() => setActiveTab('main')}>
          Generate Reply
        </button>
        <button className={`tab ${activeTab === 'account' ? 'active' : ''}`} onClick={() => setActiveTab('account')}>
          Account
        </button>
      </div>

      <div className="content">
        {error && <div className="status error">{error}</div>}
        {success && <div className="status success">{success}</div>}

        {activeTab === 'main' ? (
          <>
            {!user ? (
              <div className="status warning">
                Please log in to use this extension.
              </div>
            ) : !isOnFreshdesk ? (
              <div className="status info">
                Navigate to a Freshdesk ticket page to use this extension.
              </div>
            ) : !isOnTicket ? (
              <div className="status info">
                Open a specific ticket to scan and generate replies.
              </div>
            ) : (
              <>
                {/* Scan button */}
                <button
                  className="btn btn-primary"
                  onClick={handleScan}
                  disabled={scanning}
                  style={{ marginBottom: 16 }}
                >
                  {scanning && <span className="spinner" />}
                  {scanning ? 'Scanning...' : 'Scan Ticket'}
                </button>

                {/* Ticket info */}
                {ticketInfo && (
                  <>
                    <div className="ticket-info">
                      {ticketInfo.ticketSubject && (
                        <>
                          <h3>Subject</h3>
                          <div className="message" style={{ marginBottom: 8 }}>{ticketInfo.ticketSubject}</div>
                        </>
                      )}
                      <h3>Customer Message</h3>
                      <div className="message">{ticketInfo.customerMessage}</div>
                    </div>

                    {/* Tone selector */}
                    <div className="tone-selector">
                      {(['professional', 'friendly', 'concise'] as Tone[]).map((t) => (
                        <button
                          key={t}
                          className={`tone-btn ${tone === t ? 'active' : ''}`}
                          onClick={() => setTone(t)}
                        >
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                      ))}
                    </div>

                    {/* Generate button */}
                    <button
                      className="btn btn-primary"
                      onClick={handleGenerate}
                      disabled={generating}
                    >
                      {generating && <span className="spinner" />}
                      {generating ? 'Generating...' : 'Generate Reply'}
                    </button>
                  </>
                )}

                {/* Generated reply */}
                {generatedReply && (
                  <div className="reply-section">
                    <h3>Generated Reply</h3>
                    <textarea
                      className="reply-textarea"
                      value={generatedReply}
                      onChange={(e) => setGeneratedReply(e.target.value)}
                    />

                    <button
                      className="btn btn-success"
                      onClick={handleInsert}
                      disabled={inserting}
                    >
                      {inserting && <span className="spinner" />}
                      {inserting ? 'Inserting...' : 'Insert into Freshdesk'}
                    </button>

                    {/* Sources */}
                    {sources.length > 0 && (
                      <div className="sources">
                        <h4>Sources from Knowledge Base:</h4>
                        {sources.slice(0, 3).map((source, index) => (
                          <div key={index} className="source-item">
                            <span className="similarity">{source.similarity}%</span> {source.snippet}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          /* Account Tab */
          <div className="settings-form">
            {user ? (
              /* Logged in - show account info */
              <>
                <div className="account-info">
                  <p><strong>Logged in as:</strong></p>
                  <p>{user.email}</p>
                </div>

                <button
                  className="btn btn-secondary"
                  onClick={handleLogout}
                  style={{ marginTop: 16 }}
                >
                  Log Out
                </button>

                <div className="status info" style={{ marginTop: 16 }}>
                  Upload documents via the Admin Dashboard to improve AI responses.
                </div>
              </>
            ) : (
              /* Not logged in - show login/signup form */
              <>
                <div className="auth-toggle" style={{ display: 'flex', marginBottom: 16 }}>
                  <button
                    className={`tab ${authMode === 'login' ? 'active' : ''}`}
                    onClick={() => { setAuthMode('login'); setError(null) }}
                    style={{ flex: 1 }}
                  >
                    Log In
                  </button>
                  <button
                    className={`tab ${authMode === 'signup' ? 'active' : ''}`}
                    onClick={() => { setAuthMode('signup'); setError(null) }}
                    style={{ flex: 1 }}
                  >
                    Sign Up
                  </button>
                </div>

                <form onSubmit={authMode === 'login' ? handleLogin : handleSignUp}>
                  {authMode === 'signup' && (
                    <div className="form-group">
                      <label>Business/Store Name</label>
                      <input
                        type="text"
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder="Your company name"
                      />
                    </div>
                  )}

                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                    />
                  </div>

                  <div className="form-group">
                    <label>Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Your password"
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={authLoading}
                  >
                    {authLoading && <span className="spinner" />}
                    {authLoading ? (authMode === 'login' ? 'Logging in...' : 'Creating account...') : (authMode === 'login' ? 'Log In' : 'Create Account')}
                  </button>
                </form>
              </>
            )}
          </div>
        )}
      </div>

      <footer className="footer">
        <a href="#" onClick={(e) => { e.preventDefault(); window.open('https://github.com') }}>
          Need help?
        </a>
      </footer>
    </div>
  )
}
