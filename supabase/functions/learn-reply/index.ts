import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI from 'https://esm.sh/openai@4'

console.log('learn-reply: Function module loaded')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
}

interface RequestBody {
  businessId: string
  question: string
  answer: string
  ticketId?: string
}

Deno.serve(async (req: Request) => {
  console.log('learn-reply: Request received', req.method, req.url)

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    console.log('learn-reply: CORS preflight')
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Validate request method
    if (req.method !== 'POST') {
      console.log('learn-reply: Method not allowed:', req.method)
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    let body: RequestBody
    try {
      body = await req.json()
      console.log('learn-reply: Body parsed, businessId:', body.businessId, 'ticketId:', body.ticketId)
    } catch (parseError) {
      console.error('learn-reply: JSON parse error:', parseError)
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { businessId, question, answer, ticketId } = body

    // Validate required fields
    if (!businessId || !question || !answer) {
      console.log('learn-reply: Missing required fields', { businessId: !!businessId, question: !!question, answer: !!answer })
      return new Response(
        JSON.stringify({ error: 'businessId, question, and answer are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('learn-reply: Initializing clients...')

    // Initialize clients
    const openai = new OpenAI({
      apiKey: Deno.env.get('OPENAI_API_KEY'),
    })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log('learn-reply: Clients initialized')

    // Create a combined Q&A text for embedding
    // Extract just the last customer message if it's a full conversation
    let questionSummary = question
    const lastMsgMatch = question.match(/<<<< THIS IS THE LATEST MESSAGE[^:]*:\s*([^=]+)/s)
    if (lastMsgMatch) {
      questionSummary = lastMsgMatch[1].trim()
    }

    // Limit size
    questionSummary = questionSummary.slice(0, 1000)
    const answerSummary = answer.slice(0, 1500)

    const combinedText = `Customer Question: ${questionSummary}\n\nAgent Response: ${answerSummary}`

    console.log('learn-reply: Generating embedding...')

    // Generate embedding
    let embedding: number[]
    try {
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: combinedText,
      })
      embedding = embeddingResponse.data[0].embedding
      console.log('learn-reply: Embedding generated, length:', embedding.length)
    } catch (embeddingError) {
      console.error('learn-reply: Embedding error:', embeddingError)
      throw new Error(`Failed to generate embedding: ${embeddingError instanceof Error ? embeddingError.message : 'Unknown error'}`)
    }

    console.log('learn-reply: Checking for duplicates...')

    // Check if similar content already exists (to avoid duplicates)
    const { data: existingChunks, error: matchError } = await supabase.rpc('match_chunks', {
      query_embedding: embedding,
      match_count: 1,
      p_business_id: businessId,
    })

    if (matchError) {
      console.warn('learn-reply: Error checking duplicates:', matchError)
    }

    // If very similar content exists (>0.95 similarity), skip
    if (existingChunks && existingChunks.length > 0 && existingChunks[0].similarity > 0.95) {
      console.log('learn-reply: Similar content already exists, skipping')
      return new Response(
        JSON.stringify({ success: true, message: 'Similar content already exists' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('learn-reply: Creating document...')

    // Create a document entry so it appears in the Knowledge Base
    // Extract a short summary for the document name
    const firstLine = questionSummary.split('\n')[0].slice(0, 60).trim()
    const ticketLabel = ticketId ? `Ticket #${ticketId}` : 'Live Reply'
    const docName = `${ticketLabel}: ${firstLine}${firstLine.length >= 60 ? '...' : ''}`

    console.log('learn-reply: Document name:', docName)

    // Store structured content with metadata for display in admin dashboard
    const structuredContent = JSON.stringify({
      type: 'learned_reply',
      ticketId: ticketId || null,
      question: questionSummary,
      answer: answerSummary,
      learnedAt: new Date().toISOString(),
      combinedText,
    })

    // Save to documents table
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .insert({
        business_id: businessId,
        name: docName,
        content: structuredContent,
      })
      .select('id')
      .single()

    if (docError) {
      console.error('learn-reply: Document insert error:', docError)
      throw docError
    }

    console.log('learn-reply: Document created:', doc.id, ', saving chunk...')

    // Save chunk with embedding
    const { error: chunkError } = await supabase
      .from('chunks')
      .insert({
        document_id: doc.id,
        content: combinedText,
        embedding,
      })

    if (chunkError) {
      console.error('learn-reply: Chunk insert error:', chunkError)
      throw chunkError
    }

    console.log('learn-reply: Successfully learned from reply, document:', doc.id)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Learned from reply',
        documentId: doc.id,
        documentName: docName,
        ticketId: ticketId || null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
    const errorStack = error instanceof Error ? error.stack : undefined
    console.error('learn-reply: Error:', errorMessage)
    if (errorStack) {
      console.error('learn-reply: Stack:', errorStack)
    }
    return new Response(
      JSON.stringify({
        error: errorMessage
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
