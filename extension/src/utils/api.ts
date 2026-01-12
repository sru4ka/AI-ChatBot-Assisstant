import { createClient, SupabaseClient, User } from '@supabase/supabase-js'

// Hardcoded Supabase configuration
const SUPABASE_URL = 'https://iyeqiwixenjiakeisdae.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_gx-_bqwBK-ghrRnXxf6b4g_cA6mfMkF'

let supabase: SupabaseClient | null = null

// Initialize Supabase client
function getSupabase(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: {
          getItem: (key) => {
            return new Promise((resolve) => {
              chrome.storage.local.get([key], (result) => {
                resolve(result[key] || null)
              })
            })
          },
          setItem: (key, value) => {
            return new Promise((resolve) => {
              chrome.storage.local.set({ [key]: value }, () => {
                resolve()
              })
            })
          },
          removeItem: (key) => {
            return new Promise((resolve) => {
              chrome.storage.local.remove([key], () => {
                resolve()
              })
            })
          },
        },
      },
    })
  }
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

// Auth functions
export async function signIn(email: string, password: string): Promise<User> {
  const client = getSupabase()
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  })

  if (error) throw error
  if (!data.user) throw new Error('Login failed')

  return data.user
}

export async function signUp(email: string, password: string, businessName: string): Promise<User> {
  const client = getSupabase()

  // Sign up the user
  const { data, error } = await client.auth.signUp({
    email,
    password,
  })

  if (error) throw error
  if (!data.user) throw new Error('Sign up failed')

  // Create their business record using their user ID as business ID
  const { error: bizError } = await client.from('businesses').insert({
    id: data.user.id,
    name: businessName,
  })

  if (bizError) {
    console.error('Error creating business:', bizError)
    // Don't throw - user is created, business might already exist
  }

  return data.user
}

export async function signOut(): Promise<void> {
  const client = getSupabase()
  const { error } = await client.auth.signOut()
  if (error) throw error
}

export async function getCurrentUser(): Promise<User | null> {
  const client = getSupabase()
  const { data: { user } } = await client.auth.getUser()
  return user
}

export async function isLoggedIn(): Promise<boolean> {
  const user = await getCurrentUser()
  return user !== null
}

// Generate reply using the logged-in user's business
export async function generateReply(
  customerMessage: string,
  tone: 'professional' | 'friendly' | 'concise' = 'professional'
): Promise<GenerateReplyResponse> {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('Please log in to use this extension.')
  }

  const client = getSupabase()

  // User's ID is their business ID
  const response = await client.functions.invoke('generate-reply', {
    body: {
      businessId: user.id,
      customerMessage,
      tone,
    },
  })

  if (response.error) {
    throw new Error(response.error.message)
  }

  return response.data
}

export { getSupabase }
