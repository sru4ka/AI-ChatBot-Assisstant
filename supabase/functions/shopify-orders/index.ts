import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
}

interface RequestBody {
  businessId: string
  searchQuery: string // email, order number, or phone
}

interface ShopifyOrder {
  id: number
  name: string // order number like #1001
  email: string
  phone: string | null
  created_at: string
  financial_status: string
  fulfillment_status: string | null
  total_price: string
  currency: string
  line_items: ShopifyLineItem[]
  shipping_address: ShopifyAddress | null
  tracking_numbers: string[]
  tracking_urls: string[]
  tracking_companies: string[]
  note: string | null
  note_attributes: { name: string; value: string }[]
}

interface ShopifyLineItem {
  id: number
  title: string
  quantity: number
  price: string
  sku: string | null
}

interface ShopifyAddress {
  first_name: string
  last_name: string
  address1: string
  address2: string | null
  city: string
  province: string
  country: string
  zip: string
}

/**
 * Search Shopify orders by email, order number, or phone
 */
async function searchOrders(
  storeDomain: string,
  accessToken: string,
  query: string,
  apiVersion = '2024-01'
): Promise<ShopifyOrder[]> {
  // Try different search strategies
  const searches: string[] = []

  // Check if it looks like an order number
  if (query.startsWith('#') || /^\d+$/.test(query)) {
    const orderNum = query.replace('#', '')
    searches.push(`name:#${orderNum}`)
  }

  // Check if it looks like an email
  if (query.includes('@')) {
    searches.push(`email:${query}`)
  }

  // Check if it looks like a phone number
  if (/^[\d\s\-+()]+$/.test(query) && query.length >= 7) {
    searches.push(`phone:${query.replace(/\D/g, '')}`)
  }

  // If no specific type detected, search by email
  if (searches.length === 0) {
    searches.push(`email:${query}`)
  }

  const allOrders: ShopifyOrder[] = []

  for (const searchQuery of searches) {
    try {
      const url = `https://${storeDomain}/admin/api/${apiVersion}/orders.json?status=any&limit=10&query=${encodeURIComponent(searchQuery)}`

      const response = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        console.warn(`Shopify search failed for ${searchQuery}: ${response.status}`)
        continue
      }

      const data = await response.json()

      if (data.orders && data.orders.length > 0) {
        // Get tracking info for each order
        for (const order of data.orders) {
          const trackingNumbers: string[] = []
          const trackingUrls: string[] = []
          const trackingCompanies: string[] = []

          // Fetch fulfillments to get tracking details
          try {
            const fulfillmentsUrl = `https://${storeDomain}/admin/api/${apiVersion}/orders/${order.id}/fulfillments.json`
            const fulfillmentsResponse = await fetch(fulfillmentsUrl, {
              headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json',
              },
            })

            if (fulfillmentsResponse.ok) {
              const fulfillmentsData = await fulfillmentsResponse.json()
              for (const fulfillment of fulfillmentsData.fulfillments || []) {
                if (fulfillment.tracking_number) {
                  trackingNumbers.push(fulfillment.tracking_number)
                }
                if (fulfillment.tracking_url) {
                  trackingUrls.push(fulfillment.tracking_url)
                }
                if (fulfillment.tracking_company) {
                  trackingCompanies.push(fulfillment.tracking_company)
                }
              }
            }
          } catch (e) {
            console.warn('Error fetching fulfillments:', e)
          }

          order.tracking_numbers = trackingNumbers
          order.tracking_urls = trackingUrls
          order.tracking_companies = trackingCompanies
        }

        allOrders.push(...data.orders)
      }
    } catch (error) {
      console.warn(`Search error for ${searchQuery}:`, error)
    }
  }

  // Deduplicate orders by ID
  const uniqueOrders = Array.from(
    new Map(allOrders.map(o => [o.id, o])).values()
  )

  return uniqueOrders
}

/**
 * Format order info for AI context
 */
function formatOrderForAI(order: ShopifyOrder): string {
  const lines: string[] = [
    `Order ${order.name}:`,
    `- Status: ${order.financial_status}${order.fulfillment_status ? `, ${order.fulfillment_status}` : ''}`,
    `- Total: ${order.total_price} ${order.currency}`,
    `- Date: ${new Date(order.created_at).toLocaleDateString()}`,
  ]

  if (order.line_items && order.line_items.length > 0) {
    lines.push('- Items:')
    for (const item of order.line_items.slice(0, 5)) {
      lines.push(`  * ${item.title} x${item.quantity} - ${item.price}`)
    }
    if (order.line_items.length > 5) {
      lines.push(`  ... and ${order.line_items.length - 5} more items`)
    }
  }

  if (order.tracking_numbers && order.tracking_numbers.length > 0) {
    lines.push(`- Tracking: ${order.tracking_numbers.join(', ')}`)
  }

  if (order.shipping_address) {
    const addr = order.shipping_address
    lines.push(`- Ship to: ${addr.city}, ${addr.province}, ${addr.country}`)
  }

  return lines.join('\n')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { businessId, searchQuery }: RequestBody = await req.json()

    if (!businessId || !searchQuery) {
      return new Response(
        JSON.stringify({ error: 'businessId and searchQuery are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get business with Shopify credentials
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, shopify_domain, shopify_access_token')
      .eq('id', businessId)
      .single()

    if (businessError || !business) {
      return new Response(
        JSON.stringify({ error: 'Business not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!business.shopify_domain || !business.shopify_access_token) {
      return new Response(
        JSON.stringify({ error: 'Shopify not configured for this business' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Search orders
    const orders = await searchOrders(
      business.shopify_domain,
      business.shopify_access_token,
      searchQuery.trim()
    )

    if (orders.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          found: false,
          message: 'No orders found',
          orders: [],
          formatted: 'No orders found for this customer.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Format orders for display and AI context
    const formatted = orders.map(formatOrderForAI).join('\n\n')

    return new Response(
      JSON.stringify({
        success: true,
        found: true,
        storeDomain: business.shopify_domain,
        orders: orders.map(o => ({
          id: o.id,
          name: o.name,
          email: o.email,
          status: o.financial_status,
          fulfillmentStatus: o.fulfillment_status,
          total: `${o.total_price} ${o.currency}`,
          date: o.created_at,
          trackingNumbers: o.tracking_numbers,
          trackingUrls: o.tracking_urls,
          trackingCompanies: o.tracking_companies,
          note: o.note,
          noteAttributes: o.note_attributes,
          itemCount: o.line_items?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 0,
          items: o.line_items?.slice(0, 5).map(item => ({
            title: item.title,
            quantity: item.quantity,
            price: item.price,
          })),
          shippingAddress: o.shipping_address ? {
            city: o.shipping_address.city,
            province: o.shipping_address.province,
            country: o.shipping_address.country,
          } : null,
          adminUrl: `https://${business.shopify_domain}/admin/orders/${o.id}`,
        })),
        formatted,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error searching orders:', error)
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
