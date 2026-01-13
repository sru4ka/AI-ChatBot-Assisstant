const express = require('express');
const router = express.Router();

// Health check endpoint
router.get('/', (req, res) => {
  const config = {
    freshdesk: !!(process.env.FRESHDESK_DOMAIN && process.env.FRESHDESK_API_KEY),
    openai: !!process.env.OPENAI_API_KEY,
    shopify: !!(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ACCESS_TOKEN)
  };

  res.json({
    success: true,
    status: 'running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    configuration: config,
    allConfigured: Object.values(config).every(v => v)
  });
});

// Detailed configuration check
router.get('/config', (req, res) => {
  res.json({
    success: true,
    configuration: {
      freshdesk: {
        configured: !!(process.env.FRESHDESK_DOMAIN && process.env.FRESHDESK_API_KEY),
        domain: process.env.FRESHDESK_DOMAIN ? `${process.env.FRESHDESK_DOMAIN.substring(0, 10)}...` : 'Not set'
      },
      openai: {
        configured: !!process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-4'
      },
      shopify: {
        configured: !!(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ACCESS_TOKEN),
        domain: process.env.SHOPIFY_STORE_DOMAIN ? `${process.env.SHOPIFY_STORE_DOMAIN.substring(0, 10)}...` : 'Not set'
      }
    }
  });
});

module.exports = router;
