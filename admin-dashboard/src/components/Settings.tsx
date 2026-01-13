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

// Collapsible section component
function CollapsibleSection({
  title,
  subtitle,
  icon,
  color,
  bgColor,
  borderColor,
  children,
  defaultOpen = false
}: {
  title: string
  subtitle?: string
  icon: string
  color: string
  bgColor: string
  borderColor: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div style={{
      marginBottom: '1rem',
      borderRadius: '12px',
      border: `1px solid ${borderColor}`,
      overflow: 'hidden',
      background: '#fff',
    }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          padding: '1rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: bgColor,
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.5rem' }}>{icon}</span>
          <div>
            <div style={{ fontWeight: '600', color, fontSize: '1rem' }}>{title}</div>
            {subtitle && <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '2px' }}>{subtitle}</div>}
          </div>
        </div>
        <span style={{
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s',
          fontSize: '1.25rem',
          color: '#666',
        }}>
          ▼
        </span>
      </button>
      {isOpen && (
        <div style={{ padding: '1.25rem', borderTop: `1px solid ${borderColor}` }}>
          {children}
        </div>
      )}
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
    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <form onSubmit={handleSubmit}>
        {error && <div className="error-message" style={{ marginBottom: '1rem' }}>{error}</div>}

        {/* Business Info - Always visible */}
        <div style={{
          marginBottom: '1.5rem',
          padding: '1.25rem',
          background: '#fff',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
        }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="businessName" style={{ fontWeight: '600', marginBottom: '0.5rem', display: 'block' }}>
              Business Name
            </label>
            <input
              id="businessName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your business name"
              required
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #d1d5db' }}
            />
          </div>
        </div>

        {/* Freshdesk Integration */}
        <CollapsibleSection
          title="Freshdesk Integration"
          subtitle={freshdeskDomain ? `Connected: ${freshdeskDomain}` : 'Not configured'}
          icon="🎫"
          color="#1a56db"
          bgColor="#eff6ff"
          borderColor="#bfdbfe"
          defaultOpen={!freshdeskDomain}
        >
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label htmlFor="freshdeskDomain">Freshdesk Domain</label>
            <input
              id="freshdeskDomain"
              type="text"
              value={freshdeskDomain}
              onChange={(e) => setFreshdeskDomain(e.target.value)}
              placeholder="yourcompany.freshdesk.com"
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #d1d5db' }}
            />
            <small style={{ color: '#666', fontSize: '0.8rem' }}>
              e.g., yourcompany.freshdesk.com
            </small>
          </div>

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label htmlFor="freshdeskApiKey">Freshdesk API Key</label>
            <input
              id="freshdeskApiKey"
              type="password"
              value={freshdeskApiKey}
              onChange={(e) => setFreshdeskApiKey(e.target.value)}
              placeholder="Your Freshdesk API key"
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #d1d5db' }}
            />
          </div>

          <details style={{ fontSize: '0.85rem', color: '#666' }}>
            <summary style={{ cursor: 'pointer', color: '#1a56db', fontWeight: '500' }}>
              How to find your API Key
            </summary>
            <ol style={{ margin: '0.5rem 0 0 0', paddingLeft: '1.25rem', lineHeight: '1.8' }}>
              <li>Log in to your Freshdesk account</li>
              <li>Click your <strong>profile picture</strong> (top right)</li>
              <li>Select <strong>"Profile Settings"</strong></li>
              <li>Scroll down to find <strong>"Your API Key"</strong></li>
            </ol>
            {freshdeskDomain && (
              <a
                href={`https://${freshdeskDomain.replace(/^https?:\/\//, '')}/a/profile/settings`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-block', marginTop: '0.5rem', color: '#1a56db' }}
              >
                Open Freshdesk Profile Settings →
              </a>
            )}
          </details>
        </CollapsibleSection>

        {/* Shopify Integration */}
        <CollapsibleSection
          title="Shopify Integration"
          subtitle={shopifyDomain ? `Connected: ${shopifyDomain}` : 'Optional - for order lookups'}
          icon="🛒"
          color="#276749"
          bgColor="#f0fff4"
          borderColor="#9ae6b4"
        >
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label htmlFor="shopifyDomain">Shopify Store Domain</label>
            <input
              id="shopifyDomain"
              type="text"
              value={shopifyDomain}
              onChange={(e) => setShopifyDomain(e.target.value)}
              placeholder="your-store.myshopify.com"
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #d1d5db' }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label htmlFor="shopifyAccessToken">Shopify Access Token</label>
            <input
              id="shopifyAccessToken"
              type="password"
              value={shopifyAccessToken}
              onChange={(e) => setShopifyAccessToken(e.target.value)}
              placeholder="shpat_xxxxx..."
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #d1d5db' }}
            />
          </div>

          <details style={{ fontSize: '0.85rem', color: '#666' }}>
            <summary style={{ cursor: 'pointer', color: '#276749', fontWeight: '500' }}>
              How to create Access Token
            </summary>
            <ol style={{ margin: '0.5rem 0 0 0', paddingLeft: '1.25rem', lineHeight: '1.8' }}>
              <li>Shopify Admin → <strong>Settings</strong> → <strong>Apps and sales channels</strong></li>
              <li>Click <strong>"Develop apps"</strong></li>
              <li>Create app named "Freshdesk AI"</li>
              <li>Configure Admin API scopes: <code>read_orders</code>, <code>read_customers</code>, <code>read_fulfillments</code></li>
              <li>Install app → <strong>"Reveal token once"</strong></li>
            </ol>
          </details>
        </CollapsibleSection>

        {/* Website URL */}
        <CollapsibleSection
          title="Website URL"
          subtitle={websiteUrl || 'Optional - for AI reference'}
          icon="🌐"
          color="#5b21b6"
          bgColor="#f5f3ff"
          borderColor="#c4b5fd"
        >
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="websiteUrl">Your Website</label>
            <input
              id="websiteUrl"
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://www.yourwebsite.com"
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #d1d5db' }}
            />
            <small style={{ color: '#666', fontSize: '0.8rem' }}>
              The AI can reference this when answering customer questions
            </small>
          </div>
        </CollapsibleSection>

        {/* Save Button */}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading}
          style={{
            width: '100%',
            padding: '0.875rem',
            fontSize: '1rem',
            borderRadius: '8px',
            marginBottom: '2rem',
          }}
        >
          {loading && <span className="spinner" />}
          Save Settings
        </button>
      </form>

      {/* Ticket Learning Section */}
      <CollapsibleSection
        title="Learn from Past Tickets"
        subtitle="Train AI on your resolved tickets"
        icon="🧠"
        color="#c2410c"
        bgColor="#fff7ed"
        borderColor="#fed7aa"
        defaultOpen={true}
      >
        <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '1rem' }}>
          Scan your resolved Freshdesk tickets to teach the AI your response patterns.
        </p>

        {learnError && <div className="error-message" style={{ marginBottom: '1rem' }}>{learnError}</div>}
        {learnSuccess && <div className="success-message" style={{ marginBottom: '1rem' }}>{learnSuccess}</div>}

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="ticketCount" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
              Tickets to scan
            </label>
            <select
              id="ticketCount"
              value={ticketCount}
              onChange={(e) => setTicketCount(Number(e.target.value))}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #d1d5db' }}
            >
              <option value={100}>100 tickets</option>
              <option value={250}>250 tickets</option>
              <option value={500}>500 tickets</option>
              <option value={1000}>1000 tickets</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleLearnFromTickets}
            disabled={learningTickets || !freshdeskDomain || !freshdeskApiKey}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#c2410c',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              opacity: (learningTickets || !freshdeskDomain || !freshdeskApiKey) ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {learningTickets ? 'Learning...' : 'Learn'}
          </button>
        </div>

        {(!freshdeskDomain || !freshdeskApiKey) && (
          <p style={{ fontSize: '0.8rem', color: '#c2410c', marginTop: '0.75rem' }}>
            Configure Freshdesk above first
          </p>
        )}
      </CollapsibleSection>

      {/* Business ID - Compact */}
      <div style={{
        marginTop: '1rem',
        padding: '1rem',
        background: '#f9fafb',
        borderRadius: '8px',
        fontSize: '0.85rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#666' }}>Business ID:</span>
          <code style={{
            padding: '0.25rem 0.5rem',
            background: '#fff',
            borderRadius: '4px',
            fontSize: '0.8rem',
            color: '#374151',
          }}>
            {business.id}
          </code>
        </div>
        <small style={{ color: '#9ca3af', display: 'block', marginTop: '0.5rem' }}>
          Auto-linked to your account - no configuration needed
        </small>
      </div>
    </div>
  )
}
