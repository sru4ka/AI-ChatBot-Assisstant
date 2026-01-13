import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI from 'https://esm.sh/openai@4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
}

interface RequestBody {
  businessId: string
  documentContent: string
  documentName: string
}

/**
 * Split text into chunks with overlap
 * @param text - The text to split
 * @param chunkSize - Target size of each chunk in characters (roughly 500 tokens)
 * @param overlap - Number of characters to overlap between chunks
 */
function splitTextIntoChunks(text: string, chunkSize = 2000, overlap = 200): string[] {
  const chunks: string[] = []

  // Clean and normalize the text
  const cleanedText = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (cleanedText.length <= chunkSize) {
    return [cleanedText]
  }

  let start = 0
  while (start < cleanedText.length) {
    let end = Math.min(start + chunkSize, cleanedText.length)

    // Try to break at a natural boundary (paragraph, sentence, or word)
    if (end < cleanedText.length) {
      // Look for paragraph break
      const paragraphBreak = cleanedText.lastIndexOf('\n\n', end)
      if (paragraphBreak > start + chunkSize / 2) {
        end = paragraphBreak
      } else {
        // Look for sentence break
        const sentenceBreak = cleanedText.lastIndexOf('. ', end)
        if (sentenceBreak > start + chunkSize / 2) {
          end = sentenceBreak + 1
        } else {
          // Look for word break
          const wordBreak = cleanedText.lastIndexOf(' ', end)
          if (wordBreak > start + chunkSize / 2) {
            end = wordBreak
          }
        }
      }
    }

    const chunk = cleanedText.slice(start, end).trim()
    if (chunk.length > 0) {
      chunks.push(chunk)
    }

    // Move start position, accounting for overlap
    start = end - overlap
    if (start >= cleanedText.length - overlap) break
  }

  return chunks
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
    const { businessId, documentContent, documentName }: RequestBody = await req.json()

    // Validate required fields
    if (!businessId || !documentContent || !documentName) {
      return new Response(
        JSON.stringify({ error: 'businessId, documentContent, and documentName are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate content length (max ~100KB to prevent abuse)
    if (documentContent.length > 100000) {
      return new Response(
        JSON.stringify({ error: 'Document too large. Maximum size is 100KB.' }),
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

    // 1. Verify the business exists
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

    // 2. Save the document
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .insert({
        business_id: businessId,
        name: documentName,
        content: documentContent,
      })
      .select('id')
      .single()

    if (docError) {
      console.error('Document insert error:', docError)
      throw new Error(`Failed to save document: ${docError.message}`)
    }

    // 3. Split content into chunks
    const chunks = splitTextIntoChunks(documentContent)
    console.log(`Split document into ${chunks.length} chunks`)

    // 4. Generate embeddings for all chunks in batches
    const batchSize = 20 // OpenAI allows up to 2048 inputs, but we'll be conservative
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

    // 5. Store chunks with embeddings
    const chunkRows = chunks.map((content, index) => ({
      document_id: doc.id,
      content,
      embedding: allEmbeddings[index],
    }))

    const { error: chunkError } = await supabase
      .from('chunks')
      .insert(chunkRows)

    if (chunkError) {
      // Clean up the document if chunk insertion fails
      await supabase.from('documents').delete().eq('id', doc.id)
      console.error('Chunk insert error:', chunkError)
      throw new Error(`Failed to save chunks: ${chunkError.message}`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        documentId: doc.id,
        chunkCount: chunks.length,
        documentName,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Error ingesting document:', error)
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
