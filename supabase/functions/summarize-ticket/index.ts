import OpenAI from 'https://esm.sh/openai@4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
}

interface RequestBody {
  businessId: string
  conversation: string
  ticketId?: string
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
    const { businessId, conversation, ticketId }: RequestBody = await req.json()

    // Validate required fields
    if (!businessId || !conversation) {
      return new Response(
        JSON.stringify({ error: 'businessId and conversation are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: Deno.env.get('OPENAI_API_KEY'),
    })

    // Build the prompt for summarization
    const systemPrompt = `You are an expert at summarizing customer support ticket conversations. Your job is to analyze a support ticket conversation and provide a clear, concise summary.

Your output should be a JSON object with the following structure:
{
  "summary": "A 2-3 sentence summary of the entire conversation, including the main issue and current status",
  "keyPoints": ["Key point 1", "Key point 2", "Key point 3"], // 3-5 bullet points of important information
  "sentiment": "positive|negative|neutral|frustrated", // The customer's overall sentiment
  "actionNeeded": "What action (if any) needs to be taken next" // null if no action needed
}

Guidelines:
- Be concise but capture all essential information
- Identify the main issue the customer is facing
- Note any order numbers, tracking numbers, or specific product details
- Capture the current status of the issue (resolved, pending, escalated, etc.)
- Identify the customer's emotional state (frustrated, satisfied, confused, etc.)
- If the conversation shows a resolved issue, note that clearly
- If there's an ongoing problem, highlight what still needs to be addressed

IMPORTANT: Return ONLY the JSON object, no additional text.`

    // Call OpenAI to generate the summary
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Please summarize this support ticket conversation:\n\n${conversation}` },
      ],
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    })

    const responseContent = completion.choices[0].message.content || '{}'

    let parsedResponse
    try {
      parsedResponse = JSON.parse(responseContent)
    } catch (e) {
      console.error('Failed to parse OpenAI response:', responseContent)
      parsedResponse = {
        summary: responseContent,
        keyPoints: [],
        sentiment: 'neutral',
        actionNeeded: null
      }
    }

    return new Response(
      JSON.stringify({
        summary: parsedResponse.summary || 'Unable to generate summary',
        keyPoints: parsedResponse.keyPoints || [],
        sentiment: parsedResponse.sentiment || 'neutral',
        actionNeeded: parsedResponse.actionNeeded || null,
        ticketId,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Error summarizing ticket:', error)
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
