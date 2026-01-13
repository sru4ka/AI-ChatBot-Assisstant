const axios = require('axios');

class ShopifyService {
  constructor() {
    this.storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
    this.accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    this.apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01';
    this.baseUrl = `https://${this.storeDomain}/admin/api/${this.apiVersion}`;
  }

  // Get axios config with auth headers
  getConfig() {
    return {
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json'
      }
    };
  }

  // Search orders by various criteria
  async searchOrders(params) {
    try {
      const queryParams = new URLSearchParams();

      // Build query parameters
      if (params.email) {
        queryParams.append('email', params.email);
      }
      if (params.orderId) {
        queryParams.append('ids', params.orderId);
      }
      if (params.name) {
        queryParams.append('name', params.name); // Order number like #1001
      }
      if (params.status) {
        queryParams.append('status', params.status); // any, open, closed, cancelled
      } else {
        queryParams.append('status', 'any');
      }

      queryParams.append('limit', params.limit || 10);

      const response = await axios.get(
        `${this.baseUrl}/orders.json?${queryParams.toString()}`,
        this.getConfig()
      );

      return response.data.orders || [];
    } catch (error) {
      throw new Error(`Failed to search orders: ${error.message}`);
    }
  }

  // Get order by ID
  async getOrder(orderId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/orders/${orderId}.json`,
        this.getConfig()
      );
      return response.data.order;
    } catch (error) {
      throw new Error(`Failed to fetch order: ${error.message}`);
    }
  }

  // Get order by order number (e.g., #1001)
  async getOrderByNumber(orderNumber) {
    try {
      // Remove # if present
      const cleanNumber = orderNumber.replace('#', '');

      const response = await axios.get(
        `${this.baseUrl}/orders.json?name=${cleanNumber}&status=any`,
        this.getConfig()
      );

      return response.data.orders[0] || null;
    } catch (error) {
      throw new Error(`Failed to fetch order by number: ${error.message}`);
    }
  }

  // Get customer orders by email
  async getCustomerOrders(email) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/orders.json?email=${encodeURIComponent(email)}&status=any&limit=50`,
        this.getConfig()
      );
      return response.data.orders || [];
    } catch (error) {
      throw new Error(`Failed to fetch customer orders: ${error.message}`);
    }
  }

  // Get order fulfillment status
  async getOrderFulfillments(orderId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/orders/${orderId}/fulfillments.json`,
        this.getConfig()
      );
      return response.data.fulfillments || [];
    } catch (error) {
      throw new Error(`Failed to fetch fulfillments: ${error.message}`);
    }
  }

  // Get customer by email
  async getCustomerByEmail(email) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/customers/search.json?query=email:${encodeURIComponent(email)}`,
        this.getConfig()
      );
      return response.data.customers[0] || null;
    } catch (error) {
      throw new Error(`Failed to fetch customer: ${error.message}`);
    }
  }

  // Get product by ID
  async getProduct(productId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/products/${productId}.json`,
        this.getConfig()
      );
      return response.data.product;
    } catch (error) {
      throw new Error(`Failed to fetch product: ${error.message}`);
    }
  }

  // Format order summary for AI context
  formatOrderSummary(order) {
    if (!order) return 'No order found';

    const items = order.line_items.map(item =>
      `- ${item.name} (x${item.quantity}) - $${item.price}`
    ).join('\n');

    const fulfillmentStatus = order.fulfillment_status || 'unfulfilled';
    const financialStatus = order.financial_status || 'pending';

    return `
Order #${order.order_number || order.name}
Status: ${fulfillmentStatus} / ${financialStatus}
Date: ${new Date(order.created_at).toLocaleDateString()}
Customer: ${order.customer?.first_name || ''} ${order.customer?.last_name || ''}
Email: ${order.email}

Items:
${items}

Subtotal: $${order.subtotal_price}
Shipping: $${order.total_shipping_price_set?.shop_money?.amount || '0.00'}
Total: $${order.total_price}

Shipping Address:
${order.shipping_address ? `${order.shipping_address.address1}, ${order.shipping_address.city}, ${order.shipping_address.province} ${order.shipping_address.zip}` : 'N/A'}

Tracking: ${order.fulfillments?.[0]?.tracking_number || 'Not available yet'}
`.trim();
  }
}

module.exports = new ShopifyService();
