import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Configuration will be loaded from storage
interface Config {
  supabaseUrl: string
  supabaseAnonKey: string
  businessId: string
}

let supabase: SupabaseClient | null = null

export async function getConfig(): Promise<Config | null> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['supabaseUrl', 'supabaseAnonKey', 'businessId'], (result) => {
      if (result.supabaseUrl && result.supabaseAnonKey && result.businessId) {
        resolve({
          supabaseUrl: result.supabaseUrl,
          supabaseAnonKey: result.supabaseAnonKey,
          businessId: result.businessId,
        })
      } else {
        resolve(null)
      }
    })
  })
}

export async function saveConfig(config: Config): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set(config, () => {
      supabase = createClient(config.supabaseUrl, config.supabaseAnonKey)
      resolve()
    })
  })
}

export async function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (supabase) return supabase

  const config = await getConfig()
  if (!config) return null

  supabase = createClient(config.supabaseUrl, config.supabaseAnonKey)
  return supabase
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
    throw new Error('Extension not configured. Please set up your credentials.')
  }

  const client = await getSupabaseClient()
  if (!client) {
    throw new Error('Could not connect to Supabase')
  }

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
