import { useState, useRef } from 'react'
import { ingestDocument } from '../lib/supabase'
import * as pdfjsLib from 'pdfjs-dist'
import mammoth from 'mammoth'

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

interface DocumentUploadProps {
  businessId: string
  onUploaded: () => void
}

type FileType = 'txt' | 'md' | 'json' | 'pdf' | 'docx' | 'unknown'

function getFileType(file: File): FileType {
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  if (ext === 'txt') return 'txt'
  if (ext === 'md') return 'md'
  if (ext === 'json') return 'json'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx' || ext === 'doc') return 'docx'
  return 'unknown'
}

export default function DocumentUpload({ businessId, onUploaded }: DocumentUploadProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setLoading(true)
    setError(null)
    setSuccess(null)
    setProgress(null)

    try {
      const fileType = getFileType(file)
      setProgress(`Reading ${file.name}...`)

      let content: string

      switch (fileType) {
        case 'pdf':
          setProgress('Extracting text from PDF...')
          content = await extractPdfText(file)
          break
        case 'docx':
          setProgress('Extracting text from Word document...')
          content = await extractWordText(file)
          break
        case 'txt':
        case 'md':
        case 'json':
          content = await readTextFile(file)
          break
        default:
          // Try reading as text
          content = await readTextFile(file)
      }

      if (!content.trim()) {
        throw new Error('Document appears to be empty or could not be read')
      }

      setProgress(`Uploading ${file.name} to knowledge base...`)

      // Ingest the document
      const result = await ingestDocument(businessId, content, file.name)

      setSuccess(`Successfully uploaded "${file.name}" (${result.chunkCount} chunks created)`)
      onUploaded()

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err) {
      console.error('Upload error:', err)
      setError(err instanceof Error ? err.message : 'Failed to upload document')
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  async function readTextFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target?.result as string)
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsText(file)
    })
  }

  async function extractPdfText(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const textParts: string[] = []

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ')
      textParts.push(pageText)
    }

    return textParts.join('\n\n')
  }

  async function extractWordText(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    return result.value
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      handleFile(file)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)

    const file = e.dataTransfer.files?.[0]
    if (file) {
      handleFile(file)
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave() {
    setDragOver(false)
  }

  function handleClick() {
    fileInputRef.current?.click()
  }

  return (
    <div>
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <div
        className={`upload-area ${dragOver ? 'dragover' : ''}`}
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.json,.pdf,.docx,.doc"
          onChange={handleFileSelect}
          disabled={loading}
        />
        {loading ? (
          <div>
            <span className="spinner" style={{ borderColor: '#667eea', borderTopColor: 'transparent' }} />
            <p>{progress || 'Processing document...'}</p>
          </div>
        ) : (
          <>
            <p>Drag and drop a file here, or click to select</p>
            <p style={{ fontSize: '0.85rem', color: '#999' }}>
              Supported formats: PDF, Word (.docx), Text (.txt), Markdown (.md), JSON
            </p>
          </>
        )}
      </div>

      {/* Manual text input option */}
      <TextUpload businessId={businessId} onUploaded={onUploaded} />
    </div>
  )
}

// Sub-component for manual text input
function TextUpload({ businessId, onUploaded }: { businessId: string; onUploaded: () => void }) {
  const [content, setContent] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!content.trim() || !name.trim()) {
      setError('Please provide both a name and content')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await ingestDocument(businessId, content, name)
      setContent('')
      setName('')
      onUploaded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <h4 style={{ marginBottom: '1rem', color: '#666' }}>Or paste text directly</h4>

      {error && <div className="error-message">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="docName">Document Name</label>
          <input
            id="docName"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., FAQ, Return Policy"
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="docContent">Content</label>
          <textarea
            id="docContent"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste your document content here..."
            rows={6}
            disabled={loading}
          />
        </div>

        <button type="submit" className="btn btn-secondary" disabled={loading}>
          {loading && <span className="spinner" style={{ borderColor: '#333', borderTopColor: 'transparent' }} />}
          Add to Knowledge Base
        </button>
      </form>
    </div>
  )
}
