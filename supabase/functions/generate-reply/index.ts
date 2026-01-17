import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI from 'https://esm.sh/openai@4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
}

interface RequestBody {
  businessId: string
  customerMessage: string
  tone?: 'professional' | 'friendly' | 'concise'
  customPrompt?: string
  oneTimeInstructions?: string // For regeneration guidance
}

interface ChunkResult {
  content: string
  similarity: number
}

interface ShopifyOrder {
  id: number
  name: string
  email: string
  total_price: string
  currency: string
  financial_status: string
  fulfillment_status: string | null
  created_at: string
  line_items: Array<{ title: string; quantity: number; price: string }>
  tracking_numbers?: string[]
  note?: string
}

/**
 * Extract order numbers from text (e.g., #1234, Order 1234, order #1234)
 */
function extractOrderNumbers(text: string): string[] {
  const patterns = [
    /#(\d{3,})/g,                    // #1234
    /order\s*#?\s*(\d{3,})/gi,       // Order 1234, order #1234
    /order\s+number\s*:?\s*(\d{3,})/gi, // Order number: 1234
  ]

  const orderNumbers = new Set<string>()
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      orderNumbers.add(match[1])
    }
  }

  return Array.from(orderNumbers)
}

/**
 * Fetch Shopify orders by order numbers
 */
async function fetchShopifyOrders(
  storeDomain: string,
  accessToken: string,
  orderNumbers: string[]
): Promise<ShopifyOrder[]> {
  const orders: ShopifyOrder[] = []
  const apiVersion = '2024-01'

  for (const orderNum of orderNumbers.slice(0, 3)) { // Limit to 3 orders
    try {
      const url = `https://${storeDomain}/admin/api/${apiVersion}/orders.json?status=any&name=%23${orderNum}`
      const response = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const data = await response.json()
        if (data.orders && data.orders.length > 0) {
          const order = data.orders[0]

          // Try to get tracking numbers
          try {
            const fulfillmentsUrl = `https://${storeDomain}/admin/api/${apiVersion}/orders/${order.id}/fulfillments.json`
            const fulfillmentsResponse = await fetch(fulfillmentsUrl, {
              headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json',
              },
            })
            if (fulfillmentsResponse.ok) {
              const fulfillmentsData = await fulfillmentsResponse.json()
              order.tracking_numbers = (fulfillmentsData.fulfillments || [])
                .map((f: { tracking_number?: string }) => f.tracking_number)
                .filter(Boolean)
            }
          } catch (e) {
            // Continue without tracking
          }

          orders.push(order)
        }
      }
    } catch (e) {
      console.warn(`Error fetching order ${orderNum}:`, e)
    }
  }

  return orders
}

/**
 * Format order data for AI context
 */
