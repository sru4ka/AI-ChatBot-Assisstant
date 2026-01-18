const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
}

interface RequestBody {
  businessId: string
  trackingNumber: string
  carrier?: string // optional carrier code
  trackingUrl?: string // optional tracking URL for scraping fallback
}

interface TrackingEvent {
  time: string
  location: string
  description: string
}

interface TrackingResult {
  success: boolean
  trackingNumber: string
  carrier: string | null
  status: string
  statusDescription: string
  estimatedDelivery: string | null
  lastUpdate: string | null
  events: TrackingEvent[]
  error?: string
}

// Map TrackingMore status to readable descriptions
const statusMap: Record<string, string> = {
  'pending': 'Pending',
  'notfound': 'Not Found',
  'transit': 'In Transit',
  'pickup': 'Ready for Pickup',
  'delivered': 'Delivered',
  'expired': 'Expired',
  'undelivered': 'Undelivered',
  'exception': 'Exception',
  'inforeceived': 'Info Received',
}

// Map carrier names to TrackingMore carrier codes
const carrierCodes: Record<string, string> = {
  'usps': 'usps',
  'ups': 'ups',
  'fedex': 'fedex',
  'dhl': 'dhl',
  'china-post': 'china-post',
  'china-ems': 'china-ems',
  'yanwen': 'yanwen',
  'yunexpress': 'yunexpress',
  'yun express': 'yunexpress',
  '4px': '4px',
  'cainiao': 'cainiao',
  'amazon': 'amazon-fba-usa',
  'aliexpress': 'aliexpress-standard-shipping',
}

/**
 * Scrape a tracking URL for status keywords
 * Returns a basic status based on keywords found in the page
 */
async function scrapeTrackingUrl(url: string): Promise<{ status: string; statusDescription: string; rawText?: string } | null> {
  try {
    console.log('Scraping tracking URL:', url)

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    })

    if (!response.ok) {
      console.log('Scrape failed with status:', response.status)
      return null
    }

    const html = await response.text()
    const textLower = html.toLowerCase()

    // Look for status keywords in priority order
    const statusKeywords: Array<{ keywords: string[]; status: string; description: string }> = [
      { keywords: ['delivered', 'delivery completed', 'has been delivered', 'was delivered', 'package delivered'], status: 'delivered', description: 'Delivered' },
      { keywords: ['out for delivery', 'out-for-delivery', 'on vehicle for delivery'], status: 'out_for_delivery', description: 'Out for Delivery' },
      { keywords: ['in transit', 'in-transit', 'on the way', 'on its way', 'shipment in progress', 'en route'], status: 'transit', description: 'In Transit' },
      { keywords: ['arrived at', 'departed from', 'processed', 'arrived at destination'], status: 'transit', description: 'In Transit' },
      { keywords: ['pickup scheduled', 'ready for pickup', 'available for pickup'], status: 'pickup', description: 'Ready for Pickup' },
      { keywords: ['shipped', 'dispatched', 'label created', 'shipping label', 'order shipped'], status: 'shipped', description: 'Shipped' },
      { keywords: ['exception', 'delivery attempt', 'delivery failed', 'unable to deliver', 'returned'], status: 'exception', description: 'Exception' },
      { keywords: ['pending', 'awaiting shipment', 'not yet shipped', 'processing'], status: 'pending', description: 'Pending' },
    ]

    for (const { keywords, status, description } of statusKeywords) {
      for (const keyword of keywords) {
        if (textLower.includes(keyword)) {
          console.log(`Found keyword "${keyword}" - status: ${status}`)

          // Try to extract days to delivery
          let daysMatch = html.match(/(\d+)\s*(?:days?|business days?)\s*(?:to|until|for)?\s*(?:delivery|arrive)/i)
          let extraInfo = ''
          if (daysMatch) {
            extraInfo = ` (Est. ${daysMatch[1]} days)`
          }

          // Try to extract delivery date
          const dateMatch = html.match(/(?:estimated|expected|delivery)[\s:]+(?:by\s+)?([A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i)
          if (dateMatch && !extraInfo) {
            extraInfo = ` (Est. ${dateMatch[1]})`
          }

          return {
            status,
            statusDescription: description + extraInfo,
          }
        }
      }
    }

    console.log('No status keywords found in page')
    return null
  } catch (error) {
    console.error('Error scraping tracking URL:', error)
    return null
  }
}

/**
 * Try to detect carrier from tracking number format
 * Returns TrackingMore carrier code
 */
