import { useState, useEffect } from 'react'
import { supabase, Business } from '../lib/supabase'

// Toast notification component
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '1rem 2rem',
      borderRadius: '8px',
      background: type === 'success' ? '#10b981' : '#ef4444',
      color: 'white',
      fontWeight: '500',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: 9999,
      animation: 'slideDown 0.3s ease-out',
    }}>
      {message}
      <style>{`
        @keyframes slideDown {
          from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

interface SettingsProps {
  business: Business
  onUpdate: (business: Business) => void
}

export default function Settings({ business, onUpdate }: SettingsProps) {
  const [name, setName] = useState(business.name)
  const [freshdeskDomain, setFreshdeskDomain] = useState(business.freshdesk_domain || '')
  const [freshdeskApiKey, setFreshdeskApiKey] = useState(business.freshdesk_api_key || '')
  const [shopifyDomain, setShopifyDomain] = useState((business as any).shopify_domain || '')
  const [shopifyAccessToken, setShopifyAccessToken] = useState((business as any).shopify_access_token || '')
  const [websiteUrl, setWebsiteUrl] = useState((business as any).website_url || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Ticket learning state
  const [learningTickets, setLearningTickets] = useState(false)
  const [ticketCount, setTicketCount] = useState(100)
  const [learnError, setLearnError] = useState<string | null>(null)
  const [learnSuccess, setLearnSuccess] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const { data, error } = await supabase
        .from('businesses')
        .update({
          name,
          freshdesk_domain: freshdeskDomain || null,
          freshdesk_api_key: freshdeskApiKey || null,
          shopify_domain: shopifyDomain || null,
          shopify_access_token: shopifyAccessToken || null,
          website_url: websiteUrl || null,
        })
        .eq('id', business.id)
        .select()
        .single()

      if (error) throw error

      onUpdate(data)
      setSuccess(true)
      setToast({ message: 'Settings saved successfully!', type: 'success' })
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings')
      setToast({ message: 'Failed to save settings', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  async function handleLearnFromTickets() {
    if (!freshdeskDomain || !freshdeskApiKey) {
      setLearnError('Please configure Freshdesk credentials first')
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
    } catch (err) {
      setLearnError(err instanceof Error ? err.message : 'Failed to learn from tickets')
    } finally {
      setLearningTickets(false)
    }
  }

  return (
    <div>
      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <form className="settings-form" onSubmit={handleSubmit}>
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">Settings saved successfully!</div>}

        <div className="form-group">
          <label htmlFor="businessName">Business Name</label>
          <input
            id="businessName"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your business name"
            required
          />
        </div>

        {/* Freshdesk Settings */}
        <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
          <h4 style={{ marginBottom: '1rem', color: '#495057' }}>Freshdesk Integration</h4>

          <div className="form-group">
            <label htmlFor="freshdeskDomain">Freshdesk Domain</label>
            <input
              id="freshdeskDomain"
              type="text"
              value={freshdeskDomain}
              onChange={(e) => setFreshdeskDomain(e.target.value)}
              placeholder="yourcompany.freshdesk.com"
            />
            <small style={{ color: '#666', fontSize: '0.85rem' }}>
              Your Freshdesk subdomain (e.g., yourcompany.freshdesk.com)
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="freshdeskApiKey">Freshdesk API Key</label>
            <input
              id="freshdeskApiKey"
              type="password"
              value={freshdeskApiKey}
              onChange={(e) => setFreshdeskApiKey(e.target.value)}
              placeholder="Your Freshdesk API key"
            />
            <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: '#fff', borderRadius: '6px', border: '1px solid #d0e3ff' }}>
              <strong style={{ fontSize: '0.85rem', color: '#1a56db' }}>How to find your API Key:</strong>
              <ol style={{ margin: '0.5rem 0 0 0', paddingLeft: '1.25rem', fontSize: '0.8rem', color: '#444', lineHeight: '1.6' }}>
                <li>Log in to your Freshdesk account</li>
                <li>Click your <strong>profile picture</strong> (top right corner)</li>
                <li>Select <strong>"Profile Settings"</strong></li>
                <li>Scroll down to find <strong>"Your API Key"</strong></li>
                <li>Copy the API key and paste it here</li>
              </ol>
              {freshdeskDomain && (
                <a
                  href={`https://${freshdeskDomain.replace(/^https?:\/\//, '')}/a/profile/settings`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-block', marginTop: '0.5rem', fontSize: '0.8rem', color: '#1a56db' }}
                >
                  Open your Freshdesk Profile Settings →
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Shopify Settings */}
        <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f0fff4', borderRadius: '8px', border: '1px solid #9ae6b4' }}>
          <h4 style={{ marginBottom: '1rem', color: '#276749' }}>Shopify Integration (Optional)</h4>
          <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '1rem' }}>
            Connect Shopify to automatically include order info in AI replies.
          </p>

          <div className="form-group">
            <label htmlFor="shopifyDomain">Shopify Store Domain</label>
            <input
              id="shopifyDomain"
              type="text"
              value={shopifyDomain}
              onChange={(e) => setShopifyDomain(e.target.value)}
              placeholder="your-store.myshopify.com"
            />
            <small style={{ color: '#666', fontSize: '0.85rem' }}>
              Your Shopify store domain (e.g., your-store.myshopify.com)
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="shopifyAccessToken">Shopify Access Token</label>
            <input
              id="shopifyAccessToken"
              type="password"
              value={shopifyAccessToken}
              onChange={(e) => setShopifyAccessToken(e.target.value)}
              placeholder="shpat_xxxxx..."
            />
            <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: '#fff', borderRadius: '6px', border: '1px solid #9ae6b4' }}>
              <strong style={{ fontSize: '0.85rem', color: '#276749' }}>How to create Access Token:</strong>
              <ol style={{ margin: '0.5rem 0 0 0', paddingLeft: '1.25rem', fontSize: '0.8rem', color: '#444', lineHeight: '1.6' }}>
                <li>Go to your Shopify Admin → <strong>Settings</strong> → <strong>Apps and sales channels</strong></li>
                <li>Click <strong>"Develop apps"</strong> (top right)</li>
                <li>Click <strong>"Create an app"</strong>, name it "Freshdesk AI"</li>
                <li>Click <strong>"Configure Admin API scopes"</strong></li>
                <li>Enable: <code>read_orders</code>, <code>read_customers</code>, <code>read_fulfillments</code></li>
                <li>Click <strong>"Install app"</strong> then <strong>"Reveal token once"</strong></li>
                <li>Copy the <strong>Admin API access token</strong> (starts with shpat_)</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Website URL */}
        <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f5f3ff', borderRadius: '8px', border: '1px solid #c4b5fd' }}>
          <h4 style={{ marginBottom: '1rem', color: '#5b21b6' }}>Website URL (Optional)</h4>
          <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '1rem' }}>
            Add your website URL so the AI can reference it when answering questions.
          </p>

          <div className="form-group">
            <label htmlFor="websiteUrl">Website URL</label>
            <input
              id="websiteUrl"
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://www.yourwebsite.com"
            />
            <small style={{ color: '#666', fontSize: '0.85rem' }}>
              Your main website (e.g., https://www.ergonomiclux.com)
            </small>
          </div>
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: '1.5rem' }}>
          {loading && <span className="spinner" />}
          Save Settings
        </button>
      </form>

      {/* Ticket Learning Section */}
      <div style={{ marginTop: '2rem', padding: '1rem', background: '#fff7ed', borderRadius: '8px', border: '1px solid #fed7aa' }}>
        <h4 style={{ marginBottom: '1rem', color: '#c2410c' }}>Learn from Past Tickets</h4>
        <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '1rem' }}>
          Scan your resolved Freshdesk tickets to teach the AI your response patterns.
          This will analyze ticket conversations and add them to your knowledge base.
        </p>

        {learnError && <div className="error-message">{learnError}</div>}
        {learnSuccess && <div className="success-message">{learnSuccess}</div>}

        <div className="form-group">
          <label htmlFor="ticketCount">Number of tickets to scan</label>
          <select
            id="ticketCount"
            value={ticketCount}
            onChange={(e) => setTicketCount(Number(e.target.value))}
            style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
          >
            <option value={100}>100 tickets</option>
            <option value={250}>250 tickets</option>
            <option value={500}>500 tickets</option>
            <option value={1000}>1000 tickets</option>
          </select>
          <small style={{ color: '#666', fontSize: '0.85rem' }}>
            More tickets = better AI responses, but takes longer to process
          </small>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={handleLearnFromTickets}
          disabled={learningTickets || !freshdeskDomain || !freshdeskApiKey}
          style={{ background: '#c2410c', width: '100%' }}
        >
          {learningTickets && <span className="spinner" />}
          {learningTickets ? 'Learning from tickets...' : 'Learn from Past Tickets'}
        </button>

        {(!freshdeskDomain || !freshdeskApiKey) && (
          <p style={{ fontSize: '0.8rem', color: '#c2410c', marginTop: '0.5rem' }}>
            Please configure Freshdesk credentials above first.
          </p>
        )}
      </div>

      {/* Business ID display for reference */}
      <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f8f9ff', borderRadius: '8px' }}>
        <strong>Your Business ID</strong>
        <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.5rem' }}>
          This ID is automatically linked to your account. You don't need to configure it manually -
          just log in to the Chrome extension using the same email and password you use here.
        </p>
        <code style={{
          display: 'block',
          padding: '0.5rem',
          background: '#fff',
          border: '1px solid #ddd',
          borderRadius: '4px',
          marginTop: '0.5rem',
          fontSize: '0.85rem',
          wordBreak: 'break-all',
        }}>
          {business.id}
        </code>
        <small style={{ display: 'block', marginTop: '0.5rem', color: '#888' }}>
          (Shown for reference/debugging only)
        </small>
      </div>
    </div>
  )
}
