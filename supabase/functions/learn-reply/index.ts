import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI from 'https://esm.sh/openai@4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
}

interface RequestBody {
  businessId: string
  question: string
  answer: string
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
    const { businessId, question, answer }: RequestBody = await req.json()

    // Validate required fields
    if (!businessId || !question || !answer) {
      return new Response(
        JSON.stringify({ error: 'businessId, question, and answer are required' }),
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

    // Generate embedding
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: combinedText,
    })
    const embedding = embeddingResponse.data[0].embedding

    // Check if similar content already exists (to avoid duplicates)
    const { data: existingChunks } = await supabase.rpc('match_chunks', {
      query_embedding: embedding,
      match_count: 1,
      p_business_id: businessId,
    })

    // If very similar content exists (>0.95 similarity), skip
    if (existingChunks && existingChunks.length > 0 && existingChunks[0].similarity > 0.95) {
      console.log('Similar content already exists, skipping')
      return new Response(
        JSON.stringify({ success: true, message: 'Similar content already exists' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create a document entry so it appears in the Knowledge Base
    // Extract a short summary for the document name
    const firstLine = questionSummary.split('\n')[0].slice(0, 80).trim()
    const docName = `Learned: ${firstLine}${firstLine.length >= 80 ? '...' : ''}`

    // Save to documents table
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .insert({
        business_id: businessId,
        name: docName,
        content: combinedText,
      })
      .select('id')
      .single()

    if (docError) throw docError

    // Save chunk with embedding
    const { error: chunkError } = await supabase
      .from('chunks')
      .insert({
        document_id: doc.id,
        content: combinedText,
        embedding,
      })

    if (chunkError) throw chunkError

    console.log('Successfully learned from reply, document created:', doc.id)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Learned from reply',
        documentId: doc.id,
        documentName: docName,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error learning from reply:', error)
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
