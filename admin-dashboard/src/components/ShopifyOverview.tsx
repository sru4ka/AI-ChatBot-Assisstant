import { useState } from 'react'
import { supabase } from '../lib/supabase'

interface ShopifyOverviewProps {
  shopifyDomain: string | null
  shopifyAccessToken: string | null
  businessId: string
  onConfigureClick: () => void
}

interface OrderInfo {
  id: number
  name: string
  email: string
  status: string
  fulfillmentStatus: string | null
  total: string
  date: string
  trackingNumbers: string[]
  itemCount: number
}

interface OrderLookupResult {
  success: boolean
  found: boolean
  orders: OrderInfo[]
  formatted: string
  message?: string
  error?: string
}

export default function ShopifyOverview({
  shopifyDomain,
  shopifyAccessToken,
  businessId,
  onConfigureClick,
}: ShopifyOverviewProps) {
  const [orderQuery, setOrderQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<OrderLookupResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // AI Q&A state
  const [question, setQuestion] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [askingAi, setAskingAi] = useState(false)

  const isConnected = shopifyDomain && shopifyAccessToken

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault()
    if (!orderQuery.trim() || !isConnected) return

    setLoading(true)
    setError(null)
    setResult(null)
    setAiResponse('')
    setQuestion('')

    try {
      const { data, error: fnError } = await supabase.functions.invoke('shopify-orders', {
        body: {
          businessId,
          searchQuery: orderQuery.trim(),
        },
      })

      if (fnError) {
        throw new Error(fnError.message)
      }

      if (data.error) {
        throw new Error(data.error)
      }

      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to lookup order')
    } finally {
      setLoading(false)
    }
  }

  async function handleAskAI(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim() || !result?.formatted) return

    setAskingAi(true)
    setAiResponse('')

    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-reply', {
        body: {
          businessId,
          customerMessage: question.trim(),
          tone: 'professional',
          customPrompt: `You are answering a question about a Shopify order. Use ONLY the following order information to answer. Be specific and helpful.

ORDER INFORMATION:
${result.formatted}

Answer the question directly and concisely based on this order data. If the information requested is not in the order data, say so.`,
        },
      })

      if (fnError) {
        throw new Error(fnError.message)
      }

      if (data.error) {
        throw new Error(data.error)
      }

      setAiResponse(data.reply)
    } catch (err) {
      setAiResponse(`Error: ${err instanceof Error ? err.message : 'Failed to get AI response'}`)
    } finally {
      setAskingAi(false)
    }
  }

  // Not connected state
  if (!isConnected) {
    return (
      <div
        className="shopify-overview"
        style={{
          background: '#f9fafb',
          borderRadius: '12px',
          padding: '1.5rem',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🛒</div>
        <h4 style={{ margin: '0 0 0.5rem', color: '#374151' }}>Shopify Not Connected</h4>
        <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Connect your Shopify store to lookup orders and get AI summaries
        </p>
        <button
          className="btn btn-secondary"
          onClick={onConfigureClick}
          style={{ fontSize: '0.85rem' }}
        >
          Connect Shopify
        </button>
      </div>
    )
  }

  // Connected state
  return (
    <div
      className="shopify-overview"
      style={{
        background: 'linear-gradient(135deg, #f0fff4 0%, #ecfdf5 100%)',
        borderRadius: '12px',
        padding: '1.25rem',
        border: '1px solid #9ae6b4',
      }}
    >
      {/* Connection status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '8px',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          🛒
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span
              style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#22c55e',
              }}
            ></span>
            <h4 style={{ margin: 0, color: '#166534', fontSize: '1rem', fontWeight: '600' }}>
              Shopify Connected
            </h4>
          </div>
          <span
            style={{
              color: '#15803d',
              fontSize: '0.9rem',
              wordBreak: 'break-all',
            }}
          >
            {shopifyDomain}
          </span>
        </div>
      </div>

      {/* Order lookup form */}
      <div
        style={{
          marginTop: '1rem',
          paddingTop: '1rem',
          borderTop: '1px solid #9ae6b4',
        }}
      >
        <h5 style={{ margin: '0 0 0.75rem', color: '#166534', fontSize: '0.9rem' }}>
          Order Lookup & AI Q&A
        </h5>
        <form onSubmit={handleLookup} style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={orderQuery}
            onChange={(e) => setOrderQuery(e.target.value)}
            placeholder="Order # or email"
            style={{
              flex: 1,
              padding: '0.6rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid #9ae6b4',
              fontSize: '0.9rem',
              background: '#fff',
            }}
          />
          <button
            type="submit"
            disabled={loading || !orderQuery.trim()}
            style={{
              padding: '0.6rem 1rem',
              borderRadius: '6px',
              border: 'none',
              background: '#22c55e',
              color: '#fff',
              fontSize: '0.85rem',
              fontWeight: '500',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading || !orderQuery.trim() ? 0.6 : 1,
            }}
          >
            {loading ? 'Looking...' : 'Lookup'}
          </button>
        </form>

        {/* Error message */}
        {error && (
          <div
            style={{
              marginTop: '0.75rem',
              padding: '0.75rem',
              background: '#fef2f2',
              borderRadius: '6px',
              color: '#dc2626',
              fontSize: '0.85rem',
              border: '1px solid #fecaca',
            }}
          >
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div
            style={{
              marginTop: '0.75rem',
              padding: '0.75rem',
              background: '#fff',
              borderRadius: '6px',
              border: '1px solid #d1fae5',
            }}
          >
            {!result.found ? (
              <p style={{ margin: 0, color: '#666', fontSize: '0.85rem' }}>No orders found</p>
            ) : (
              <>
                <p style={{ margin: '0 0 0.5rem', color: '#166534', fontWeight: '500', fontSize: '0.85rem' }}>
                  Found {result.orders.length} order{result.orders.length !== 1 ? 's' : ''}
                </p>
                {result.orders.map((order) => (
                  <div
                    key={order.id}
                    style={{
                      padding: '0.75rem',
                      background: '#f0fdf4',
                      borderRadius: '6px',
                      marginBottom: '0.5rem',
                      fontSize: '0.85rem',
                    }}
                  >
                    <div style={{ fontWeight: '600', color: '#166534', marginBottom: '0.25rem' }}>
                      {order.name}
                    </div>
                    <div style={{ color: '#374151' }}>
                      <span style={{ marginRight: '1rem' }}>Status: {order.status}</span>
                      {order.fulfillmentStatus && (
                        <span style={{ marginRight: '1rem' }}>• {order.fulfillmentStatus}</span>
                      )}
                    </div>
                    <div style={{ color: '#374151', marginTop: '0.25rem' }}>
                      Total: {order.total} • {order.itemCount} item{order.itemCount !== 1 ? 's' : ''}
                    </div>
                    <div style={{ color: '#6b7280', marginTop: '0.25rem', fontSize: '0.8rem' }}>
                      {new Date(order.date).toLocaleDateString()}
                    </div>
                    {order.trackingNumbers.length > 0 && (
                      <div style={{ color: '#166534', marginTop: '0.25rem', fontSize: '0.8rem' }}>
                        Tracking: {order.trackingNumbers.join(', ')}
                      </div>
                    )}
                  </div>
                ))}

                {/* AI Q&A Section */}
                <div
                  style={{
                    marginTop: '1rem',
                    paddingTop: '1rem',
                    borderTop: '1px solid #d1fae5',
                  }}
                >
                  <p style={{ margin: '0 0 0.5rem', color: '#166534', fontWeight: '500', fontSize: '0.85rem' }}>
                    🤖 Ask AI about this order
                  </p>
                  <form onSubmit={handleAskAI} style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="e.g., What items were ordered? Is it shipped?"
                      style={{
                        flex: 1,
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        border: '1px solid #d1fae5',
                        fontSize: '0.85rem',
                        background: '#fff',
                      }}
                    />
                    <button
                      type="submit"
                      disabled={askingAi || !question.trim()}
                      style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: '#fff',
                        fontSize: '0.8rem',
                        fontWeight: '500',
                        cursor: askingAi ? 'not-allowed' : 'pointer',
                        opacity: askingAi || !question.trim() ? 0.6 : 1,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {askingAi ? 'Asking...' : 'Ask'}
                    </button>
                  </form>

                  {/* AI Response */}
                  {aiResponse && (
                    <div
                      style={{
                        marginTop: '0.75rem',
                        padding: '0.75rem',
                        background: '#f5f3ff',
                        borderRadius: '6px',
                        border: '1px solid #ddd6fe',
                        fontSize: '0.85rem',
                        color: '#374151',
                        lineHeight: '1.5',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '1rem' }}>🤖</span>
                        <strong style={{ color: '#5b21b6', fontSize: '0.8rem' }}>AI Response</strong>
                      </div>
                      {aiResponse}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <p
          style={{
            margin: '0.75rem 0 0',
            fontSize: '0.8rem',
            color: '#166534',
          }}
        >
          Look up orders and ask AI questions about order details, shipping, items, etc.
        </p>
      </div>
    </div>
  )
}
