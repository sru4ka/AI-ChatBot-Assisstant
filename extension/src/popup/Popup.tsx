import { useState, useEffect } from 'react'
import { getConfig, saveConfig, generateReply, isConfigured, GenerateReplyResponse } from '../utils/api'

type Tab = 'main' | 'settings'
type Tone = 'professional' | 'friendly' | 'concise'

interface TicketInfo {
  customerMessage: string
  ticketSubject?: string
}

export default function Popup() {
  const [activeTab, setActiveTab] = useState<Tab>('main')
  const [configured, setConfigured] = useState(false)
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

  // Settings state
  const [supabaseUrl, setSupabaseUrl] = useState('')
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('')
  const [businessId, setBusinessId] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)

  useEffect(() => {
    init()
  }, [])

  async function init() {
    setLoading(true)
    try {
      // Check if configured
      const isConf = await isConfigured()
      setConfigured(isConf)

      // Load existing config
      const config = await getConfig()
      if (config) {
        setSupabaseUrl(config.supabaseUrl)
        setSupabaseAnonKey(config.supabaseAnonKey)
        setBusinessId(config.businessId)
      }

      // Check if on Freshdesk
      chrome.runtime.sendMessage({ type: 'CHECK_FRESHDESK' }, (response) => {
        setIsOnFreshdesk(response?.isOnFreshdesk || false)
        setIsOnTicket(response?.isOnTicket || false)
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveSettings() {
    if (!supabaseUrl || !supabaseAnonKey || !businessId) {
      setError('All fields are required')
      return
    }

    setSavingSettings(true)
    setError(null)

    try {
      await saveConfig({ supabaseUrl, supabaseAnonKey, businessId })
      setConfigured(true)
      setSuccess('Settings saved successfully!')
      setActiveTab('main')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSavingSettings(false)
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
        <button className={`tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
          Settings
        </button>
      </div>

      <div className="content">
        {error && <div className="status error">{error}</div>}
        {success && <div className="status success">{success}</div>}

        {activeTab === 'main' ? (
          <>
            {!configured ? (
              <div className="status warning">
                Please configure your settings first to use this extension.
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
          /* Settings Tab */
          <div className="settings-form">
            <div className="form-group">
              <label>Supabase URL</label>
              <input
                type="text"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                placeholder="https://your-project.supabase.co"
              />
              <small>Your Supabase project URL</small>
            </div>

            <div className="form-group">
              <label>Supabase Anon Key</label>
              <input
                type="password"
                value={supabaseAnonKey}
                onChange={(e) => setSupabaseAnonKey(e.target.value)}
                placeholder="Your anon/public key"
              />
              <small>Found in Supabase Dashboard → Settings → API</small>
            </div>

            <div className="form-group">
              <label>Business ID</label>
              <input
                type="text"
                value={businessId}
                onChange={(e) => setBusinessId(e.target.value)}
                placeholder="Your business ID"
              />
              <small>Found in the Admin Dashboard settings</small>
            </div>

            <button
              className="btn btn-primary"
              onClick={handleSaveSettings}
              disabled={savingSettings}
            >
              {savingSettings && <span className="spinner" />}
              {savingSettings ? 'Saving...' : 'Save Settings'}
            </button>
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
