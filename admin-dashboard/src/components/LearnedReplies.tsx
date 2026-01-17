import { useState } from 'react'

interface LearnedReplyData {
  type: 'learned_reply'
  ticketId: string | null
  question: string
  answer: string
  learnedAt: string
  combinedText: string
}

interface Document {
  id: string
  name: string
  content: string
  created_at: string
}

interface LearnedRepliesProps {
  documents: Document[]
  onDelete: (id: string) => void
}

function parseLearnedReply(doc: Document): LearnedReplyData | null {
  try {
    const parsed = JSON.parse(doc.content)
    if (parsed.type === 'learned_reply') {
      return parsed as LearnedReplyData
    }
  } catch {
    // Not a JSON document or not a learned reply
  }
  return null
}

export default function LearnedReplies({ documents, onDelete }: LearnedRepliesProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // Filter to only learned replies
  const learnedReplies = documents
    .map(doc => ({ doc, data: parseLearnedReply(doc) }))
    .filter((item): item is { doc: Document; data: LearnedReplyData } => item.data !== null)

  if (learnedReplies.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '1.5rem', textAlign: 'center', color: '#666' }}>
        <p style={{ marginBottom: '0.5rem' }}>No learned replies yet.</p>
        <p style={{ fontSize: '0.9rem', color: '#888' }}>
          Use "Insert & Learn" in the Freshdesk extension to start learning from your replies.
        </p>
      </div>
    )
  }

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div className="learned-replies-list">
      {learnedReplies.map(({ doc, data }) => {
        const isExpanded = expandedIds.has(doc.id)
        const ticketLabel = data.ticketId ? `Ticket #${data.ticketId}` : 'Live Reply'
        const learnedDate = new Date(data.learnedAt || doc.created_at).toLocaleDateString()

        return (
          <div key={doc.id} className="learned-reply-item">
            <div
              className="learned-reply-header"
              onClick={() => toggleExpand(doc.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                cursor: 'pointer',
                borderBottom: isExpanded ? '1px solid #e5e7eb' : 'none',
                background: isExpanded ? '#f9fafb' : 'transparent',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                <span
                  className="expand-icon"
                  style={{
                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                    fontSize: '0.8rem',
                    color: '#6b7280',
                  }}
                >
                  ▶
                </span>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      className="ticket-badge"
                      style={{
                        background: data.ticketId ? '#dbeafe' : '#e0e7ff',
                        color: data.ticketId ? '#1d4ed8' : '#4338ca',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}
                    >
                      {ticketLabel}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{learnedDate}</span>
                  </div>
                  <div
                    style={{
                      marginTop: '0.25rem',
                      fontSize: '0.9rem',
                      color: '#374151',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '400px',
                    }}
                  >
                    {data.question.split('\n')[0].slice(0, 80)}
                    {data.question.length > 80 ? '...' : ''}
                  </div>
                </div>
              </div>
              <button
                className="btn btn-danger btn-sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(doc.id)
                }}
                style={{ marginLeft: '0.5rem' }}
              >
                Delete
              </button>
            </div>

            {isExpanded && (
              <div className="learned-reply-content" style={{ padding: '1rem' }}>
                <div style={{ marginBottom: '1rem' }}>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      marginBottom: '0.5rem',
                    }}
                  >
                    Customer Question
                  </div>
                  <div
                    style={{
                      background: '#fef3c7',
                      border: '1px solid #fcd34d',
                      borderRadius: '8px',
                      padding: '0.75rem 1rem',
                      fontSize: '0.9rem',
                      color: '#92400e',
                      whiteSpace: 'pre-wrap',
                      maxHeight: '200px',
                      overflow: 'auto',
                    }}
                  >
                    {data.question}
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      marginBottom: '0.5rem',
                    }}
                  >
                    AI Response (Learned)
                  </div>
                  <div
                    style={{
                      background: '#d1fae5',
                      border: '1px solid #6ee7b7',
                      borderRadius: '8px',
                      padding: '0.75rem 1rem',
                      fontSize: '0.9rem',
                      color: '#065f46',
                      whiteSpace: 'pre-wrap',
                      maxHeight: '300px',
                      overflow: 'auto',
                    }}
                  >
                    {data.answer}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
