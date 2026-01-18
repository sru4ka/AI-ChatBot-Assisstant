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
  tracking_statuses: string[]
  note: string | null
  note_attributes: { name: string; value: string }[]
  events: ShopifyEvent[]
}

interface ShopifyEvent {
  id: number
  created_at: string
  message: string
  subject_type: string
  verb: string
  author: string | null
  body: string | null
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
  apiVersion = '2024-10'
): Promise<ShopifyOrder[]> {
  // Try different search strategies
  const searches: string[] = []

  console.log('Searching for:', query)

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

  // Check if it looks like a customer name (contains space, no special chars)
  if (query.includes(' ') && !query.includes('@') && !/^\d+$/.test(query)) {
    // Search by customer name - try both first name and full name
    const nameParts = query.trim().split(/\s+/)
    if (nameParts.length >= 2) {
      // Try first name + last name
      searches.push(`customer_name:${query}`)
      // Also try just by first name
      searches.push(`customer_first_name:${nameParts[0]}`)
    } else {
      searches.push(`customer_name:${query}`)
    }
  }

  // If no specific type detected, try as general search
  if (searches.length === 0) {
    searches.push(`email:${query}`)
    searches.push(`customer_name:${query}`)
  }

  console.log('Search queries:', searches)

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
        // Get tracking info and events for each order
        for (const order of data.orders) {
          const trackingNumbers: string[] = []
          const trackingUrls: string[] = []
          const trackingCompanies: string[] = []
          const trackingStatuses: string[] = []
          let events: ShopifyEvent[] = []

          // Fetch fulfillments to get tracking details and status
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
                // Get shipment status (delivered, in_transit, out_for_delivery, etc.)
                if (fulfillment.shipment_status) {
                  trackingStatuses.push(fulfillment.shipment_status)
                }
              }
            }
          } catch (e) {
            console.warn('Error fetching fulfillments:', e)
          }

          // Fetch order timeline events - try REST API first (more reliable), then GraphQL for comments
          try {
            // First, try REST Events API
            const eventsUrl = `https://${storeDomain}/admin/api/${apiVersion}/orders/${order.id}/events.json`
            console.log('Fetching REST events from:', eventsUrl)

            const eventsResponse = await fetch(eventsUrl, {
              headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json',
              },
            })

            if (eventsResponse.ok) {
              const eventsData = await eventsResponse.json()
              console.log('REST Events response:', JSON.stringify(eventsData).substring(0, 500))

              events = (eventsData.events || [])
                .slice(0, 20)
                .map((e: { id: number; created_at: string; message: string; subject_type: string; verb: string; author?: string; body?: string }) => ({
                  id: e.id,
                  created_at: e.created_at,
                  message: e.message,
                  subject_type: e.subject_type,
                  verb: e.verb,
                  author: e.author || null,
                  body: e.body || null,
                }))

              console.log('Parsed REST events:', events.length)
            } else {
              console.warn('REST Events API failed:', eventsResponse.status, await eventsResponse.text())
            }

            // Also try GraphQL for comments (staff notes)
            const graphqlUrl = `https://${storeDomain}/admin/api/${apiVersion}/graphql.json`
            const graphqlQuery = `
              query getOrderTimeline($id: ID!) {
                order(id: $id) {
                  id
                  note
                  hasTimelineComment
                  events(first: 50, sortKey: CREATED_AT, reverse: true) {
                    edges {
                      node {
                        __typename
                        id
                        createdAt
                        message
                        attributeToApp
                        attributeToUser
                        criticalAlert
                        ... on CommentEvent {
                          rawMessage
                          attachments {
                            id
                            name
                            url
                          }
                          author {
                            name
                          }
                          canDelete
                          canEdit
                          edited
                        }
                        ... on BasicEvent {
                          appTitle
                        }
                      }
                    }
                  }
                }
              }
            `

            const graphqlResponse = await fetch(graphqlUrl, {
              method: 'POST',
              headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                query: graphqlQuery,
                variables: { id: `gid://shopify/Order/${order.id}` }
              }),
            })

            if (graphqlResponse.ok) {
              const graphqlData = await graphqlResponse.json()
              console.log('GraphQL response for order', order.id, ':', JSON.stringify(graphqlData).substring(0, 1000))

              if (graphqlData.errors) {
                console.warn('GraphQL errors:', JSON.stringify(graphqlData.errors))
              }

              // Check if order has timeline comments
              const hasComments = graphqlData.data?.order?.hasTimelineComment
              console.log('Order has timeline comments:', hasComments)

              const timelineEvents = graphqlData.data?.order?.events?.edges || []
              console.log('Total GraphQL timeline events:', timelineEvents.length)

              // Merge GraphQL events with REST events, preferring comments from GraphQL
              const graphqlEvents = timelineEvents.map((edge: { node: { __typename: string; id: string; createdAt: string; message: string; rawMessage?: string; author?: { name: string }; attributeToUser?: boolean } }) => {
                const isComment = edge.node.__typename === 'CommentEvent'
                return {
                  id: edge.node.id,
                  created_at: edge.node.createdAt,
                  message: edge.node.message,
                  subject_type: 'Order',
                  verb: isComment ? 'comment' : 'event',
                  author: edge.node.author?.name || null,
                  body: edge.node.rawMessage || null,
                }
              })

              // Add any comments from GraphQL that aren't in REST events
              const existingIds = new Set(events.map(e => String(e.id)))
              for (const gqlEvent of graphqlEvents) {
                // Extract numeric ID from GraphQL ID format
                const numericId = gqlEvent.id.replace(/\D/g, '')
                if (!existingIds.has(numericId) && !existingIds.has(gqlEvent.id)) {
                  events.push(gqlEvent)
                }
              }

              // Sort by date
              events.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

              console.log('Final merged events:', events.length, 'comments:', events.filter((e: ShopifyEvent) => e.verb === 'comment').length)
            } else {
              console.warn('GraphQL response not ok:', graphqlResponse.status, await graphqlResponse.text())
            }
          } catch (e) {
            console.warn('Error fetching timeline events:', e)
          }

          order.tracking_numbers = trackingNumbers
          order.tracking_urls = trackingUrls
          order.tracking_companies = trackingCompanies
          order.tracking_statuses = trackingStatuses
          order.events = events
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
          trackingStatuses: o.tracking_statuses,
          note: o.note,
          noteAttributes: o.note_attributes,
          events: o.events,
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
