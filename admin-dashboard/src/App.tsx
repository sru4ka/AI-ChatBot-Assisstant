import { useState, useEffect } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase, Business, Document } from './lib/supabase'
import Login from './components/Login'
import Settings from './components/Settings'
import TestArea from './components/TestArea'
import DocumentUpload from './components/DocumentUpload'
import LearnFromTickets from './components/LearnFromTickets'

type Page = 'dashboard' | 'upload' | 'settings'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [business, setBusiness] = useState<Business | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')
  const [documents, setDocuments] = useState<Document[]>([])
  const [docsLoading, setDocsLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        loadBusiness(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        loadBusiness(session.user.id)
      } else {
        setBusiness(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (business) {
      loadDocuments()
    }
  }, [business?.id])

  async function loadBusiness(userId: string) {
    try {
      // Try to find existing business for this user
      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('id', userId)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading business:', error)
      }

      if (data) {
        setBusiness(data)
      } else {
        // Create a new business for this user
        const { data: newBusiness, error: createError } = await supabase
          .from('businesses')
          .insert({
            id: userId,
            name: 'My Business',
          })
          .select()
          .single()

        if (createError) {
          console.error('Error creating business:', createError)
        } else {
          setBusiness(newBusiness)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  async function loadDocuments() {
    if (!business) return
    setDocsLoading(true)
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('business_id', business.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setDocuments(data || [])
    } catch (err) {
      console.error('Error loading documents:', err)
    } finally {
      setDocsLoading(false)
    }
  }

  async function handleDeleteDocument(documentId: string) {
    if (!confirm('Are you sure you want to delete this document?')) return

    try {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId)

      if (error) throw error
      setDocuments(documents.filter((d) => d.id !== documentId))
    } catch (err) {
      console.error('Error deleting document:', err)
      alert('Failed to delete document')
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  function handleBusinessUpdate(updatedBusiness: Business) {
    setBusiness(updatedBusiness)
  }

  if (loading) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return <Login />
  }

  const navItems = [
    { id: 'dashboard' as Page, label: 'Dashboard', icon: '📊', subtitle: 'Test AI & Knowledge Base' },
    { id: 'upload' as Page, label: 'Upload Info', icon: '📁', subtitle: 'Documents & Ticket Learning' },
    { id: 'settings' as Page, label: 'Settings', icon: '⚙️', subtitle: 'Integrations & Config' },
  ]

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Freshdesk AI</h1>
          <span className="sidebar-subtitle">Assistant</span>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
              onClick={() => setCurrentPage(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <div className="nav-text">
                <span className="nav-label">{item.label}</span>
                <span className="nav-subtitle">{item.subtitle}</span>
              </div>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <span className="user-email">{session.user.email}</span>
          </div>
          <button className="sign-out-btn" onClick={handleSignOut}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {business && (
          <>
            {/* Dashboard Page */}
            {currentPage === 'dashboard' && (
              <div className="page-content">
                <div className="page-header">
                  <h2>Dashboard</h2>
                  <p>Test AI responses and manage your knowledge base</p>
                </div>

                <div className="dashboard-grid">
                  {/* Test AI Section */}
                  <div className="card">
                    <div className="card-header">
                      <span className="card-icon">🤖</span>
                      <h3>Test AI Responses</h3>
                    </div>
                    <TestArea businessId={business.id} />
                  </div>

                  {/* Knowledge Base Documents */}
                  <div className="card">
                    <div className="card-header">
                      <span className="card-icon">📚</span>
                      <h3>Knowledge Base</h3>
                      <span className="doc-count">{documents.length} documents</span>
                    </div>
                    {docsLoading ? (
                      <div className="loading-state">
                        <span className="spinner"></span>
                        <p>Loading documents...</p>
                      </div>
                    ) : documents.length === 0 ? (
                      <div className="empty-state">
                        <p>No documents uploaded yet.</p>
                        <p>Go to <strong>Upload Info</strong> to add documents to your knowledge base.</p>
                        <button
                          className="btn btn-primary"
                          style={{ marginTop: '1rem' }}
                          onClick={() => setCurrentPage('upload')}
                        >
                          Upload Documents
                        </button>
                      </div>
                    ) : (
                      <ul className="document-list">
                        {documents.map((doc) => (
                          <li key={doc.id} className="document-item">
                            <div className="document-info">
                              <div className="document-name">{doc.name}</div>
                              <div className="document-meta">
                                Uploaded: {new Date(doc.created_at).toLocaleDateString()}
                              </div>
                            </div>
                            <div className="document-actions">
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => handleDeleteDocument(doc.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Upload Info Page */}
            {currentPage === 'upload' && (
              <div className="page-content">
                <div className="page-header">
                  <h2>Upload Info</h2>
                  <p>Add documents and learn from past tickets to build your knowledge base</p>
                </div>

                <div className="upload-grid">
                  {/* Document Upload */}
                  <div className="card">
                    <div className="card-header">
                      <span className="card-icon">📄</span>
                      <h3>Upload Documents</h3>
                    </div>
                    <DocumentUpload
                      businessId={business.id}
                      onUploaded={loadDocuments}
                    />
                  </div>

                  {/* Learn from Past Tickets */}
                  <div className="card">
                    <div className="card-header">
                      <span className="card-icon">🧠</span>
                      <h3>Learn from Past Tickets</h3>
                    </div>
                    <LearnFromTickets
                      business={business}
                      onLearned={loadDocuments}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Settings Page */}
            {currentPage === 'settings' && (
              <div className="page-content">
                <div className="page-header">
                  <h2>Settings</h2>
                  <p>Configure your integrations and business details</p>
                </div>

                <div className="settings-container">
                  <Settings business={business} onUpdate={handleBusinessUpdate} />
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default App
