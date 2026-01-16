const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
}

interface RequestBody {
  businessId: string
  trackingNumber: string
  carrier?: string // optional carrier code
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

    const { businessId, trackingNumber, carrier }: RequestBody = await req.json()

    if (!businessId || !trackingNumber) {
      return new Response(
        JSON.stringify({ error: 'businessId and trackingNumber are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Use global TrackingMore API key from environment variable
    const trackingApiKey = Deno.env.get('TRACKINGMORE_API_KEY')

    if (!trackingApiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Tracking API not configured on server.',
          trackingNumber,
          carrier: null,
          status: 'not_configured',
          statusDescription: 'Tracking API not configured',
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

    // Check for API errors
    if (trackData.meta?.code !== 200) {
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
