const OpenAI = require('openai');
const freshdeskService = require('./freshdesk');
const shopifyService = require('./shopify');
const knowledgeBaseService = require('./knowledgebase');

class AIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.model = process.env.OPENAI_MODEL || 'gpt-4';
  }

  // Generate reply for a ticket
  async generateReply(params) {
    const {
      ticketSubject,
      customerMessage,
      customerEmail,
      customerName,
      includeOrderInfo = true,
      includeKnowledgeBase = true,
      tone = 'professional'
    } = params;

    // Build context from various sources
    let context = '';

    // Get relevant knowledge base documents
    if (includeKnowledgeBase) {
      const relevantDocs = knowledgeBaseService.getRelevantDocuments(customerMessage, 3);
      if (relevantDocs.length > 0) {
        context += '\n\n--- KNOWLEDGE BASE INFORMATION ---\n';
        relevantDocs.forEach((doc, i) => {
          context += `\nDocument: ${doc.name}\n${doc.content}\n`;
        });
      }
    }

    // Get learned data from past tickets
    const learningData = freshdeskService.getLearningData();
    if (learningData.length > 0) {
      // Find similar tickets
      const similarTickets = this.findSimilarTickets(customerMessage, learningData);
      if (similarTickets.length > 0) {
        context += '\n\n--- SIMILAR PAST TICKETS ---\n';
        similarTickets.slice(0, 3).forEach((ticket, i) => {
          context += `\nExample ${i + 1}:\nCustomer: ${ticket.customerMessage.substring(0, 200)}...\nAgent Reply: ${ticket.agentReplies[0]?.substring(0, 300)}...\n`;
        });
      }
    }

    // Get Shopify order info if email provided
    let orderInfo = '';
    if (includeOrderInfo && customerEmail) {
      try {
        const orders = await shopifyService.getCustomerOrders(customerEmail);
        if (orders.length > 0) {
          const recentOrder = orders[0];
          orderInfo = shopifyService.formatOrderSummary(recentOrder);
          context += `\n\n--- CUSTOMER ORDER INFO ---\n${orderInfo}`;
        }
      } catch (err) {
        console.warn('Could not fetch Shopify orders:', err.message);
      }
    }

    // Build the prompt
    const systemPrompt = this.buildSystemPrompt(tone);
    const userPrompt = this.buildUserPrompt(ticketSubject, customerMessage, customerName, context);

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 1000
      });

      const reply = completion.choices[0]?.message?.content || '';

      return {
        reply,
        orderInfo: orderInfo || null,
        similarTicketsUsed: learningData.length > 0,
        knowledgeBaseUsed: includeKnowledgeBase && knowledgeBaseService.getAllDocuments().length > 0,
        model: this.model
      };
    } catch (error) {
      throw new Error(`AI generation failed: ${error.message}`);
    }
  }

  // Build system prompt based on tone
  buildSystemPrompt(tone) {
    const toneInstructions = {
      professional: 'Use a professional, helpful, and courteous tone.',
      friendly: 'Use a warm, friendly, and conversational tone while remaining helpful.',
      formal: 'Use a formal and business-like tone.',
      empathetic: 'Use an empathetic and understanding tone, acknowledging customer frustrations.'
    };

    return `You are a customer support agent for an e-commerce company. Your job is to help customers with their inquiries professionally and efficiently.

${toneInstructions[tone] || toneInstructions.professional}

Guidelines:
- Be concise but thorough
- Address the customer's specific question or concern
- If order information is provided, reference relevant details
- Offer solutions or next steps when appropriate
- Do not make up information you don't have
- If you reference an order, use the actual order details provided
- End with an offer to help further if needed

Format your response as a ready-to-send email reply (no subject line needed).`;
  }

  // Build user prompt with all context
  buildUserPrompt(subject, message, customerName, context) {
    return `Please write a reply to this customer support ticket:

TICKET SUBJECT: ${subject || 'No subject'}

CUSTOMER NAME: ${customerName || 'Customer'}

CUSTOMER MESSAGE:
${message}

${context ? `ADDITIONAL CONTEXT:${context}` : ''}

Write a helpful reply addressing their concerns:`;
  }

  // Find similar tickets using simple keyword matching
  findSimilarTickets(customerMessage, learningData) {
    const keywords = customerMessage.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 4);

    return learningData
      .map(ticket => {
        const ticketText = `${ticket.subject} ${ticket.customerMessage}`.toLowerCase();
        const matchCount = keywords.filter(kw => ticketText.includes(kw)).length;
        return { ...ticket, matchScore: matchCount };
      })
      .filter(ticket => ticket.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore);
  }

  // Generate quick response templates
  async generateTemplates(category) {
    const templates = {
      shipping: [
        "Thank you for reaching out about your order. Let me check the shipping status for you.",
        "I understand you're concerned about your shipment. I've looked into this and...",
        "Your order is currently in transit. You can track it using the tracking number provided."
      ],
      refund: [
        "I understand you'd like to request a refund. I'm happy to help with this.",
        "Thank you for contacting us about your refund request. Let me process this for you.",
        "I've reviewed your request and initiated the refund process. You should see the funds within 5-7 business days."
      ],
      product: [
        "Thank you for your question about our product. I'd be happy to provide more information.",
        "Great question! Here's what you need to know about this product...",
        "I appreciate your interest in our products. Let me help you find the right option."
      ],
      general: [
        "Thank you for contacting us. I'm here to help!",
        "I appreciate you reaching out. Let me assist you with this.",
        "Thanks for your message. I'll do my best to resolve this for you."
      ]
    };

    return templates[category] || templates.general;
  }
}

module.exports = new AIService();
