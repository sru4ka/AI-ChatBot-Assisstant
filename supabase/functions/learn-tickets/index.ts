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
  ticketCount: number
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

let START_TIME = Date.now()
const MAX_RUNTIME_MS = 55000

function timeLeft(): number {
  return MAX_RUNTIME_MS - (Date.now() - START_TIME)
}

function isTimeRunningOut(): boolean {
  return timeLeft() < 5000
}

/**
 * Fetch RESOLVED and CLOSED tickets using Search API (more efficient)
 * Status 4 = Resolved, Status 5 = Closed
 */
async function fetchTickets(domain: string, apiKey: string, count: number): Promise<FreshdeskTicket[]> {
  const tickets: FreshdeskTicket[] = []
  const existingIds = new Set<number>()

  console.log(`Searching for up to ${count} resolved/closed tickets...`)

  // Use Search API - directly searches for resolved/closed tickets
  // Search API returns max 30 per page, 10 pages per query (300 per query)
  for (const status of [5, 4]) { // Closed first, then Resolved
    if (tickets.length >= count || isTimeRunningOut()) break

    console.log(`Searching for tickets with status ${status}...`)

    // Search with quarterly date ranges to get past the 300 limit per query
    // More granular ranges = more tickets found
    const dateRanges = [
      '', // No date filter (gets most recent)
      // 2025
      "created_at:>'2025-01-01'",
      // 2024 quarterly
      "created_at:>'2024-10-01' AND created_at:<'2025-01-01'",
      "created_at:>'2024-07-01' AND created_at:<'2024-10-01'",
      "created_at:>'2024-04-01' AND created_at:<'2024-07-01'",
      "created_at:>'2024-01-01' AND created_at:<'2024-04-01'",
      // 2023 quarterly
      "created_at:>'2023-10-01' AND created_at:<'2024-01-01'",
      "created_at:>'2023-07-01' AND created_at:<'2023-10-01'",
      "created_at:>'2023-04-01' AND created_at:<'2023-07-01'",
      "created_at:>'2023-01-01' AND created_at:<'2023-04-01'",
      // 2022 quarterly
      "created_at:>'2022-10-01' AND created_at:<'2023-01-01'",
      "created_at:>'2022-07-01' AND created_at:<'2022-10-01'",
      "created_at:>'2022-04-01' AND created_at:<'2022-07-01'",
      "created_at:>'2022-01-01' AND created_at:<'2022-04-01'",
      // Older
      "created_at:>'2021-01-01' AND created_at:<'2022-01-01'",
      "created_at:>'2020-01-01' AND created_at:<'2021-01-01'",
    ]

    for (const dateFilter of dateRanges) {
      if (tickets.length >= count || isTimeRunningOut()) break

      let page = 1
      const maxSearchPages = 10

      while (page <= maxSearchPages && tickets.length < count && !isTimeRunningOut()) {
        try {
          const query = dateFilter
            ? `"status:${status} AND ${dateFilter}"`
            : `"status:${status}"`

          const response = await fetch(
            `https://${domain}/api/v2/search/tickets?query=${encodeURIComponent(query)}&page=${page}`,
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

          console.log(`Search status:${status} ${dateFilter || '(recent)'} page ${page}: +${newTickets.length} (total: ${tickets.length})`)
          page++

          // Minimal delay for rate limiting
          await new Promise(resolve => setTimeout(resolve, 30))
        } catch (err) {
          console.error(`Error searching status ${status}:`, err)
          break
        }
      }
    }
  }

  console.log(`Search API found ${tickets.length} tickets`)

  // Supplement with standard tickets API if needed
  if (tickets.length < count && !isTimeRunningOut()) {
    console.log('Supplementing with standard tickets API...')

    const perPage = 100
    const maxPages = Math.min(100, Math.ceil((count - tickets.length) * 3 / perPage))

    for (let page = 1; page <= maxPages && tickets.length < count && !isTimeRunningOut(); page++) {
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

        if (!response.ok) break

        const data = await response.json()
        if (!data || data.length === 0) break

        // Filter for resolved/closed tickets we don't already have
        const newTickets = data.filter((t: FreshdeskTicket) =>
          t.status >= 4 && !existingIds.has(t.id)
        )

        newTickets.forEach((t: FreshdeskTicket) => existingIds.add(t.id))
        tickets.push(...newTickets)

        if (newTickets.length > 0) {
          console.log(`Standard API page ${page}: +${newTickets.length} (total: ${tickets.length})`)
        }

        await new Promise(resolve => setTimeout(resolve, 30))
      } catch (err) {
        console.error(`Error fetching page ${page}:`, err)
        break
      }
    }
  }

  console.log(`Total tickets found: ${tickets.length} in ${Date.now() - START_TIME}ms`)
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
        results.set(ticketId, await response.json())
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
  START_TIME = Date.now()

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

    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') })
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

    // PHASE 1: Fetch tickets using Search API
    const tickets = await fetchTickets(freshdeskDomain, freshdeskApiKey, count)
    console.log(`Fetched ${tickets.length} tickets, ${timeLeft()}ms remaining`)

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

    // PHASE 2: Fetch conversations in parallel batches
    const learningDocs: string[] = []
    let processedCount = 0
    const batchSize = 25 // Process 25 tickets at a time for faster processing

    for (let i = 0; i < tickets.length && !isTimeRunningOut(); i += batchSize) {
      const batch = tickets.slice(i, i + batchSize)
      const ticketIds = batch.map(t => t.id)

      const conversationsMap = await fetchConversationsBatch(freshdeskDomain, freshdeskApiKey, ticketIds)

      for (const ticket of batch) {
        const conversations = conversationsMap.get(ticket.id) || []

        let doc = `TICKET: ${ticket.subject}\n\n`

        if (ticket.description_text && ticket.description_text.trim()) {
          doc += `CUSTOMER QUERY:\n${ticket.description_text}\n\n`
        }

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

      // Minimal rate limiting delay
      if (i + batchSize < tickets.length && !isTimeRunningOut()) {
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    }

    console.log(`Processed ${processedCount} tickets, ${learningDocs.length} docs, ${timeLeft()}ms remaining`)

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

    // PHASE 3: Save document
    const combinedContent = `# Learned from ${learningDocs.length} Support Conversations\n\n` +
      learningDocs.join('\n---\n\n')

    // Delete existing learned-tickets documents
    const { data: existingDocs } = await supabase
      .from('documents')
      .select('id')
      .eq('business_id', businessId)
      .like('name', 'Learned from Freshdesk%')

    if (existingDocs && existingDocs.length > 0) {
      for (const existingDoc of existingDocs) {
        await supabase.from('chunks').delete().eq('document_id', existingDoc.id)
      }
      await supabase.from('documents').delete().in('id', existingDocs.map(d => d.id))
    }

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

    console.log(`Document saved, ${timeLeft()}ms remaining for embeddings`)

    // PHASE 4: Generate embeddings
    const chunks = splitTextIntoChunks(combinedContent)
    console.log(`Created ${chunks.length} chunks`)

    const embeddingBatchSize = 100
    const allEmbeddings: number[][] = []

    for (let i = 0; i < chunks.length && !isTimeRunningOut(); i += embeddingBatchSize) {
      const batch = chunks.slice(i, i + embeddingBatchSize)
      try {
        const embeddingResponse = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: batch,
        })
        allEmbeddings.push(...embeddingResponse.data.map(d => d.embedding))
      } catch (e) {
        console.error('Embedding error:', e)
        break
      }
    }

    // Store chunks
    if (allEmbeddings.length > 0) {
      const chunkRows = chunks.slice(0, allEmbeddings.length).map((content, index) => ({
        document_id: doc.id,
        content,
        embedding: allEmbeddings[index],
      }))

      const { error: chunkError } = await supabase.from('chunks').insert(chunkRows)
      if (chunkError) {
        console.error('Chunk insert error:', chunkError)
      }
    }

    const totalTime = Date.now() - START_TIME
    console.log(`Completed in ${totalTime}ms`)

    return new Response(
      JSON.stringify({
        success: true,
        ticketsScanned: processedCount,
        conversationsLearned: learningDocs.length,
        chunksCreated: allEmbeddings.length,
        totalChunks: chunks.length,
        documentId: doc.id,
        processingTimeMs: totalTime,
        note: allEmbeddings.length < chunks.length
          ? `Processed ${allEmbeddings.length}/${chunks.length} chunks before timeout`
          : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error:', error)
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
