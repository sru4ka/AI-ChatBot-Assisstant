# Freshdesk AI Assistant - API Reference

Base URL: `http://localhost:3000/api`

## Table of Contents
1. [Health Check](#health-check)
2. [Freshdesk Endpoints](#freshdesk-endpoints)
3. [Shopify Endpoints](#shopify-endpoints)
4. [AI Endpoints](#ai-endpoints)

---

## Health Check

### GET /api/health
Check server status and configuration.

**Response:**
```json
{
  "success": true,
  "status": "running",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0",
  "configuration": {
    "freshdesk": true,
    "openai": true,
    "shopify": true
  },
  "allConfigured": true
}
```

### GET /api/health/config
Get detailed configuration status.

**Response:**
```json
{
  "success": true,
  "configuration": {
    "freshdesk": {
      "configured": true,
      "domain": "yourcompan..."
    },
    "openai": {
      "configured": true,
      "model": "gpt-4"
    },
    "shopify": {
      "configured": true,
      "domain": "yourstore...."
    }
  }
}
```

---

## Freshdesk Endpoints

### GET /api/freshdesk/ticket/:id
Get a single ticket by ID.

**Parameters:**
- `id` (path) - Ticket ID

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 123,
    "subject": "Order not received",
    "description": "...",
    "status": 2,
    "priority": 2,
    "requester_id": 456,
    "conversations": [...]
  }
}
```

### GET /api/freshdesk/ticket/:id/conversations
Get all conversations for a ticket.

**Parameters:**
- `id` (path) - Ticket ID

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 789,
      "body": "Customer message...",
      "incoming": true,
      "created_at": "2024-01-15T10:00:00Z"
    },
    {
      "id": 790,
      "body": "Agent response...",
      "incoming": false,
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### POST /api/freshdesk/learn
Learn from past tickets to improve AI responses.

**Request Body:**
```json
{
  "count": 100
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| count | number | No | Number of tickets to learn from (1-1000, default: 100) |

**Response:**
```json
{
  "success": true,
  "message": "Successfully learned from 85 resolved tickets",
  "data": {
    "ticketsProcessed": 100,
    "ticketsLearned": 85,
    "patterns": {
      "commonTopics": {
        "shipping": 25,
        "refund": 15,
        "product": 20
      },
      "responseTemplates": [...]
    }
  }
}
```

### GET /api/freshdesk/learn/status
Get current learning status.

**Response:**
```json
{
  "success": true,
  "ticketsLearned": 85,
  "hasData": true
}
```

### GET /api/freshdesk/search
Search tickets.

**Query Parameters:**
- `query` (required) - Search query string

**Example:** `/api/freshdesk/search?query=shipping delay`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "subject": "Shipping delay inquiry",
      "status": 4
    }
  ]
}
```

### GET /api/freshdesk/customer
Get customer by email.

**Query Parameters:**
- `email` (required) - Customer email

**Example:** `/api/freshdesk/customer?email=customer@example.com`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 456,
    "name": "John Doe",
    "email": "customer@example.com",
    "phone": "+1234567890"
  }
}
```

---

## Shopify Endpoints

### GET /api/shopify/orders
Search orders by various criteria.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| email | string | Customer email |
| orderId | string | Shopify order ID |
| name | string | Order number (e.g., #1001) |
| status | string | Order status (any, open, closed, cancelled) |
| limit | number | Max results (default: 10) |

**Example:** `/api/shopify/orders?email=customer@example.com`

**Response:**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "id": 123456789,
      "orderNumber": "#1001",
      "email": "customer@example.com",
      "totalPrice": "99.99",
      "currency": "USD",
      "financialStatus": "paid",
      "fulfillmentStatus": "fulfilled",
      "createdAt": "2024-01-10T12:00:00Z",
      "lineItems": 2,
      "summary": "Order #1001\nStatus: fulfilled / paid\n..."
    }
  ]
}
```

### GET /api/shopify/order/:id
Get single order by Shopify ID.

**Parameters:**
- `id` (path) - Shopify order ID

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 123456789,
    "name": "#1001",
    "email": "customer@example.com",
    "total_price": "99.99",
    "line_items": [...],
    "shipping_address": {...}
  },
  "summary": "Order #1001\nStatus: fulfilled / paid\n..."
}
```

