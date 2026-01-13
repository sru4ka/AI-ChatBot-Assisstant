const express = require('express');
const multer = require('multer');
const router = express.Router();
const knowledgeBaseService = require('../services/knowledgebase');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.txt', '.md', '.json', '.pdf', '.docx', '.doc'];
    const ext = '.' + file.originalname.split('.').pop().toLowerCase();

    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not supported. Allowed: ${allowedTypes.join(', ')}`));
    }
  }
});

// Get all documents
router.get('/documents', (req, res) => {
  try {
    const documents = knowledgeBaseService.getAllDocuments();
    res.json({
      success: true,
      count: documents.length,
      data: documents
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get document by ID
router.get('/documents/:id', (req, res) => {
  try {
    const doc = knowledgeBaseService.getDocument(req.params.id);

    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    res.json({
      success: true,
      data: doc
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Upload file
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file provided'
      });
    }

    const doc = await knowledgeBaseService.processFile(req.file);

    res.json({
      success: true,
      message: 'Document uploaded and processed successfully',
      data: {
        id: doc.id,
        name: doc.name,
        type: doc.type,
        size: doc.size,
        contentPreview: doc.content.substring(0, 200) + '...'
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Upload multiple files
router.post('/upload-multiple', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files provided'
      });
    }

    const results = [];
    const errors = [];

    for (const file of req.files) {
      try {
        const doc = await knowledgeBaseService.processFile(file);
        results.push({
          name: doc.name,
          id: doc.id,
          status: 'success'
        });
      } catch (error) {
        errors.push({
          name: file.originalname,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: `Processed ${results.length} files, ${errors.length} errors`,
      data: {
        uploaded: results,
        errors: errors
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Add document from text
router.post('/documents', (req, res) => {
  try {
    const { name, content } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Content is required'
      });
    }

    const doc = knowledgeBaseService.addTextDocument(name, content);

    res.json({
      success: true,
      message: 'Document added successfully',
      data: {
        id: doc.id,
        name: doc.name,
        type: doc.type,
        size: doc.size
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Update document
router.put('/documents/:id', (req, res) => {
  try {
    const { name, content } = req.body;
    const doc = knowledgeBaseService.updateDocument(req.params.id, { name, content });

    res.json({
      success: true,
      message: 'Document updated successfully',
      data: {
        id: doc.id,
        name: doc.name,
        updatedAt: doc.updatedAt
      }
    });
  } catch (error) {
    if (error.message === 'Document not found') {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Delete document
router.delete('/documents/:id', (req, res) => {
  try {
    const doc = knowledgeBaseService.deleteDocument(req.params.id);

    res.json({
      success: true,
      message: 'Document deleted successfully',
      data: {
        id: doc.id,
        name: doc.name
      }
    });
  } catch (error) {
    if (error.message === 'Document not found') {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Search documents
router.get('/search', (req, res) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required'
      });
    }

    const results = knowledgeBaseService.searchDocuments(query);

    res.json({
      success: true,
      count: results.length,
      data: results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get statistics
router.get('/stats', (req, res) => {
  try {
    const stats = knowledgeBaseService.getStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 10MB'
      });
    }
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }
  next(error);
});

module.exports = router;
