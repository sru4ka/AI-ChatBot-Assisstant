const express = require('express');
const router = express.Router();
const aiService = require('../services/ai');

// Generate AI reply for a ticket
router.post('/generate', async (req, res, next) => {
  try {
    const {
      ticketSubject,
      customerMessage,
      customerEmail,
      customerName,
      includeOrderInfo,
      tone
    } = req.body;

    if (!customerMessage) {
      return res.status(400).json({
        success: false,
        error: 'customerMessage is required'
      });
    }

    const result = await aiService.generateReply({
      ticketSubject,
      customerMessage,
      customerEmail,
      customerName,
      includeOrderInfo: includeOrderInfo !== false,
      tone: tone || 'professional'
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// Get response templates by category
router.get('/templates/:category', async (req, res, next) => {
  try {
    const templates = await aiService.generateTemplates(req.params.category);
    res.json({
      success: true,
      category: req.params.category,
      templates
    });
  } catch (error) {
    next(error);
  }
});

// Test AI connection
router.get('/test', async (req, res, next) => {
  try {
    const result = await aiService.generateReply({
      ticketSubject: 'Test',
      customerMessage: 'This is a test message.',
      customerName: 'Test User',
      includeOrderInfo: false
    });

    res.json({
      success: true,
      message: 'AI service is working',
      testReply: result.reply.substring(0, 100) + '...'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `AI service error: ${error.message}`
    });
  }
});

module.exports = router;
