const axios = require('axios');
const NodeCache = require('node-cache');

// Cache for learned tickets (TTL: 1 hour)
const ticketCache = new NodeCache({ stdTTL: 3600 });

class FreshdeskService {
  constructor() {
    this.domain = process.env.FRESHDESK_DOMAIN;
    this.apiKey = process.env.FRESHDESK_API_KEY;
    this.baseUrl = `https://${this.domain}/api/v2`;
  }

  // Get axios config with auth
  getConfig() {
    return {
      auth: {
        username: this.apiKey,
        password: 'X' // Freshdesk uses API key as username, any string as password
      },
      headers: {
        'Content-Type': 'application/json'
      }
    };
  }

  // Get a single ticket by ID
  async getTicket(ticketId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/tickets/${ticketId}?include=conversations`,
        this.getConfig()
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch ticket: ${error.message}`);
    }
  }

  // Get ticket conversations
  async getConversations(ticketId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/tickets/${ticketId}/conversations`,
        this.getConfig()
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch conversations: ${error.message}`);
    }
  }

  // Fetch multiple tickets for learning
  async fetchTicketsForLearning(count = 100) {
    try {
      const tickets = [];
      const perPage = 100; // Freshdesk max per page
      const pages = Math.ceil(Math.min(count, 1000) / perPage); // Max 1000 tickets

      for (let page = 1; page <= pages; page++) {
        const response = await axios.get(
          `${this.baseUrl}/tickets?per_page=${perPage}&page=${page}&include=description&order_by=updated_at&order_type=desc`,
          this.getConfig()
        );

        tickets.push(...response.data);

        if (response.data.length < perPage) break; // No more tickets
        if (tickets.length >= count) break;

        // Rate limiting - Freshdesk allows 50 requests per minute
        await this.delay(1200);
      }

      return tickets.slice(0, count);
    } catch (error) {
      throw new Error(`Failed to fetch tickets: ${error.message}`);
    }
  }

  // Learn from tickets - extracts patterns for AI training
  async learnFromTickets(count = 100) {
    const tickets = await this.fetchTicketsForLearning(count);
    const learningData = [];

    for (const ticket of tickets) {
      try {
        // Get conversations for resolved tickets
        if (ticket.status >= 4) { // Status 4 = Resolved, 5 = Closed
          const conversations = await this.getConversations(ticket.id);

          // Find agent replies
          const agentReplies = conversations.filter(c => !c.incoming);

          if (agentReplies.length > 0) {
            learningData.push({
              ticketId: ticket.id,
              subject: ticket.subject,
              customerMessage: this.stripHtml(ticket.description_text || ticket.description),
              agentReplies: agentReplies.map(r => this.stripHtml(r.body_text || r.body)),
              tags: ticket.tags || [],
              type: ticket.type,
              priority: ticket.priority
            });
          }

          // Rate limiting
          await this.delay(1200);
        }
      } catch (err) {
        console.warn(`Skipping ticket ${ticket.id}: ${err.message}`);
      }
    }

    // Cache the learning data
    ticketCache.set('learningData', learningData);

    return {
      ticketsProcessed: tickets.length,
      ticketsLearned: learningData.length,
      patterns: this.extractPatterns(learningData)
    };
  }

  // Extract common patterns from learning data
  extractPatterns(learningData) {
    const patterns = {
      commonTopics: {},
      responseTemplates: []
    };

    learningData.forEach(item => {
      // Count topics from tags
      item.tags.forEach(tag => {
        patterns.commonTopics[tag] = (patterns.commonTopics[tag] || 0) + 1;
      });

      // Store response templates
      if (item.agentReplies.length > 0) {
        patterns.responseTemplates.push({
          topic: item.subject,
          response: item.agentReplies[0].substring(0, 500)
        });
      }
    });

    return patterns;
  }

  // Get cached learning data
  getLearningData() {
    return ticketCache.get('learningData') || [];
  }

  // Helper: Strip HTML tags
  stripHtml(html) {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Helper: Delay for rate limiting
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Search tickets by query
  async searchTickets(query) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/search/tickets?query="${encodeURIComponent(query)}"`,
        this.getConfig()
      );
      return response.data.results || [];
    } catch (error) {
      throw new Error(`Failed to search tickets: ${error.message}`);
    }
  }

  // Get customer by email
  async getCustomerByEmail(email) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/contacts?email=${encodeURIComponent(email)}`,
        this.getConfig()
      );
      return response.data[0] || null;
    } catch (error) {
      throw new Error(`Failed to fetch customer: ${error.message}`);
    }
  }
}

module.exports = new FreshdeskService();
