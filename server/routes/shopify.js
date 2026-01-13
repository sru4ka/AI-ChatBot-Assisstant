const express = require('express');
const router = express.Router();
const shopifyService = require('../services/shopify');

// Search orders
router.get('/orders', async (req, res, next) => {
  try {
    const { email, orderId, name, status, limit } = req.query;

    if (!email && !orderId && !name) {
      return res.status(400).json({
        success: false,
        error: 'At least one search parameter required: email, orderId, or name (order number)'
      });
    }

    const orders = await shopifyService.searchOrders({
      email,
      orderId,
      name,
      status,
      limit: parseInt(limit) || 10
    });

    res.json({
      success: true,
      count: orders.length,
      data: orders.map(order => ({
        id: order.id,
        orderNumber: order.name,
        email: order.email,
        totalPrice: order.total_price,
        currency: order.currency,
        financialStatus: order.financial_status,
        fulfillmentStatus: order.fulfillment_status,
        createdAt: order.created_at,
        lineItems: order.line_items?.length || 0,
        summary: shopifyService.formatOrderSummary(order)
      }))
    });
  } catch (error) {
    next(error);
  }
});

// Get single order by ID
router.get('/order/:id', async (req, res, next) => {
  try {
    const order = await shopifyService.getOrder(req.params.id);
    res.json({
      success: true,
      data: order,
      summary: shopifyService.formatOrderSummary(order)
    });
  } catch (error) {
    next(error);
  }
});

// Get order by order number (e.g., #1001)
router.get('/order/number/:number', async (req, res, next) => {
  try {
    const order = await shopifyService.getOrderByNumber(req.params.number);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    res.json({
      success: true,
      data: order,
      summary: shopifyService.formatOrderSummary(order)
    });
  } catch (error) {
    next(error);
  }
});

// Get customer orders by email
router.get('/customer/orders', async (req, res, next) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }

    const orders = await shopifyService.getCustomerOrders(email);

    res.json({
      success: true,
      count: orders.length,
      data: orders.map(order => ({
        id: order.id,
        orderNumber: order.name,
        totalPrice: order.total_price,
        financialStatus: order.financial_status,
        fulfillmentStatus: order.fulfillment_status,
        createdAt: order.created_at
      }))
    });
  } catch (error) {
    next(error);
  }
});

// Get order fulfillment/tracking info
router.get('/order/:id/tracking', async (req, res, next) => {
  try {
    const fulfillments = await shopifyService.getOrderFulfillments(req.params.id);

    res.json({
      success: true,
      data: fulfillments.map(f => ({
        id: f.id,
        status: f.status,
        trackingCompany: f.tracking_company,
        trackingNumber: f.tracking_number,
        trackingUrl: f.tracking_url,
        createdAt: f.created_at
      }))
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

    const customer = await shopifyService.getCustomerByEmail(email);

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    res.json({
      success: true,
      data: {
        id: customer.id,
        email: customer.email,
        firstName: customer.first_name,
        lastName: customer.last_name,
        phone: customer.phone,
        ordersCount: customer.orders_count,
        totalSpent: customer.total_spent,
        createdAt: customer.created_at
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
