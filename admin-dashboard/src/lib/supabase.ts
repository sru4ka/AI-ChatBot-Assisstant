/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js'

// Hardcoded Supabase configuration
const supabaseUrl = 'https://iyeqiwixenjiakeisdae.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5ZXFpd2l4ZW5qaWFrZWlzZGFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY3OTE5NjAsImV4cCI6MjA1MjM2Nzk2MH0.s_hHmUnFiQxhL8dZkfcxQh5Q-IptKZDFHqW7dtUXd1Y'

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
