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

const START_TIME = Date.now()
const MAX_RUNTIME_MS = 55000 // 55 seconds max (leave 5s buffer)

function isTimeRunningOut(): boolean {
  return Date.now() - START_TIME > MAX_RUNTIME_MS
}

/**
 * Fetch resolved/closed tickets from Freshdesk - FAST version
 */
async function fetchTicketsFast(domain: string, apiKey: string, count: number): Promise<FreshdeskTicket[]> {
  const tickets: FreshdeskTicket[] = []
  const existingIds = new Set<number>()

  console.log(`Fast-fetching up to ${count} resolved/closed tickets...`)

  // Use standard API with status filter - faster than search API
  const perPage = 100
  const maxPages = Math.ceil(count * 1.5 / perPage) // Fetch extra to account for filtering

  const fetchPromises: Promise<FreshdeskTicket[]>[] = []

  // Fetch multiple pages in parallel (groups of 5)
  for (let page = 1; page <= maxPages && !isTimeRunningOut(); page += 5) {
    const batch: Promise<FreshdeskTicket[]>[] = []

    for (let p = page; p < page + 5 && p <= maxPages; p++) {
      batch.push(
        fetch(
          `https://${domain}/api/v2/tickets?per_page=${perPage}&page=${p}&order_by=updated_at&order_type=desc&include=description`,
          {
            headers: {
              'Authorization': 'Basic ' + btoa(`${apiKey}:X`),
              'Content-Type': 'application/json',
            },
          }
        )
          .then(res => res.ok ? res.json() : [])
          .catch(() => [])
      )
    }

    const results = await Promise.all(batch)
    for (const data of results) {
      if (Array.isArray(data)) {
        // Filter for resolved (4) and closed (5) tickets
        const resolvedTickets = data.filter((t: FreshdeskTicket) =>
          t.status >= 4 && !existingIds.has(t.id)
        )
        resolvedTickets.forEach((t: FreshdeskTicket) => existingIds.add(t.id))
        tickets.push(...resolvedTickets)
      }
    }

    if (tickets.length >= count) break

    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 50))
  }

  console.log(`Fast-fetch found ${tickets.length} resolved/closed tickets`)
  return tickets.slice(0, count)
}

/**
 * Fetch conversations for multiple tickets in parallel
 */
async function fetchConversationsBatch(
  domain: string,
  apiKey: string,
  ticketIds: number[]
): Promise<Map<number, FreshdeskConversation[]>> {
  const results = new Map<number, FreshdeskConversation[]>()

  const promises = ticketIds.map(async (ticketId) => {
    try {
      const response = await fetch(
        `https://${domain}/api/v2/tickets/${ticketId}/conversations`,
        {
          headers: {
            'Authorization': 'Basic ' + btoa(`${apiKey}:X`),
            'Content-Type': 'application/json',
          },
        }
      )
      if (response.ok) {
        const convos = await response.json()
        results.set(ticketId, convos)
      } else {
        results.set(ticketId, [])
      }
    } catch {
      results.set(ticketId, [])
    }
  })

  await Promise.all(promises)
  return results
}

/**
 * Split text into chunks
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

    console.log(`Processing ${count} tickets from ${freshdeskDomain}...`)

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

    // Fetch tickets from Freshdesk - FAST
    const tickets = await fetchTicketsFast(freshdeskDomain, freshdeskApiKey, count)
    console.log(`Fetched ${tickets.length} tickets in ${Date.now() - START_TIME}ms`)

    if (tickets.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No resolved/closed tickets found',
          ticketsScanned: 0,
          documentsCreated: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Process tickets in parallel batches to get conversations
    const learningDocs: string[] = []
    let processedCount = 0
    const batchSize = 10 // Process 10 tickets at a time

    for (let i = 0; i < tickets.length && !isTimeRunningOut(); i += batchSize) {
      const batch = tickets.slice(i, i + batchSize)
      const ticketIds = batch.map(t => t.id)

      // Fetch conversations in parallel
      const conversationsMap = await fetchConversationsBatch(freshdeskDomain, freshdeskApiKey, ticketIds)

      // Process each ticket
      for (const ticket of batch) {
        const conversations = conversationsMap.get(ticket.id) || []

        // Build Q&A document
        let doc = `TICKET: ${ticket.subject}\n\n`

        if (ticket.description_text && ticket.description_text.trim()) {
          doc += `CUSTOMER QUERY:\n${ticket.description_text}\n\n`
        }

        // Get agent responses
        const agentResponses = conversations.filter(c => !c.incoming && c.body_text && c.body_text.trim())

        if (agentResponses.length > 0) {
          doc += `SUPPORT RESPONSE:\n`
          agentResponses.forEach(resp => {
            doc += `${resp.body_text}\n\n`
          })
          learningDocs.push(doc)
        } else if (ticket.description_text && ticket.description_text.trim().length > 50) {
          doc += `[Ticket was resolved]\n\n`
          learningDocs.push(doc)
        }

        processedCount++
      }

      // Small delay between batches for rate limiting
      if (i + batchSize < tickets.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    console.log(`Processed ${processedCount} tickets, created ${learningDocs.length} docs in ${Date.now() - START_TIME}ms`)

    if (learningDocs.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No tickets with useful content found',
          ticketsScanned: processedCount,
          documentsCreated: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if time is running out
    if (isTimeRunningOut()) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Processing timed out. Try with fewer tickets (500-1000).',
          ticketsScanned: processedCount,
          conversationsFound: learningDocs.length,
        }),
        { status: 408, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Combine all learning docs
    const combinedContent = `# Learned from ${learningDocs.length} Support Conversations\n\n` +
      learningDocs.join('\n---\n\n')

    // Delete existing learned-tickets document
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

    // Save new document
    const docName = `Learned from Freshdesk (${learningDocs.length} tickets)`
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
    console.log(`Created ${chunks.length} chunks`)

    // Generate embeddings in batches
    const embeddingBatchSize = 50
    const allEmbeddings: number[][] = []

    for (let i = 0; i < chunks.length && !isTimeRunningOut(); i += embeddingBatchSize) {
      const batch = chunks.slice(i, i + embeddingBatchSize)
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: batch,
      })
      allEmbeddings.push(...embeddingResponse.data.map(d => d.embedding))
    }

    // Store chunks with embeddings
    const chunkRows = chunks.slice(0, allEmbeddings.length).map((content, index) => ({
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

    console.log(`Completed in ${Date.now() - START_TIME}ms`)

    return new Response(
      JSON.stringify({
        success: true,
        ticketsScanned: processedCount,
        conversationsLearned: learningDocs.length,
        chunksCreated: chunkRows.length,
        documentId: doc.id,
        processingTimeMs: Date.now() - START_TIME,
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
