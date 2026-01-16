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
 * Fetch resolved/closed tickets - ULTRA FAST with high parallelism
 */
async function fetchTicketsFast(domain: string, apiKey: string, count: number): Promise<FreshdeskTicket[]> {
  const tickets: FreshdeskTicket[] = []
  const existingIds = new Set<number>()
  const perPage = 100
  const maxPages = Math.ceil(count * 2 / perPage)

  console.log(`Fetching up to ${count} tickets with high parallelism...`)

  // Fetch 10 pages in parallel at a time
  for (let page = 1; page <= maxPages && tickets.length < count && !isTimeRunningOut(); page += 10) {
    const batch: Promise<FreshdeskTicket[]>[] = []

    for (let p = page; p < page + 10 && p <= maxPages; p++) {
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
        const resolvedTickets = data.filter((t: FreshdeskTicket) =>
          t.status >= 4 && !existingIds.has(t.id)
        )
        resolvedTickets.forEach((t: FreshdeskTicket) => existingIds.add(t.id))
        tickets.push(...resolvedTickets)
      }
    }

    if (tickets.length >= count) break
  }

  console.log(`Found ${tickets.length} resolved/closed tickets in ${Date.now() - START_TIME}ms`)
  return tickets.slice(0, count)
}

/**
 * Fetch conversations for multiple tickets in parallel - HIGH concurrency
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
  // Reset start time for each request
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

    // PHASE 1: Fetch tickets (fast parallel)
    const tickets = await fetchTicketsFast(freshdeskDomain, freshdeskApiKey, count)
    console.log(`Fetched ${tickets.length} tickets in ${Date.now() - START_TIME}ms, ${timeLeft()}ms remaining`)

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

    // PHASE 2: Fetch conversations in parallel batches of 20
    const learningDocs: string[] = []
    let processedCount = 0
    const batchSize = 20

    for (let i = 0; i < tickets.length && !isTimeRunningOut(); i += batchSize) {
      const batch = tickets.slice(i, i + batchSize)
      const ticketIds = batch.map(t => t.id)

      // Fetch all conversations in parallel
      const conversationsMap = await fetchConversationsBatch(freshdeskDomain, freshdeskApiKey, ticketIds)

      // Process each ticket
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

      // Minimal delay for rate limiting
      if (i + batchSize < tickets.length && !isTimeRunningOut()) {
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    }

    console.log(`Processed ${processedCount} tickets, ${learningDocs.length} docs in ${Date.now() - START_TIME}ms, ${timeLeft()}ms remaining`)

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

    // PHASE 3: Save document (even if we run out of time for embeddings)
    const combinedContent = `# Learned from ${learningDocs.length} Support Conversations\n\n` +
      learningDocs.join('\n---\n\n')

    // Delete existing learned-tickets document
    const { data: existingDocs } = await supabase
      .from('documents')
      .select('id')
      .eq('business_id', businessId)
      .like('name', 'Learned from Freshdesk%')

    if (existingDocs && existingDocs.length > 0) {
      // Also delete associated chunks
      for (const existingDoc of existingDocs) {
        await supabase.from('chunks').delete().eq('document_id', existingDoc.id)
      }
      await supabase
        .from('documents')
        .delete()
        .in('id', existingDocs.map(d => d.id))
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

    // PHASE 4: Generate embeddings (in large batches)
    const chunks = splitTextIntoChunks(combinedContent)
    console.log(`Created ${chunks.length} chunks`)

    const embeddingBatchSize = 100 // Large batches for speed
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

    // Store whatever chunks we managed to embed
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
