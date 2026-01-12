import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Hardcoded Supabase configuration - these are public keys, safe to include
const SUPABASE_URL = 'https://iyeqiwixenjiakeisdae.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_gx-_bqwBK-ghrRnXxf6b4g_cA6mfMkF'

// Only Business ID needs to be configured by the user
interface Config {
  businessId: string
}

// For backwards compatibility with old config format
interface LegacyConfig {
  supabaseUrl?: string
  supabaseAnonKey?: string
  businessId: string
}

let supabase: SupabaseClient | null = null

// Initialize Supabase client with hardcoded credentials
function getSupabase(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  }
  return supabase
}

export async function getConfig(): Promise<LegacyConfig | null> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['businessId'], (result) => {
      if (result.businessId) {
        resolve({
          supabaseUrl: SUPABASE_URL,
          supabaseAnonKey: SUPABASE_ANON_KEY,
          businessId: result.businessId,
        })
      } else {
        resolve(null)
      }
    })
  })
}

export async function saveConfig(config: Config | LegacyConfig): Promise<void> {
  return new Promise((resolve) => {
    // Only save businessId - ignore supabaseUrl and supabaseAnonKey if passed
    chrome.storage.sync.set({ businessId: config.businessId }, () => {
      resolve()
    })
  })
}

export async function getSupabaseClient(): Promise<SupabaseClient> {
  return getSupabase()
}

export interface GenerateReplyResponse {
  reply: string
  sources: Array<{
    snippet: string
    similarity: number
  }>
  hasKnowledgeBase: boolean
}

export async function generateReply(
  customerMessage: string,
  tone: 'professional' | 'friendly' | 'concise' = 'professional'
): Promise<GenerateReplyResponse> {
  const config = await getConfig()
  if (!config) {
    throw new Error('Extension not configured. Please set your Business ID.')
  }

  const client = getSupabase()

  const response = await client.functions.invoke('generate-reply', {
    body: {
      businessId: config.businessId,
      customerMessage,
      tone,
    },
  })

  if (response.error) {
    throw new Error(response.error.message)
  }

  return response.data
}

export async function isConfigured(): Promise<boolean> {
  const config = await getConfig()
  return config !== null
}
