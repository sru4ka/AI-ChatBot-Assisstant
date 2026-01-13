import { useState, useEffect } from 'react'
import { signIn, signUp, signOut, getCurrentUser, generateReply, GenerateReplyResponse } from '../utils/api'
import { User } from '@supabase/supabase-js'

type Tab = 'main' | 'account' | 'settings'
type AuthMode = 'login' | 'signup'
type Tone = 'professional' | 'friendly' | 'concise'

// Admin Dashboard URL
const ADMIN_DASHBOARD_URL = 'https://ai-chat-bot-assisstant.vercel.app'

interface TicketInfo {
  customerMessage: string
  ticketSubject?: string
}

interface StoredSettings {
  defaultTone: Tone
  autoScan: boolean
  signature: string
  customPrompt: string
}

const DEFAULT_SETTINGS: StoredSettings = {
  defaultTone: 'professional',
  autoScan: false,
  signature: '',
  customPrompt: '',
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

  // Settings state
  const [settings, setSettings] = useState<StoredSettings>(DEFAULT_SETTINGS)
  const [settingsSaved, setSettingsSaved] = useState(false)

  useEffect(() => {
    init()
    loadSettings()
    loadSavedState()
  }, [])

  // Save state when reply changes
  useEffect(() => {
    if (generatedReply || ticketInfo) {
      saveState()
    }
  }, [generatedReply, ticketInfo])

  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get(['freshdeskAiSettings'])
      if (result.freshdeskAiSettings) {
        const saved = result.freshdeskAiSettings as StoredSettings
        setSettings(saved)
        setTone(saved.defaultTone)
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
    }
  }

  async function loadSavedState() {
    try {
      const result = await chrome.storage.local.get(['freshdeskAiState'])
      if (result.freshdeskAiState) {
        const saved = result.freshdeskAiState
        if (saved.generatedReply) setGeneratedReply(saved.generatedReply)
        if (saved.ticketInfo) setTicketInfo(saved.ticketInfo)
        if (saved.sources) setSources(saved.sources)
      }
    } catch (err) {
      console.error('Failed to load saved state:', err)
    }
  }

  async function saveState() {
    try {
      await chrome.storage.local.set({
        freshdeskAiState: {
          generatedReply,
          ticketInfo,
          sources,
          savedAt: Date.now(),
        }
      })
    } catch (err) {
      console.error('Failed to save state:', err)
    }
  }

  async function clearState() {
    try {
      await chrome.storage.local.remove(['freshdeskAiState'])
      setGeneratedReply('')
      setTicketInfo(null)
      setSources([])
    } catch (err) {
      console.error('Failed to clear state:', err)
    }
  }

  async function saveSettings(newSettings: StoredSettings) {
    try {
      await chrome.storage.local.set({ freshdeskAiSettings: newSettings })
      setSettings(newSettings)
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 2000)
    } catch (err) {
      console.error('Failed to save settings:', err)
    }
  }

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
      const response = await generateReply(
        ticketInfo.customerMessage,
        tone,
        settings.customPrompt || undefined
      )
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
      // Append signature if set
      let finalReply = generatedReply
      if (settings.signature && settings.signature.trim()) {
        finalReply = generatedReply + '\n\n' + settings.signature
      }

      const response = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        chrome.runtime.sendMessage({ type: 'INSERT_REPLY', payload: finalReply }, resolve)
      })

      if (!response.success) {
        throw new Error(response.error || 'Failed to insert reply')
      }

      setSuccess('Reply inserted into Freshdesk!')
      clearState() // Clear saved state after successful insert
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to insert reply')
    } finally {
      setInserting(false)
    }
  }

  function openAdminDashboard() {
    window.open(ADMIN_DASHBOARD_URL, '_blank')
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
        <button className={`tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
          Settings
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
        ) : activeTab === 'settings' ? (
          /* Settings Tab */
          <div className="settings-form">
            <div className="setting-group">
              <label>Default Response Tone</label>
              <div className="tone-selector" style={{ marginTop: 8 }}>
                {(['professional', 'friendly', 'concise'] as Tone[]).map((t) => (
                  <button
                    key={t}
                    className={`tone-btn ${settings.defaultTone === t ? 'active' : ''}`}
                    onClick={() => {
                      const newSettings = { ...settings, defaultTone: t }
                      saveSettings(newSettings)
                      setTone(t)
                    }}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-group" style={{ marginTop: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.autoScan}
                  onChange={(e) => {
                    const newSettings = { ...settings, autoScan: e.target.checked }
                    saveSettings(newSettings)
                  }}
                  style={{ width: 18, height: 18 }}
                />
                Auto-scan ticket when opening popup
              </label>
            </div>

            {/* Signature Settings */}
            <div className="setting-group" style={{ marginTop: 20 }}>
              <label style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>Email Signature</label>
              <p style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
                This will be added to the end of every reply
              </p>
              <textarea
                value={settings.signature}
                onChange={(e) => {
                  const newSettings = { ...settings, signature: e.target.value }
                  saveSettings(newSettings)
                }}
                placeholder="Best regards,
John Doe
Support Team
www.example.com"
                style={{
                  width: '100%',
                  minHeight: 80,
                  padding: 8,
                  borderRadius: 6,
                  border: '1px solid #ddd',
                  fontSize: 12,
                  resize: 'vertical',
                }}
              />
            </div>

            {/* Custom AI Prompt */}
            <div className="setting-group" style={{ marginTop: 20 }}>
              <label style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>Custom AI Instructions</label>
              <p style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
                Add extra instructions for the AI (e.g., "Always mention our 30-day return policy")
              </p>
              <textarea
                value={settings.customPrompt}
                onChange={(e) => {
                  const newSettings = { ...settings, customPrompt: e.target.value }
                  saveSettings(newSettings)
                }}
                placeholder="Optional: Add custom instructions for the AI..."
                style={{
                  width: '100%',
                  minHeight: 60,
                  padding: 8,
                  borderRadius: 6,
                  border: '1px solid #ddd',
                  fontSize: 12,
                  resize: 'vertical',
                }}
              />
            </div>

            {settingsSaved && (
              <div className="status success" style={{ marginTop: 12 }}>
                Settings saved!
              </div>
            )}

            {/* Admin Dashboard Link */}
            <div className="admin-section" style={{ marginTop: 24, padding: 16, background: '#f5f5f5', borderRadius: 8 }}>
              <h3 style={{ marginBottom: 8, fontSize: 14 }}>Admin Dashboard</h3>
              <p style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
                Upload documents, configure integrations, and manage your knowledge base.
              </p>
              <button
                className="btn btn-secondary"
                onClick={openAdminDashboard}
                style={{ width: '100%' }}
              >
                Open Admin Dashboard
              </button>
            </div>

            {/* Quick Links */}
            <div className="quick-links" style={{ marginTop: 16 }}>
              <h4 style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Quick Links</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); openAdminDashboard() }}
                  style={{ fontSize: 13, color: '#667eea' }}
                >
                  📚 Manage Knowledge Base
                </a>
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); openAdminDashboard() }}
                  style={{ fontSize: 13, color: '#667eea' }}
                >
                  🧠 Learn from Past Tickets
                </a>
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); openAdminDashboard() }}
                  style={{ fontSize: 13, color: '#667eea' }}
                >
                  ⚙️ Configure Integrations
                </a>
              </div>
            </div>
          </div>
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

                {/* Admin Dashboard Link */}
                <div style={{ marginTop: 20, padding: 16, background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
                  <p style={{ fontSize: 13, marginBottom: 12, color: '#1a56db' }}>
                    <strong>Manage your AI assistant</strong>
                  </p>
                  <button
                    className="btn btn-primary"
                    onClick={openAdminDashboard}
                    style={{ width: '100%' }}
                  >
                    Open Admin Dashboard
                  </button>
                </div>

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
        <a href="#" onClick={(e) => { e.preventDefault(); openAdminDashboard() }}>
          Open Admin Dashboard
        </a>
        <span style={{ margin: '0 8px', color: '#ccc' }}>|</span>
        <a href="#" onClick={(e) => { e.preventDefault(); window.open('https://github.com/anthropics/claude-code/issues') }}>
          Need help?
        </a>
      </footer>
    </div>
  )
}
