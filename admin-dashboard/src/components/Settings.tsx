import { useState } from 'react'
import { supabase, Business } from '../lib/supabase'

interface SettingsProps {
  business: Business
  onUpdate: (business: Business) => void
}

export default function Settings({ business, onUpdate }: SettingsProps) {
  const [name, setName] = useState(business.name)
  const [freshdeskDomain, setFreshdeskDomain] = useState(business.freshdesk_domain || '')
  const [freshdeskApiKey, setFreshdeskApiKey] = useState(business.freshdesk_api_key || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

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
        })
        .eq('id', business.id)
        .select()
        .single()

      if (error) throw error

      onUpdate(data)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings')
    } finally {
      setLoading(false)
    }
  }

  return (
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
        <small style={{ color: '#666', fontSize: '0.85rem' }}>
          Find this in Freshdesk &gt; Profile Settings &gt; API Key
        </small>
      </div>

      <button type="submit" className="btn btn-primary" disabled={loading}>
        {loading && <span className="spinner" />}
        Save Settings
      </button>

      {/* Business ID display for extension configuration */}
      <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f8f9ff', borderRadius: '8px' }}>
        <strong>Your Business ID</strong>
        <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.5rem' }}>
          Use this ID when configuring the Chrome extension:
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
      </div>
    </form>
  )
}
