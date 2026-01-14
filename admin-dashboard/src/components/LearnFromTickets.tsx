import { useState, useEffect } from 'react'
import { supabase, Business } from '../lib/supabase'

interface LearnFromTicketsProps {
  business: Business
  onLearned: () => void
}

interface LearningHistoryItem {
  id: string
  date: string
  ticketsScanned: number
  conversationsLearned: number
  chunksCreated: number
  status: 'success' | 'error'
  errorMessage?: string
}

export default function LearnFromTickets({ business, onLearned }: LearnFromTicketsProps) {
  const [learningTickets, setLearningTickets] = useState(false)
  const [ticketCount, setTicketCount] = useState(100)
  const [learnError, setLearnError] = useState<string | null>(null)
  const [learnSuccess, setLearnSuccess] = useState<string | null>(null)
  const [history, setHistory] = useState<LearningHistoryItem[]>([])
  const [elapsedTime, setElapsedTime] = useState(0)
  const [learningStartTime, setLearningStartTime] = useState<number | null>(null)

  const freshdeskDomain = business.freshdesk_domain
  const freshdeskApiKey = business.freshdesk_api_key
  const isConfigured = freshdeskDomain && freshdeskApiKey

  // Load history from localStorage
  useEffect(() => {
    const storageKey = `learning-history-${business.id}`
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      try {
        setHistory(JSON.parse(stored))
      } catch (e) {
        console.error('Failed to parse learning history:', e)
      }
    }
  }, [business.id])

  // Track elapsed time during learning
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    if (learningTickets && learningStartTime) {
      interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - learningStartTime) / 1000))
      }, 1000)
    } else {
      setElapsedTime(0)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [learningTickets, learningStartTime])

  // Estimate time based on ticket count (roughly 2-3 seconds per ticket for API calls)
  function getEstimatedTime(count: number): string {
    const baseSeconds = Math.ceil(count * 0.8) // ~0.8 seconds per ticket (API rate limits)
    const minutes = Math.floor(baseSeconds / 60)
    const seconds = baseSeconds % 60
    if (minutes === 0) return `~${seconds} seconds`
    if (minutes === 1) return `~1-2 minutes`
    return `~${minutes}-${minutes + 1} minutes`
  }

  function formatElapsedTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins === 0) return `${secs}s`
    return `${mins}m ${secs}s`
  }

  function getProgressPercentage(): number {
    // Estimate progress based on typical timing
    const estimatedSeconds = Math.ceil(ticketCount * 0.8)
    return Math.min(95, Math.floor((elapsedTime / estimatedSeconds) * 100))
  }

  // Save history to localStorage
  function saveHistory(newHistory: LearningHistoryItem[]) {
    const storageKey = `learning-history-${business.id}`
    localStorage.setItem(storageKey, JSON.stringify(newHistory))
    setHistory(newHistory)
  }

  async function handleLearnFromTickets() {
    if (!freshdeskDomain || !freshdeskApiKey) {
      setLearnError('Please configure Freshdesk credentials in Settings first')
      return
    }

    setLearningTickets(true)
    setLearnError(null)
    setLearnSuccess(null)
    setLearningStartTime(Date.now())

    const startTime = new Date()

    try {
      const response = await supabase.functions.invoke('learn-tickets', {
        body: {
          businessId: business.id,
          freshdeskDomain: freshdeskDomain.replace(/^https?:\/\//, ''),
          freshdeskApiKey,
          ticketCount,
        },
      })

      if (response.error) {
        throw new Error(response.error.message)
      }

      const data = response.data

      // Add to history
      const historyItem: LearningHistoryItem = {
        id: Date.now().toString(),
        date: startTime.toISOString(),
        ticketsScanned: ticketCount,
        conversationsLearned: data.conversationsLearned || 0,
        chunksCreated: data.chunksCreated || 0,
        status: 'success',
      }

      const newHistory = [historyItem, ...history].slice(0, 10) // Keep last 10
      saveHistory(newHistory)

      setLearnSuccess(
        `Successfully learned from ${data.conversationsLearned} resolved tickets! ` +
        `(${data.chunksCreated} knowledge chunks created)`
      )
      onLearned()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to learn from tickets'

      // Add error to history
      const historyItem: LearningHistoryItem = {
        id: Date.now().toString(),
        date: startTime.toISOString(),
        ticketsScanned: ticketCount,
        conversationsLearned: 0,
        chunksCreated: 0,
        status: 'error',
        errorMessage,
      }

      const newHistory = [historyItem, ...history].slice(0, 10)
      saveHistory(newHistory)

      setLearnError(errorMessage)
    } finally {
      setLearningTickets(false)
      setLearningStartTime(null)
    }
  }

  function clearHistory() {
    if (confirm('Clear all learning history?')) {
      saveHistory([])
    }
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString)
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="learn-tickets">
      <p className="learn-description">
        Automatically scan your resolved and closed Freshdesk tickets to teach the AI
        your response patterns and build knowledge from past conversations.
      </p>

      {learnError && <div className="error-message">{learnError}</div>}
      {learnSuccess && <div className="success-message">{learnSuccess}</div>}

      {!isConfigured ? (
        <div className="config-notice">
          <span className="notice-icon">⚠️</span>
          <div>
            <strong>Freshdesk not configured</strong>
            <p>Please go to <strong>Settings</strong> and add your Freshdesk domain and API key first.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="learn-controls">
            <div className="ticket-select">
              <label htmlFor="ticketCount">Number of tickets to scan</label>
              <select
                id="ticketCount"
                value={ticketCount}
                onChange={(e) => setTicketCount(Number(e.target.value))}
                disabled={learningTickets}
              >
                <option value={100}>100 tickets</option>
                <option value={250}>250 tickets</option>
                <option value={500}>500 tickets</option>
                <option value={1000}>1000 tickets</option>
                <option value={2000}>2000 tickets</option>
                <option value={2500}>2500 tickets</option>
                <option value={3000}>3000 tickets</option>
                <option value={5000}>5000 tickets</option>
              </select>
              {!learningTickets && (
                <small style={{ display: 'block', marginTop: '0.5rem', color: '#666', fontSize: '0.8rem' }}>
                  Estimated time: {getEstimatedTime(ticketCount)}
                </small>
              )}
            </div>

            <button
              type="button"
              className="btn btn-learn"
              onClick={handleLearnFromTickets}
              disabled={learningTickets}
            >
              {learningTickets ? (
                <>
                  <span className="spinner" style={{ borderColor: '#fff', borderTopColor: 'transparent' }}></span>
                  Learning...
                </>
              ) : (
                <>
                  <span className="btn-icon">🧠</span>
                  Start Learning
                </>
              )}
            </button>
          </div>

          {/* Learning Progress Indicator */}
          {learningTickets && (
            <div className="learning-progress" style={{
              background: '#f0f9ff',
              border: '1px solid #bae6fd',
              borderRadius: '12px',
              padding: '1.25rem',
              marginBottom: '1rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontWeight: '600', color: '#0369a1' }}>
                  Processing {ticketCount} tickets...
                </span>
                <span style={{ fontSize: '0.85rem', color: '#0284c7' }}>
                  {formatElapsedTime(elapsedTime)} elapsed
                </span>
              </div>

              {/* Progress Bar */}
              <div style={{
                width: '100%',
                height: '8px',
                background: '#e0f2fe',
                borderRadius: '4px',
                overflow: 'hidden',
                marginBottom: '0.5rem',
              }}>
                <div style={{
                  width: `${getProgressPercentage()}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #0284c7, #0ea5e9)',
                  borderRadius: '4px',
                  transition: 'width 1s ease-out',
                }} />
              </div>

              <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                <span>Scanning tickets, fetching conversations, creating embeddings...</span>
                <span>~{getProgressPercentage()}%</span>
              </div>
            </div>
          )}

          <div className="learn-info">
            <h4>What this does:</h4>
            <ul>
              <li>Scans your resolved and closed tickets</li>
              <li>Extracts customer queries and agent responses</li>
              <li>Creates searchable knowledge for AI responses</li>
              <li>Improves reply suggestions based on your history</li>
            </ul>
          </div>

          {freshdeskDomain && (
            <div className="connected-info">
              <span className="status-dot connected"></span>
              Connected to: <strong>{freshdeskDomain}</strong>
            </div>
          )}

          {/* Learning History */}
          {history.length > 0 && (
            <div className="learning-history" style={{ marginTop: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: '600', color: '#444' }}>Learning History</h4>
                <button
                  onClick={clearHistory}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#999',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                  }}
                >
                  Clear
                </button>
              </div>
              <div style={{
                background: '#f9fafb',
                borderRadius: '8px',
                overflow: 'hidden',
                border: '1px solid #e5e7eb',
              }}>
                {history.map((item, index) => (
                  <div
                    key={item.id}
                    style={{
                      padding: '0.75rem 1rem',
                      borderBottom: index < history.length - 1 ? '1px solid #e5e7eb' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                    }}
                  >
                    <span style={{ fontSize: '1.1rem' }}>
                      {item.status === 'success' ? '✅' : '❌'}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.85rem', color: '#333' }}>
                        {item.status === 'success' ? (
                          <>
                            <strong>{item.conversationsLearned}</strong> tickets → <strong>{item.chunksCreated}</strong> chunks
                          </>
                        ) : (
                          <span style={{ color: '#dc2626' }}>{item.errorMessage || 'Failed'}</span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '2px' }}>
                        {formatDate(item.date)} • Scanned {item.ticketsScanned} tickets
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