function formatOrdersForAI(orders: ShopifyOrder[]): string {
  if (orders.length === 0) return ''

  return orders.map(order => {
    const lines = [
      `ORDER ${order.name}:`,
      `- Customer Email: ${order.email}`,
      `- Order Date: ${new Date(order.created_at).toLocaleDateString()}`,
      `- Payment Status: ${order.financial_status}`,
      `- Fulfillment Status: ${order.fulfillment_status || 'Not yet fulfilled'}`,
      `- Total: ${order.total_price} ${order.currency}`,
    ]

    if (order.line_items && order.line_items.length > 0) {
      lines.push('- Items Ordered:')
      order.line_items.forEach(item => {
        lines.push(`  * ${item.title} (Qty: ${item.quantity}) - $${item.price}`)
      })
    }

    if (order.tracking_numbers && order.tracking_numbers.length > 0) {
      lines.push(`- Tracking Number(s): ${order.tracking_numbers.join(', ')}`)
    }

    if (order.note) {
      lines.push(`- Order Notes: ${order.note}`)
    }

    return lines.join('\n')
  }).join('\n\n')
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Validate request method
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const { businessId, customerMessage, tone = 'professional', customPrompt, oneTimeInstructions }: RequestBody = await req.json()

    // Validate required fields
    if (!businessId || !customerMessage) {
      return new Response(
        JSON.stringify({ error: 'businessId and customerMessage are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize clients
    const openai = new OpenAI({
      apiKey: Deno.env.get('OPENAI_API_KEY'),
    })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 0. Check for Shopify integration and fetch order data if order numbers found
    let orderContext = ''
    const orderNumbers = extractOrderNumbers(customerMessage)

    if (orderNumbers.length > 0) {
      console.log(`Found order numbers in message: ${orderNumbers.join(', ')}`)

      // Get business Shopify credentials
      const { data: business } = await supabase
        .from('businesses')
        .select('shopify_domain, shopify_access_token')
        .eq('id', businessId)
        .single()

      if (business?.shopify_domain && business?.shopify_access_token) {
        console.log('Fetching Shopify order data...')
        const orders = await fetchShopifyOrders(
          business.shopify_domain,
          business.shopify_access_token,
          orderNumbers
        )

        if (orders.length > 0) {
          orderContext = formatOrdersForAI(orders)
          console.log(`Found ${orders.length} orders from Shopify`)
        }
      }
    }

    // 1. Generate embedding for customer message
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: customerMessage,
    })
    const embedding = embeddingResponse.data[0].embedding

    // 2. Search for relevant chunks in the knowledge base
    const { data: chunks, error: searchError } = await supabase.rpc('match_chunks', {
      query_embedding: embedding,
      match_count: 5,
      p_business_id: businessId,
    })

    if (searchError) {
      console.error('Search error:', searchError)
      throw new Error(`Failed to search knowledge base: ${searchError.message}`)
    }

    // Build context from retrieved chunks
    const context = (chunks as ChunkResult[])?.map((c) => c.content).join('\n\n') || ''
    const hasContext = context.length > 0 || orderContext.length > 0

    // 3. Build system prompt based on tone
    const toneInstructions = {
      professional: 'Be professional and courteous. Use formal language.',
      friendly: 'Be warm and friendly. Use a conversational tone while remaining helpful.',
      concise: 'Be brief and to the point. Provide only essential information.',
    }

    // Build instruction sections
    let additionalInstructions = ''

    // One-time instructions for regeneration (highest priority)
    if (oneTimeInstructions) {
      additionalInstructions += `\n⚠️ REGENERATION REQUEST - FOLLOW THESE SPECIFIC INSTRUCTIONS:\n${oneTimeInstructions}\n`
    }

    // Custom business instructions (only use when relevant to the query)
    if (customPrompt) {
      additionalInstructions += `\nBUSINESS-SPECIFIC INFO (use ONLY if relevant to this specific question):\n${customPrompt}\n`
    }

    const systemPrompt = `You are a helpful customer support agent responding to a customer inquiry.

CRITICAL: The message below is a FULL CONVERSATION THREAD with multiple messages. You MUST:
1. Read the ENTIRE conversation to understand the context and what has already been discussed
2. Identify the LAST/MOST RECENT message from the customer
3. Reply ONLY to that last message - do NOT repeat or re-address things already handled earlier in the thread
4. Your response should continue the conversation naturally, acknowledging what was already said

HANDLING RESOLVED CONVERSATIONS:
- If the customer's last message is a simple "thank you", "thanks", "got it", "perfect", or similar acknowledgment, respond with a brief friendly closing like "You're welcome! Let me know if you need anything else." or "Happy to help! Reach out anytime."
- Do NOT ask for more details or say their message was "cut off" when they're simply thanking you
- If the issue appears resolved (refund processed, item returned, question answered), keep your response short and positive

INSTRUCTIONS:
- Use the information provided below (order data and knowledge base) to answer the customer's question
- If order data is provided, use it to give specific details about their order (items, status, tracking, etc.)
- If the answer is not available, politely say you'll check with the team and get back to them
- ${toneInstructions[tone]}
- Keep responses concise but complete
- Never make up information - only use what's provided
- Do not mention that you're using a knowledge base or AI
- Write as if you are a real support agent replying to the customer
- DO NOT include any signature, sign-off, name, or closing like "Best regards, [Name]" - the user will add their own signature
- End your response with the last relevant sentence of your answer
${additionalInstructions}
${orderContext ? `
SHOPIFY ORDER DATA:
${orderContext}
` : ''}
KNOWLEDGE BASE:
${context || 'No relevant documentation found for this query.'}

${!hasContext ? 'Since no relevant information was found, acknowledge the question and offer to help or escalate to a specialist.' : ''}`

    // 4. Generate reply using GPT-4o-mini
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: customerMessage },
      ],
      temperature: 0.7,
      max_tokens: 500,
    })

    const reply = completion.choices[0].message.content

    // 5. Prepare source snippets for transparency
    const sources = (chunks as ChunkResult[])?.map((c) => ({
      snippet: c.content.slice(0, 150) + (c.content.length > 150 ? '...' : ''),
      similarity: Math.round(c.similarity * 100),
    })) || []

    return new Response(
      JSON.stringify({
        reply,
        sources,
        hasKnowledgeBase: hasContext,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Error generating reply:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'An unexpected error occurred'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
