require('dotenv').config();
const express = require('express');
const cors = require('cors');
const freshdeskRoutes = require('./routes/freshdesk');
const shopifyRoutes = require('./routes/shopify');
const aiRoutes = require('./routes/ai');
const healthRoutes = require('./routes/health');
const knowledgeBaseRoutes = require('./routes/knowledgebase');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: '*', // Allow browser extension
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/freshdesk', freshdeskRoutes);
app.use('/api/shopify', shopifyRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/knowledge-base', knowledgeBaseRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═════════════════════════════════════════════════════════════════╗
║           Freshdesk AI Assistant Server Started                 ║
╠═════════════════════════════════════════════════════════════════╣
║  Server running on: http://localhost:${PORT}                       ║
║                                                                 ║
║  Endpoints:                                                     ║
║  - GET  /api/health                - Check server status        ║
║  - GET  /api/freshdesk/ticket/:id  - Get ticket details         ║
║  - POST /api/freshdesk/learn       - Learn from past tickets    ║
║  - GET  /api/shopify/orders        - Search orders              ║
║  - POST /api/ai/generate           - Generate AI reply          ║
║  - GET  /api/knowledge-base/documents - List all documents      ║
║  - POST /api/knowledge-base/upload    - Upload PDF/DOCX/TXT     ║
║  - POST /api/knowledge-base/documents - Add text document       ║
╚═════════════════════════════════════════════════════════════════╝
  `);

  // Validate configuration
  const missingConfigs = [];
  if (!process.env.FRESHDESK_DOMAIN) missingConfigs.push('FRESHDESK_DOMAIN');
  if (!process.env.FRESHDESK_API_KEY) missingConfigs.push('FRESHDESK_API_KEY');
  if (!process.env.OPENAI_API_KEY) missingConfigs.push('OPENAI_API_KEY');
  if (!process.env.SHOPIFY_STORE_DOMAIN) missingConfigs.push('SHOPIFY_STORE_DOMAIN');
  if (!process.env.SHOPIFY_ACCESS_TOKEN) missingConfigs.push('SHOPIFY_ACCESS_TOKEN');

  if (missingConfigs.length > 0) {
    console.warn('\n⚠️  Warning: Missing configuration:');
    missingConfigs.forEach(config => console.warn(`   - ${config}`));
    console.warn('\n   Please check your .env file.\n');
  } else {
    console.log('✅ All API configurations loaded successfully.\n');
  }
});

module.exports = app;
