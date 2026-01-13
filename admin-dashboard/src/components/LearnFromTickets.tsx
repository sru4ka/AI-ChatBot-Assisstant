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
              </select>
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