function detectCarrier(trackingNumber: string): string | null {
  const num = trackingNumber.toUpperCase().replace(/\s/g, '')

  // USPS patterns
  if (/^(94|93|92|91)\d{20,}$/.test(num) ||
      /^[A-Z]{2}\d{9}US$/.test(num)) {
    return 'usps'
  }

  // UPS patterns
  if (/^1Z[A-Z0-9]{16}$/.test(num) ||
      /^T\d{10}$/.test(num)) {
    return 'ups'
  }

  // FedEx patterns
  if (/^\d{12}$/.test(num) ||
      /^\d{15}$/.test(num) ||
      /^\d{20}$/.test(num)) {
    return 'fedex'
  }

  // DHL patterns
  if (/^\d{10}$/.test(num) ||
      /^[A-Z]{3}\d{7}$/.test(num)) {
    return 'dhl'
  }

  // China Post / China EMS patterns
  if (/^[A-Z]{2}\d{9}CN$/.test(num)) {
    return 'china-ems'
  }

  // YunExpress patterns
  if (/^YT\d{16}$/.test(num)) {
    return 'yunexpress'
  }

  // 4PX patterns
  if (/^4PX\d+$/.test(num) ||
      /^UUSC\d+$/.test(num)) {
    return '4px'
  }

  // Cainiao patterns
  if (/^LP\d+$/.test(num) ||
      /^CAINIAO\d+$/.test(num)) {
    return 'cainiao'
  }

  return null // Let TrackingMore auto-detect
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

    const { businessId, trackingNumber, carrier, trackingUrl }: RequestBody = await req.json()

    if (!businessId || !trackingNumber) {
      return new Response(
        JSON.stringify({ error: 'businessId and trackingNumber are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Use global TrackingMore API key from environment variable
    const trackingApiKey = Deno.env.get('TRACKINGMORE_API_KEY')

    // If no API key, try scraping as primary method
    if (!trackingApiKey) {
      console.log('No API key, trying URL scraping...')

      if (trackingUrl) {
        const scraped = await scrapeTrackingUrl(trackingUrl)
        if (scraped) {
          return new Response(
            JSON.stringify({
              success: true,
              trackingNumber,
              carrier: carrier || null,
              status: scraped.status,
              statusDescription: scraped.statusDescription,
              estimatedDelivery: null,
              lastUpdate: null,
              events: [],
              source: 'scraped',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: 'Tracking API not configured and scraping failed.',
          trackingNumber,
          carrier: null,
          status: 'not_configured',
          statusDescription: 'Tracking unavailable',
          estimatedDelivery: null,
          lastUpdate: null,
          events: [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Clean tracking number
    const cleanTrackingNumber = trackingNumber.trim().replace(/\s/g, '')

    // Detect or use provided carrier
    let carrierCode: string | null = null
    if (carrier) {
      const lowerCarrier = carrier.toLowerCase().replace(/\s+/g, '-')
      carrierCode = carrierCodes[lowerCarrier] || lowerCarrier
    } else {
      carrierCode = detectCarrier(cleanTrackingNumber)
    }

    // Build request body for TrackingMore realtime API
    const requestBody: { tracking_number: string; carrier_code?: string } = {
      tracking_number: cleanTrackingNumber,
    }
    if (carrierCode) {
      requestBody.carrier_code = carrierCode
    }

    // Call TrackingMore realtime API
    const trackResponse = await fetch('https://api.trackingmore.com/v3/trackings/realtime', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Tracking-Api-Key': trackingApiKey,
      },
      body: JSON.stringify(requestBody),
    })

    const trackData = await trackResponse.json()
    console.log('TrackingMore response:', JSON.stringify(trackData))

    // Parse the response
    const result: TrackingResult = {
      success: true,
      trackingNumber: cleanTrackingNumber,
      carrier: null,
      status: 'unknown',
      statusDescription: 'Unknown',
      estimatedDelivery: null,
      lastUpdate: null,
      events: [],
    }

    // Check for API errors - try scraping as fallback
    if (trackData.meta?.code !== 200) {
      console.log('API failed, trying URL scraping fallback...')

      // Try scraping the tracking URL if provided
      if (trackingUrl) {
        const scraped = await scrapeTrackingUrl(trackingUrl)
        if (scraped) {
          return new Response(
            JSON.stringify({
              success: true,
              trackingNumber: cleanTrackingNumber,
              carrier: carrierCode || null,
              status: scraped.status,
              statusDescription: scraped.statusDescription,
              estimatedDelivery: null,
              lastUpdate: null,
              events: [],
              source: 'scraped',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      result.success = false
      result.error = trackData.meta?.message || 'API error'
      result.status = 'error'
      result.statusDescription = trackData.meta?.message || 'Error'

      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse successful response
    const data = trackData.data
    if (data) {
      // Get carrier info
      if (data.carrier_code) {
        result.carrier = data.carrier_code
      }

      // Get status
      const status = data.delivery_status || 'pending'
      result.status = status
      result.statusDescription = statusMap[status] || status.charAt(0).toUpperCase() + status.slice(1)

      // Get last update time
      if (data.lastest_checkpoint_time || data.latest_checkpoint_time) {
        result.lastUpdate = data.lastest_checkpoint_time || data.latest_checkpoint_time
      }

      // Get estimated delivery (if available)
      if (data.expected_delivery) {
        result.estimatedDelivery = data.expected_delivery
      }

      // Get tracking events from origin_info
      const trackInfo = data.origin_info?.trackinfo || data.destination_info?.trackinfo || []
      if (Array.isArray(trackInfo)) {
        result.events = trackInfo.map((event: { Date?: string; StatusDescription?: string; Details?: string }) => ({
          time: event.Date || '',
          location: event.Details || '',
          description: event.StatusDescription || '',
        }))
      }
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error tracking package:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
        trackingNumber: '',
        carrier: null,
        status: 'error',
        statusDescription: 'Error',
        estimatedDelivery: null,
        lastUpdate: null,
        events: [],
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
