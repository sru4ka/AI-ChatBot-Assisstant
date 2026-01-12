import { useState, useEffect } from 'react'
import { supabase, Business, Document } from '../lib/supabase'
import DocumentUpload from './DocumentUpload'
import Settings from './Settings'
import TestArea from './TestArea'

interface DashboardProps {
  business: Business
  onBusinessUpdate: (business: Business) => void
}

export default function Dashboard({ business, onBusinessUpdate }: DashboardProps) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDocuments()
  }, [business.id])

  async function loadDocuments() {
    setLoading(true)
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
      setLoading(false)
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

  function handleDocumentUploaded() {
    loadDocuments()
  }

  return (
    <div className="dashboard">
      {/* Settings Section */}
      <div className="card">
        <h3>Settings</h3>
        <Settings business={business} onUpdate={onBusinessUpdate} />
      </div>

      {/* Document Upload Section */}
      <div className="card">
        <h3>Upload Documents</h3>
        <DocumentUpload
          businessId={business.id}
          onUploaded={handleDocumentUploaded}
        />
      </div>

      {/* Documents List Section */}
      <div className="card">
        <h3>Knowledge Base Documents</h3>
        {loading ? (
          <p>Loading documents...</p>
        ) : documents.length === 0 ? (
          <div className="empty-state">
            <p>No documents uploaded yet.</p>
            <p>Upload your first document to build your knowledge base.</p>
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
                    className="btn btn-danger"
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

      {/* Test Area Section */}
      <div className="card">
        <h3>Test AI Responses</h3>
        <TestArea businessId={business.id} />
      </div>
    </div>
  )
}