### GET /api/shopify/order/number/:number
Get order by order number.

**Parameters:**
- `number` (path) - Order number (with or without #)

**Example:** `/api/shopify/order/number/1001` or `/api/shopify/order/number/%231001`

**Response:**
Same as GET /api/shopify/order/:id

### GET /api/shopify/customer/orders
Get all orders for a customer.

**Query Parameters:**
- `email` (required) - Customer email

**Example:** `/api/shopify/customer/orders?email=customer@example.com`

**Response:**
```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "id": 123456789,
      "orderNumber": "#1001",
      "totalPrice": "99.99",
      "financialStatus": "paid",
      "fulfillmentStatus": "fulfilled",
      "createdAt": "2024-01-10T12:00:00Z"
    }
  ]
}
```

### GET /api/shopify/order/:id/tracking
Get fulfillment/tracking info for an order.

**Parameters:**
- `id` (path) - Shopify order ID

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 987654321,
      "status": "success",
      "trackingCompany": "USPS",
      "trackingNumber": "1234567890",
      "trackingUrl": "https://tracking.usps.com/...",
      "createdAt": "2024-01-11T14:00:00Z"
    }
  ]
}
```

### GET /api/shopify/customer
Get customer details by email.

**Query Parameters:**
- `email` (required) - Customer email

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 111222333,
    "email": "customer@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+1234567890",
    "ordersCount": 5,
    "totalSpent": "499.95",
    "createdAt": "2023-06-15T10:00:00Z"
  }
}
```

---

## AI Endpoints

### POST /api/ai/generate
Generate an AI reply for a customer message.

**Request Body:**
```json
{
  "ticketSubject": "Order not received",
  "customerMessage": "Hi, I placed an order 2 weeks ago...",
  "customerEmail": "customer@example.com",
  "customerName": "John Doe",
  "includeOrderInfo": true,
  "tone": "professional"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| ticketSubject | string | No | Subject line of the ticket |
| customerMessage | string | Yes | The customer's message |
| customerEmail | string | No | Customer email (for order lookup) |
| customerName | string | No | Customer name |
| includeOrderInfo | boolean | No | Fetch Shopify order info (default: true) |
| tone | string | No | Response tone: professional, friendly, formal, empathetic |

**Response:**
```json
{
  "success": true,
  "data": {
    "reply": "Dear John,\n\nThank you for reaching out...",
    "orderInfo": "Order #1001\nStatus: fulfilled...",
    "similarTicketsUsed": true,
    "model": "gpt-4"
  }
}
```

### GET /api/ai/templates/:category
Get pre-built response templates.

**Parameters:**
- `category` (path) - Template category: shipping, refund, product, general

**Example:** `/api/ai/templates/shipping`

**Response:**
```json
{
  "success": true,
  "category": "shipping",
  "templates": [
    "Thank you for reaching out about your order. Let me check the shipping status for you.",
    "I understand you're concerned about your shipment. I've looked into this and...",
    "Your order is currently in transit. You can track it using the tracking number provided."
  ]
}
```

### GET /api/ai/test
Test the AI service connection.

**Response:**
```json
{
  "success": true,
  "message": "AI service is working",
  "testReply": "Thank you for your message. I'm here to help..."
}
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

Common HTTP status codes:
- `400` - Bad request (missing required parameters)
- `404` - Resource not found
- `500` - Server error

---

## Rate Limits

- **Freshdesk API**: 50 requests per minute
- **Shopify API**: 2 requests per second (REST)
- **OpenAI API**: Varies by plan

The server automatically handles rate limiting for Freshdesk and Shopify APIs.
