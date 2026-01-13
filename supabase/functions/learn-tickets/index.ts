import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI from 'https://esm.sh/openai@4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
}

interface RequestBody {
  businessId: string
  freshdeskDomain: string
  freshdeskApiKey: string
  ticketCount: number // 100-1000
}

interface FreshdeskTicket {
  id: number
  subject: string
  description_text: string
  status: number
  created_at: string
}

interface FreshdeskConversation {
  id: number
  body_text: string
  incoming: boolean
  created_at: string
}

/**
 * Fetch RESOLVED and CLOSED tickets from Freshdesk API
 * Status 4 = Resolved, Status 5 = Closed
 * Uses the filter API for better results
 */
async function fetchTickets(domain: string, apiKey: string, count: number): Promise<FreshdeskTicket[]> {
  const perPage = 100
  const tickets: FreshdeskTicket[] = []
  const seenIds = new Set<number>()

  console.log(`Searching for up to ${count} resolved/closed tickets...`)

  // Method 1: Use Freshdesk's predefined filters for resolved and closed tickets
  // Filter IDs: We'll try different approaches

  // First, let's get tickets directly with status filter using the tickets API
  // The tickets API with include=description gives us what we need

  // Try using the "all tickets" endpoint with filtering
  const maxPagesPerStatus = Math.ceil(count / perPage) + 5 // Extra pages to ensure we get enough

  // Fetch closed tickets (status 5) - these are the most valuable
  console.log('Fetching closed tickets (status 5)...')
  for (let page = 1; page <= maxPagesPerStatus && tickets.length < count; page++) {
    try {
      // Use filter parameter for closed tickets
      const response = await fetch(
        `https://${domain}/api/v2/tickets?per_page=${perPage}&page=${page}&order_by=updated_at&order_type=desc&include=description`,
        {
          headers: {
            'Authorization': 'Basic ' + btoa(`${apiKey}:X`),
            'Content-Type': 'application/json',
          },
        }
      )

      if (!response.ok) {
        const status = response.status
        console.log(`Tickets API returned ${status} at page ${page}`)
        if (status === 429) {
          // Rate limited, wait and retry
          console.log('Rate limited, waiting 30 seconds...')
          await new Promise(resolve => setTimeout(resolve, 30000))
          page-- // Retry this page
          continue
        }
        break
      }

      const data = await response.json()
      if (!data || data.length === 0) {
        console.log(`No more tickets at page ${page}`)
        break
      }

      // Filter for closed (5) and resolved (4) tickets
      for (const ticket of data) {
        if ((ticket.status === 5 || ticket.status === 4) && !seenIds.has(ticket.id)) {
          seenIds.add(ticket.id)
          tickets.push(ticket)
        }
      }

      console.log(`Page ${page}: found ${data.length} tickets, ${tickets.length} total resolved/closed`)

      // Rate limit - be more conservative
      await new Promise(resolve => setTimeout(resolve, 200))

    } catch (err) {
      console.error(`Error fetching page ${page}:`, err)
      break
    }
  }

  console.log(`Standard API found ${tickets.length} resolved/closed tickets`)

  // Method 2: If we still need more, use the search API with different queries
  if (tickets.length < count) {
    console.log('Supplementing with search API...')

    for (const status of [5, 4]) {
      if (tickets.length >= count) break

      let page = 1
      const maxSearchPages = 10 // Search API limit is ~300 results (10 pages x 30)

      while (page <= maxSearchPages && tickets.length < count) {
        try {
          const response = await fetch(
            `https://${domain}/api/v2/search/tickets?query="status:${status}"&page=${page}`,
            {
              headers: {
                'Authorization': 'Basic ' + btoa(`${apiKey}:X`),
                'Content-Type': 'application/json',
              },
            }
          )

          if (!response.ok) {
            console.log(`Search API returned ${response.status} for status ${status}, page ${page}`)
            break
          }

          const data = await response.json()
          if (!data.results || data.results.length === 0) {
            break
          }

          for (const ticket of data.results) {
            if (!seenIds.has(ticket.id)) {
              seenIds.add(ticket.id)
              tickets.push(ticket)
            }
          }

          console.log(`Search page ${page} (status ${status}): ${data.results.length} results, ${tickets.length} total`)
          page++

          // Rate limit for search API
          await new Promise(resolve => setTimeout(resolve, 300))

        } catch (err) {
          console.error(`Error searching status ${status}:`, err)
          break
        }
      }
    }
  }

  // Method 3: Try using filter views if available
  if (tickets.length < count) {
    console.log('Trying filter views...')
    try {
      // Get all available filters
      const filtersResponse = await fetch(
        `https://${domain}/api/v2/ticket_filters`,
        {
          headers: {
            'Authorization': 'Basic ' + btoa(`${apiKey}:X`),
            'Content-Type': 'application/json',
          },
        }
      )

      if (filtersResponse.ok) {
        const filters = await filtersResponse.json()
        console.log(`Found ${filters.length} ticket filters`)

        // Look for "Resolved" or "Closed" filters
        for (const filter of filters) {
          if (tickets.length >= count) break

          const filterName = (filter.name || '').toLowerCase()
          if (filterName.includes('resolved') || filterName.includes('closed') || filterName.includes('all')) {
            console.log(`Trying filter: ${filter.name} (ID: ${filter.id})`)

            for (let page = 1; page <= 10 && tickets.length < count; page++) {
              try {
                const response = await fetch(
                  `https://${domain}/api/v2/tickets?filter_id=${filter.id}&per_page=${perPage}&page=${page}&include=description`,
                  {
                    headers: {
                      'Authorization': 'Basic ' + btoa(`${apiKey}:X`),
                      'Content-Type': 'application/json',
                    },
                  }
                )

                if (!response.ok) break

                const data = await response.json()
                if (!data || data.length === 0) break

                for (const ticket of data) {
                  if ((ticket.status === 5 || ticket.status === 4) && !seenIds.has(ticket.id)) {
                    seenIds.add(ticket.id)
                    tickets.push(ticket)
                  }
                }

                await new Promise(resolve => setTimeout(resolve, 200))
              } catch {
                break
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Error fetching filters:', err)
    }
  }

  console.log(`Total unique resolved/closed tickets found: ${tickets.length}`)
  return tickets.slice(0, count)
}

/**
 * Fetch conversations for a ticket
 */
async function fetchConversations(domain: string, apiKey: string, ticketId: number): Promise<FreshdeskConversation[]> {
  const response = await fetch(
    `https://${domain}/api/v2/tickets/${ticketId}/conversations`,
    {
      headers: {
        'Authorization': 'Basic ' + btoa(`${apiKey}:X`),
        'Content-Type': 'application/json',
      },
    }
  )

  if (!response.ok) {
    // Some tickets may not have conversations
    return []
  }

  return response.json()
}

/**
 * Split text into chunks with overlap
 */
function splitTextIntoChunks(text: string, chunkSize = 2000, overlap = 200): string[] {
  const chunks: string[] = []
  const cleanedText = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

  if (cleanedText.length <= chunkSize) {
    return [cleanedText]
  }

  let start = 0
  while (start < cleanedText.length) {
    let end = Math.min(start + chunkSize, cleanedText.length)

    if (end < cleanedText.length) {
      const paragraphBreak = cleanedText.lastIndexOf('\n\n', end)
      if (paragraphBreak > start + chunkSize / 2) {
        end = paragraphBreak
      } else {
        const sentenceBreak = cleanedText.lastIndexOf('. ', end)
        if (sentenceBreak > start + chunkSize / 2) {
          end = sentenceBreak + 1
        }
      }
    }

    const chunk = cleanedText.slice(start, end).trim()
    if (chunk.length > 0) {
      chunks.push(chunk)
    }

    start = end - overlap
    if (start >= cleanedText.length - overlap) break
  }

  return chunks
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { businessId, freshdeskDomain, freshdeskApiKey, ticketCount }: RequestBody = await req.json()

    if (!businessId || !freshdeskDomain || !freshdeskApiKey) {
      return new Response(
        JSON.stringify({ error: 'businessId, freshdeskDomain, and freshdeskApiKey are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const count = Math.min(Math.max(ticketCount || 100, 10), 1000)

    console.log(`Fetching ${count} tickets from ${freshdeskDomain}...`)

    // Initialize clients
    const openai = new OpenAI({
      apiKey: Deno.env.get('OPENAI_API_KEY'),
    })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verify business exists
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('id', businessId)
      .single()

    if (businessError || !business) {
      return new Response(
        JSON.stringify({ error: 'Business not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch tickets from Freshdesk
    const tickets = await fetchTickets(freshdeskDomain, freshdeskApiKey, count)
    console.log(`Fetched ${tickets.length} tickets`)

    // Process tickets and create learning documents
    const learningDocs: string[] = []
    let processedCount = 0
    let conversationCount = 0

    for (const ticket of tickets) {
      try {
        // Fetch conversations for resolved/closed tickets (status 4 or 5)
        if (ticket.status >= 4) {
          const conversations = await fetchConversations(freshdeskDomain, freshdeskApiKey, ticket.id)

          if (conversations.length > 0) {
            // Build a Q&A document from the ticket
            let doc = `TICKET: ${ticket.subject}\n\n`
            doc += `CUSTOMER QUERY:\n${ticket.description_text}\n\n`

            // Get agent responses (non-incoming messages)
            const agentResponses = conversations.filter(c => !c.incoming)
            if (agentResponses.length > 0) {
              doc += `SUPPORT RESPONSE:\n`
              agentResponses.forEach(resp => {
                doc += `${resp.body_text}\n\n`
              })
              learningDocs.push(doc)
              conversationCount++
            }
          }
        }
        processedCount++

        // Rate limiting - Freshdesk API limits
        if (processedCount % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 300))
        }
      } catch (err) {
        console.warn(`Error processing ticket ${ticket.id}:`, err)
      }
    }

    if (learningDocs.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No resolved tickets with conversations found',
          ticketsScanned: processedCount,
          documentsCreated: 0,
          conversationsLearned: 0,
          chunksCreated: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Combine all learning docs into one document
    const combinedContent = `# Learned from ${conversationCount} Support Conversations\n\n` +
      learningDocs.join('\n---\n\n')

    // Check if we already have a learned-tickets document and delete it
    const { data: existingDocs } = await supabase
      .from('documents')
      .select('id')
      .eq('business_id', businessId)
      .like('name', 'Learned from Freshdesk%')

    if (existingDocs && existingDocs.length > 0) {
      await supabase
        .from('documents')
        .delete()
        .in('id', existingDocs.map(d => d.id))
    }

    // Save as a new document
    const docName = `Learned from Freshdesk (${conversationCount} tickets)`
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .insert({
        business_id: businessId,
        name: docName,
        content: combinedContent,
      })
      .select('id')
      .single()

    if (docError) {
      throw new Error(`Failed to save document: ${docError.message}`)
    }

    // Split into chunks and generate embeddings
    const chunks = splitTextIntoChunks(combinedContent)
    console.log(`Created ${chunks.length} chunks from learned content`)

    const batchSize = 20
    const allEmbeddings: number[][] = []

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize)
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: batch,
      })
      const batchEmbeddings = embeddingResponse.data.map((d) => d.embedding)
      allEmbeddings.push(...batchEmbeddings)
    }

    // Store chunks with embeddings
    const chunkRows = chunks.map((content, index) => ({
      document_id: doc.id,
      content,
      embedding: allEmbeddings[index],
    }))

    const { error: chunkError } = await supabase
      .from('chunks')
      .insert(chunkRows)

    if (chunkError) {
      await supabase.from('documents').delete().eq('id', doc.id)
      throw new Error(`Failed to save chunks: ${chunkError.message}`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        ticketsScanned: processedCount,
        conversationsLearned: conversationCount,
        chunksCreated: chunks.length,
        documentId: doc.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error learning from tickets:', error)
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
