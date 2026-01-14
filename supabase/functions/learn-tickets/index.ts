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
  ticketCount: number // 100-5000
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
 */
async function fetchTickets(domain: string, apiKey: string, count: number): Promise<FreshdeskTicket[]> {
  const perPage = 100
  const tickets: FreshdeskTicket[] = []
  const existingIds = new Set<number>()

  console.log(`Searching for up to ${count} resolved/closed tickets...`)

  // Method 1: Use filter API to get closed and resolved tickets directly
  // Filter API supports up to 10,000 tickets with pagination
  for (const filter of ['closed', 'resolved']) {
    if (tickets.length >= count) break

    let page = 1
    const maxPages = Math.ceil(count / perPage) + 5 // Allow extra pages

    while (page <= maxPages && tickets.length < count) {
      try {
        // Use the filter endpoint which is more reliable for getting specific statuses
        const response = await fetch(
          `https://${domain}/api/v2/tickets?filter=${filter}&per_page=${perPage}&page=${page}&include=description`,
          {
            headers: {
              'Authorization': 'Basic ' + btoa(`${apiKey}:X`),
              'Content-Type': 'application/json',
            },
          }
        )

        if (!response.ok) {
          console.log(`Filter API returned ${response.status} for ${filter}, page ${page}`)
          break
        }

        const data = await response.json()
        if (!data || data.length === 0) {
          console.log(`No more results for ${filter} at page ${page}`)
          break
        }

        // Filter out duplicates
        const newTickets = data.filter((t: FreshdeskTicket) => !existingIds.has(t.id))
        newTickets.forEach((t: FreshdeskTicket) => existingIds.add(t.id))
        tickets.push(...newTickets)

        console.log(`Found ${newTickets.length} ${filter} tickets on page ${page} (total: ${tickets.length})`)
        page++

        // Freshdesk rate limit
        await new Promise(resolve => setTimeout(resolve, 100))

      } catch (err) {
        console.error(`Error fetching ${filter} tickets:`, err)
        break
      }
    }
  }

  console.log(`Filter API found ${tickets.length} tickets total`)

  // Method 2: If filter didn't find enough, use search API as supplement
  // Freshdesk Search API returns max 30 results per page, max 10 pages (300 per status)
  if (tickets.length < count) {
    console.log('Supplementing with search API...')

    for (const status of [5, 4]) { // Closed (5), Resolved (4)
      if (tickets.length >= count) break

      let page = 1
      const maxPages = 10 // Freshdesk search limit

      while (page <= maxPages && tickets.length < count) {
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

          // Filter out duplicates
          const newTickets = data.results.filter((t: FreshdeskTicket) => !existingIds.has(t.id))
          newTickets.forEach((t: FreshdeskTicket) => existingIds.add(t.id))
          tickets.push(...newTickets)

          console.log(`Search found ${newTickets.length} tickets with status ${status} on page ${page}`)
          page++

          await new Promise(resolve => setTimeout(resolve, 150))

        } catch (err) {
          console.error(`Error searching status ${status}:`, err)
          break
        }
      }
    }
  }

  // Method 3: If still not enough, scan ALL tickets with standard API
  // This is slower but comprehensive
  if (tickets.length < count) {
    console.log('Scanning all tickets with standard API...')

    // Calculate how many pages we need to check based on what we still need
    // Assume ~30-50% of tickets are resolved/closed, so check extra pages
    const remainingNeeded = count - tickets.length
    const maxPages = Math.ceil(remainingNeeded * 3 / perPage) + 10
    let consecutiveEmptyPages = 0

    for (let page = 1; page <= maxPages && tickets.length < count; page++) {
      try {
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
          console.log(`Tickets API returned ${response.status} at page ${page}`)
          break
        }

        const data = await response.json()
        if (!data || data.length === 0) {
          consecutiveEmptyPages++
          if (consecutiveEmptyPages >= 2) break
          continue
        }

        consecutiveEmptyPages = 0

        // Filter for resolved (4) or closed (5) tickets we don't already have
        const newTickets = data.filter((t: FreshdeskTicket) =>
          t.status >= 4 && !existingIds.has(t.id)
        )

        newTickets.forEach((t: FreshdeskTicket) => existingIds.add(t.id))
        tickets.push(...newTickets)

        console.log(`Page ${page}: found ${newTickets.length} new resolved/closed tickets (total: ${tickets.length})`)

        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 80))

      } catch (err) {
        console.error(`Error fetching page ${page}:`, err)
        break
      }
    }
  }

  console.log(`Total tickets found: ${tickets.length}`)
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

    const count = Math.min(Math.max(ticketCount || 100, 10), 5000)

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

          // Build a Q&A document from the ticket
          let doc = `TICKET: ${ticket.subject}\n\n`

          // Add the initial customer query if it exists
          if (ticket.description_text && ticket.description_text.trim()) {
            doc += `CUSTOMER QUERY:\n${ticket.description_text}\n\n`
          }

          // Get agent responses (non-incoming messages)
          const agentResponses = conversations.filter(c => !c.incoming && c.body_text && c.body_text.trim())

          if (agentResponses.length > 0) {
            doc += `SUPPORT RESPONSE:\n`
            agentResponses.forEach(resp => {
              doc += `${resp.body_text}\n\n`
            })
            learningDocs.push(doc)
            conversationCount++
          } else if (ticket.description_text && ticket.description_text.trim().length > 50) {
            // Even without agent response, a resolved ticket's query is valuable
            // (It shows what types of queries get resolved)
            // Only include if description is substantial (>50 chars)
            doc += `[Ticket was resolved - response may have been sent via other channel]\n\n`
            learningDocs.push(doc)
            conversationCount++
          }
        }
        processedCount++

        // Rate limiting - Freshdesk API limits
        if (processedCount % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 150))
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
