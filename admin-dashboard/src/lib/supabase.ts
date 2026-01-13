import { createClient } from '@supabase/supabase-js'

// These should be replaced with actual values from environment or config
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types for database tables
export interface Business {
  id: string
  name: string
  freshdesk_domain: string | null
  freshdesk_api_key: string | null
  shopify_domain: string | null
  shopify_access_token: string | null
  website_url: string | null
  created_at: string
}

export interface Document {
  id: string
  business_id: string
  name: string
  content: string
  created_at: string
}

// API functions
export async function generateReply(businessId: string, customerMessage: string, tone?: string) {
  const response = await supabase.functions.invoke('generate-reply', {
    body: { businessId, customerMessage, tone },
  })

  if (response.error) {
    throw new Error(response.error.message)
  }

  return response.data
}

export async function ingestDocument(businessId: string, documentContent: string, documentName: string) {
  const response = await supabase.functions.invoke('ingest-document', {
    body: { businessId, documentContent, documentName },
  })

  if (response.error) {
    throw new Error(response.error.message)
  }

  return response.data
}
