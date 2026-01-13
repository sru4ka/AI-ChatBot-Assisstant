import { useState } from 'react'
import { supabase, Business } from '../lib/supabase'

interface LearnFromTicketsProps {
  business: Business
  onLearned: () => void
}

export default function LearnFromTickets({ business, onLearned }: LearnFromTicketsProps) {
  const [learningTickets, setLearningTickets] = useState(false)
  const [ticketCount, setTicketCount] = useState(100)
  const [learnError, setLearnError] = useState<string | null>(null)
  const [learnSuccess, setLearnSuccess] = useState<string | null>(null)

  const freshdeskDomain = business.freshdesk_domain
  const freshdeskApiKey = business.freshdesk_api_key
  const isConfigured = freshdeskDomain && freshdeskApiKey

  async function handleLearnFromTickets() {
    if (!freshdeskDomain || !freshdeskApiKey) {
      setLearnError('Please configure Freshdesk credentials in Settings first')
      return
    }

    setLearningTickets(true)
    setLearnError(null)
    setLearnSuccess(null)

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
      setLearnSuccess(
        `Successfully learned from ${data.conversationsLearned} resolved tickets! ` +
        `(${data.chunksCreated} knowledge chunks created)`
      )
      onLearned()
    } catch (err) {
      setLearnError(err instanceof Error ? err.message : 'Failed to learn from tickets')
    } finally {
      setLearningTickets(false)
    }
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
        </>
      )}
    </div>
  )
}
