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
}

interface ChunkResult {
  content: string
  similarity: number
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
    const { businessId, customerMessage, tone = 'professional', customPrompt }: RequestBody = await req.json()

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
    const hasContext = context.length > 0

    // 3. Build system prompt based on tone
    const toneInstructions = {
      professional: 'Be professional and courteous. Use formal language.',
      friendly: 'Be warm and friendly. Use a conversational tone while remaining helpful.',
      concise: 'Be brief and to the point. Provide only essential information.',
    }

    const systemPrompt = `You are a helpful customer support agent responding to a customer inquiry.

INSTRUCTIONS:
- Use ONLY the following knowledge base to answer the customer's question
- If the answer is not in the knowledge base, politely say you'll check with the team and get back to them
- ${toneInstructions[tone]}
- Keep responses concise but complete
- Never make up information not in the knowledge base
- Do not mention that you're using a knowledge base or AI
- Write as if you are a real support agent replying to the customer
- DO NOT include any signature, sign-off, name, or closing like "Best regards, [Name]" - the user will add their own signature
- End your response with the last relevant sentence of your answer
${customPrompt ? `\nADDITIONAL INSTRUCTIONS FROM USER:\n${customPrompt}` : ''}

KNOWLEDGE BASE:
${hasContext ? context : 'No relevant documentation found for this query.'}

${!hasContext ? 'Since no relevant documentation was found, acknowledge the question and offer to escalate to a specialist.' : ''}`

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
