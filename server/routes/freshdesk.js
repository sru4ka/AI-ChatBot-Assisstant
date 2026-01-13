const express = require('express');
const router = express.Router();
const freshdeskService = require('../services/freshdesk');

// Get ticket by ID
router.get('/ticket/:id', async (req, res, next) => {
  try {
    const ticket = await freshdeskService.getTicket(req.params.id);
    res.json({
      success: true,
      data: ticket
    });
  } catch (error) {
    next(error);
  }
});

// Get ticket conversations
router.get('/ticket/:id/conversations', async (req, res, next) => {
  try {
    const conversations = await freshdeskService.getConversations(req.params.id);
    res.json({
      success: true,
      data: conversations
    });
  } catch (error) {
    next(error);
  }
});

// Learn from past tickets (scan 100-1000 tickets)
router.post('/learn', async (req, res, next) => {
  try {
    const count = Math.min(Math.max(req.body.count || 100, 1), 1000); // Between 1-1000

    console.log(`Starting to learn from ${count} tickets...`);

    const result = await freshdeskService.learnFromTickets(count);

    res.json({
      success: true,
      message: `Successfully learned from ${result.ticketsLearned} resolved tickets`,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// Get learning status
router.get('/learn/status', (req, res) => {
  const learningData = freshdeskService.getLearningData();
  res.json({
    success: true,
    ticketsLearned: learningData.length,
    hasData: learningData.length > 0
  });
});

// Search tickets
router.get('/search', async (req, res, next) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required'
      });
    }

    const tickets = await freshdeskService.searchTickets(query);
    res.json({
      success: true,
      data: tickets
    });
  } catch (error) {
    next(error);
  }
});

// Get customer by email
router.get('/customer', async (req, res, next) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }

    const customer = await freshdeskService.getCustomerByEmail(email);
    res.json({
      success: true,
      data: customer
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
