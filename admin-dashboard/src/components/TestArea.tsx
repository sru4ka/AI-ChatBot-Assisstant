import { useState } from 'react'
import { generateReply } from '../lib/supabase'

interface TestAreaProps {
  businessId: string
}

interface Source {
  snippet: string
  similarity: number
}

export default function TestArea({ businessId }: TestAreaProps) {
  const [query, setQuery] = useState('')
  const [tone, setTone] = useState<'professional' | 'friendly' | 'concise'>('professional')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    reply: string
    sources: Source[]
    hasKnowledgeBase: boolean
  } | null>(null)

  async function handleTest(e: React.FormEvent) {
    e.preventDefault()

    if (!query.trim()) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await generateReply(businessId, query, tone)
      setResult(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate reply')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="test-area">
      <p style={{ color: '#666', marginBottom: '1rem' }}>
        Test how the AI responds to customer messages using your knowledge base.
      </p>

      <form onSubmit={handleTest}>
        <div className="form-group">
          <label htmlFor="testQuery">Sample Customer Message</label>
          <textarea
            id="testQuery"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g., How do I return a product?"
            rows={3}
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="tone">Response Tone</label>
          <select
            id="tone"
            value={tone}
            onChange={(e) => setTone(e.target.value as 'professional' | 'friendly' | 'concise')}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '1rem',
            }}
            disabled={loading}
          >
            <option value="professional">Professional</option>
            <option value="friendly">Friendly</option>
            <option value="concise">Concise</option>
          </select>
        </div>

        {error && <div className="error-message">{error}</div>}

        <button type="submit" className="btn btn-primary" disabled={loading || !query.trim()}>
          {loading && <span className="spinner" />}
          Generate Test Reply
        </button>
      </form>

      {result && (
        <div className="test-result">
          <h4>AI Generated Reply:</h4>
          <p style={{ whiteSpace: 'pre-wrap' }}>{result.reply}</p>

          {!result.hasKnowledgeBase && (
            <div style={{
              marginTop: '1rem',
              padding: '0.5rem',
              background: '#fff3cd',
              borderRadius: '4px',
              fontSize: '0.85rem',
              color: '#856404',
            }}>
              Note: No relevant documents found in your knowledge base. Upload documents to improve responses.
            </div>
          )}

          {result.sources.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h5 style={{ color: '#666', marginBottom: '0.5rem' }}>Sources Used:</h5>
              <ul style={{ fontSize: '0.85rem', color: '#888', listStyle: 'none' }}>
                {result.sources.map((source, index) => (
                  <li key={index} style={{ marginBottom: '0.5rem', paddingLeft: '1rem', borderLeft: '2px solid #ddd' }}>
                    <span style={{ color: '#667eea' }}>{source.similarity}% match:</span>{' '}
                    {source.snippet}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
