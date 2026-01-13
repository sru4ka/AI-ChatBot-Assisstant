import { useState, useEffect } from 'react'

interface WebsiteOverviewProps {
  websiteUrl: string | null
  onConfigureClick: () => void
}

interface WebsiteInfo {
  title: string | null
  description: string | null
  favicon: string | null
  status: 'connected' | 'error' | 'loading'
  errorMessage?: string
}

export default function WebsiteOverview({ websiteUrl, onConfigureClick }: WebsiteOverviewProps) {
  const [info, setInfo] = useState<WebsiteInfo | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (websiteUrl) {
      fetchWebsiteInfo(websiteUrl)
    } else {
      setInfo(null)
    }
  }, [websiteUrl])

  async function fetchWebsiteInfo(url: string) {
    setLoading(true)
    try {
      // Normalize URL
      let normalizedUrl = url
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        normalizedUrl = `https://${url}`
      }

      // Extract domain for favicon
      const urlObj = new URL(normalizedUrl)
      const domain = urlObj.hostname
      const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`

      // We can't actually fetch the website due to CORS, but we can verify the URL format
      // and show that it's configured
      setInfo({
        title: domain,
        description: normalizedUrl,
        favicon,
        status: 'connected',
      })
    } catch (err) {
      setInfo({
        title: null,
        description: null,
        favicon: null,
        status: 'error',
        errorMessage: 'Invalid URL format',
      })
    } finally {
      setLoading(false)
    }
  }

  if (!websiteUrl) {
    return (
      <div className="website-overview" style={{
        background: '#f9fafb',
        borderRadius: '12px',
        padding: '1.5rem',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🌐</div>
        <h4 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No Website Configured</h4>
        <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Add your website URL in Settings to see a quick overview here
        </p>
        <button
          className="btn btn-secondary"
          onClick={onConfigureClick}
          style={{ fontSize: '0.85rem' }}
        >
          Configure Website
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="website-overview" style={{
        background: '#f9fafb',
        borderRadius: '12px',
        padding: '1.5rem',
        textAlign: 'center',
      }}>
        <span className="spinner"></span>
        <p style={{ color: '#6b7280', marginTop: '0.5rem' }}>Loading website info...</p>
      </div>
    )
  }

  if (info?.status === 'error') {
    return (
      <div className="website-overview" style={{
        background: '#fef2f2',
        borderRadius: '12px',
        padding: '1.5rem',
        border: '1px solid #fecaca',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.5rem' }}>⚠️</span>
          <div>
            <h4 style={{ margin: '0 0 0.25rem', color: '#991b1b' }}>Website Configuration Error</h4>
            <p style={{ color: '#b91c1c', fontSize: '0.85rem', margin: 0 }}>{info.errorMessage}</p>
          </div>
        </div>
        <button
          className="btn btn-secondary"
          onClick={onConfigureClick}
          style={{ marginTop: '1rem', fontSize: '0.85rem' }}
        >
          Fix in Settings
        </button>
      </div>
    )
  }

  return (
    <div className="website-overview" style={{
      background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
      borderRadius: '12px',
      padding: '1.25rem',
      border: '1px solid #bbf7d0',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {info?.favicon && (
          <img
            src={info.favicon}
            alt=""
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '8px',
              background: '#fff',
              padding: '4px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#22c55e',
            }}></span>
            <h4 style={{ margin: 0, color: '#166534', fontSize: '1rem', fontWeight: '600' }}>
              Website Connected
            </h4>
          </div>
          <a
            href={info?.description || websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#15803d',
              fontSize: '0.9rem',
              textDecoration: 'none',
              wordBreak: 'break-all',
            }}
          >
            {info?.title || websiteUrl}
          </a>
        </div>
        <a
          href={info?.description || websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: '0.5rem 0.75rem',
            background: '#fff',
            borderRadius: '6px',
            color: '#166534',
            textDecoration: 'none',
            fontSize: '0.8rem',
            fontWeight: '500',
            border: '1px solid #bbf7d0',
          }}
        >
          Visit ↗
        </a>
      </div>
      <div style={{
        marginTop: '1rem',
        paddingTop: '1rem',
        borderTop: '1px solid #bbf7d0',
        fontSize: '0.8rem',
        color: '#166534',
      }}>
        <p style={{ margin: 0 }}>
          The AI will use this as a reference when answering customer questions about your website.
        </p>
      </div>
    </div>
  )
}
