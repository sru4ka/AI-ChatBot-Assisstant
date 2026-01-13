const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

// Storage directory for documents
const STORAGE_DIR = path.join(__dirname, '../../data/knowledge-base');
const DOCUMENTS_FILE = path.join(STORAGE_DIR, 'documents.json');

class KnowledgeBaseService {
  constructor() {
    this.documents = [];
    this.ensureStorageExists();
    this.loadDocuments();
  }

  // Ensure storage directory exists
  ensureStorageExists() {
    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
    if (!fs.existsSync(DOCUMENTS_FILE)) {
      fs.writeFileSync(DOCUMENTS_FILE, JSON.stringify([]));
    }
  }

  // Load documents from storage
  loadDocuments() {
    try {
      const data = fs.readFileSync(DOCUMENTS_FILE, 'utf8');
      this.documents = JSON.parse(data);
    } catch (error) {
      console.warn('Could not load documents:', error.message);
      this.documents = [];
    }
  }

  // Save documents to storage
  saveDocuments() {
    try {
      fs.writeFileSync(DOCUMENTS_FILE, JSON.stringify(this.documents, null, 2));
    } catch (error) {
      console.error('Could not save documents:', error.message);
    }
  }

  // Get all documents
  getAllDocuments() {
    return this.documents.map(doc => ({
      id: doc.id,
      name: doc.name,
      type: doc.type,
      size: doc.size,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      contentPreview: doc.content.substring(0, 200) + (doc.content.length > 200 ? '...' : '')
    }));
  }

  // Get document by ID
  getDocument(id) {
    return this.documents.find(doc => doc.id === id);
  }

  // Add document from text
  addTextDocument(name, content) {
    const doc = {
      id: uuidv4(),
      name: name || 'Untitled Document',
      type: 'text',
      content: content,
      size: Buffer.byteLength(content, 'utf8'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.documents.push(doc);
    this.saveDocuments();

    return doc;
  }

  // Process uploaded file
  async processFile(file) {
    const ext = path.extname(file.originalname).toLowerCase();
    let content = '';
    let type = '';

    switch (ext) {
      case '.txt':
        content = file.buffer.toString('utf8');
        type = 'txt';
        break;

      case '.md':
        content = file.buffer.toString('utf8');
        type = 'markdown';
        break;

      case '.json':
        content = file.buffer.toString('utf8');
        type = 'json';
        break;

      case '.pdf':
        content = await this.extractPdfText(file.buffer);
        type = 'pdf';
        break;

      case '.docx':
        content = await this.extractWordText(file.buffer);
        type = 'docx';
        break;

      case '.doc':
        // .doc files (old Word format) are harder to parse
        // We'll try mammoth but it might not work perfectly
        try {
          content = await this.extractWordText(file.buffer);
          type = 'doc';
        } catch (e) {
          throw new Error('Old .doc format not supported. Please save as .docx');
        }
        break;

      default:
        throw new Error(`Unsupported file format: ${ext}. Supported: .txt, .md, .json, .pdf, .docx`);
    }

    const doc = {
      id: uuidv4(),
      name: file.originalname,
      type: type,
      content: content,
      size: file.size,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.documents.push(doc);
    this.saveDocuments();

    return doc;
  }

  // Extract text from PDF
  async extractPdfText(buffer) {
    try {
      const data = await pdfParse(buffer);
      return data.text;
    } catch (error) {
      throw new Error(`Failed to parse PDF: ${error.message}`);
    }
  }

  // Extract text from Word document
  async extractWordText(buffer) {
    try {
      const result = await mammoth.extractRawText({ buffer: buffer });
      return result.value;
    } catch (error) {
      throw new Error(`Failed to parse Word document: ${error.message}`);
    }
  }

  // Update document
  updateDocument(id, updates) {
    const index = this.documents.findIndex(doc => doc.id === id);
    if (index === -1) {
      throw new Error('Document not found');
    }

    if (updates.name) {
      this.documents[index].name = updates.name;
    }
    if (updates.content) {
      this.documents[index].content = updates.content;
      this.documents[index].size = Buffer.byteLength(updates.content, 'utf8');
    }
    this.documents[index].updatedAt = new Date().toISOString();

    this.saveDocuments();
    return this.documents[index];
  }

  // Delete document
  deleteDocument(id) {
    const index = this.documents.findIndex(doc => doc.id === id);
    if (index === -1) {
      throw new Error('Document not found');
    }

    const deleted = this.documents.splice(index, 1)[0];
    this.saveDocuments();
    return deleted;
  }

  // Search documents
  searchDocuments(query) {
    const lowerQuery = query.toLowerCase();
    return this.documents.filter(doc =>
      doc.name.toLowerCase().includes(lowerQuery) ||
      doc.content.toLowerCase().includes(lowerQuery)
    ).map(doc => ({
      id: doc.id,
      name: doc.name,
      type: doc.type,
      matchedContent: this.getMatchContext(doc.content, query)
    }));
  }

  // Get context around matched text
  getMatchContext(content, query, contextLength = 100) {
    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerContent.indexOf(lowerQuery);

    if (index === -1) return '';

    const start = Math.max(0, index - contextLength);
    const end = Math.min(content.length, index + query.length + contextLength);

    let context = content.substring(start, end);
    if (start > 0) context = '...' + context;
    if (end < content.length) context = context + '...';

    return context;
  }

  // Get all document content for AI context
  getAllContentForAI() {
    return this.documents.map(doc => ({
      name: doc.name,
      content: doc.content
    }));
  }

  // Get relevant documents for a query (for AI context)
  getRelevantDocuments(query, maxDocs = 3) {
    const results = this.searchDocuments(query);
    return results.slice(0, maxDocs).map(result => {
      const doc = this.getDocument(result.id);
      return {
        name: doc.name,
        content: doc.content.substring(0, 2000) // Limit for AI context
      };
    });
  }

  // Get statistics
  getStats() {
    return {
      totalDocuments: this.documents.length,
      totalSize: this.documents.reduce((sum, doc) => sum + doc.size, 0),
      byType: this.documents.reduce((acc, doc) => {
        acc[doc.type] = (acc[doc.type] || 0) + 1;
        return acc;
      }, {})
    };
  }
}

module.exports = new KnowledgeBaseService();
