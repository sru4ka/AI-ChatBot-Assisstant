import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

// Map 17track status codes to readable status
const statusMap: Record<number, { status: string; description: string }> = {
  0: { status: 'not_found', description: 'Not Found' },
  10: { status: 'in_transit', description: 'In Transit' },
  20: { status: 'expired', description: 'Expired' },
  30: { status: 'pickup', description: 'Ready for Pickup' },
  35: { status: 'undelivered', description: 'Undelivered' },
  40: { status: 'delivered', description: 'Delivered' },
  50: { status: 'alert', description: 'Alert' },
}

// Map carrier codes
const carrierCodes: Record<string, number> = {
  'usps': 21051,
  'ups': 100002,
  'fedex': 100003,
  'dhl': 100001,
  'china-post': 3011,
  'china-ems': 3001,
  'yanwen': 190012,
  'yunexpress': 190111,
  '4px': 190233,
  'cainiao': 2021,
  'amazon': 100143,
}

/**
 * Try to detect carrier from tracking number format
 */
function detectCarrier(trackingNumber: string): number | null {
  const num = trackingNumber.toUpperCase().replace(/\s/g, '')

  // USPS patterns
  if (/^(94|93|92|91|94)\d{20,}$/.test(num) ||
      /^[A-Z]{2}\d{9}US$/.test(num)) {
    return carrierCodes['usps']
  }

  // UPS patterns
  if (/^1Z[A-Z0-9]{16}$/.test(num) ||
      /^T\d{10}$/.test(num) ||
      /^\d{26}$/.test(num)) {
    return carrierCodes['ups']
  }

  // FedEx patterns
  if (/^\d{12,15}$/.test(num) ||
      /^\d{20,22}$/.test(num)) {
    return carrierCodes['fedex']
  }

  // DHL patterns
  if (/^\d{10,11}$/.test(num) ||
      /^[A-Z]{3}\d{7}$/.test(num)) {
    return carrierCodes['dhl']
  }

  // China Post / YunExpress patterns
  if (/^[A-Z]{2}\d{9}CN$/.test(num) ||
      /^YT\d{16}$/.test(num)) {
    return carrierCodes['yunexpress']
  }

  // 4PX patterns
  if (/^4PX\d+$/.test(num) ||
      /^UUSC\d+$/.test(num)) {
    return carrierCodes['4px']
  }

  return null // Let 17track auto-detect
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get business with tracking API key
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, tracking_api_key')
      .eq('id', businessId)
      .single()

    if (businessError || !business) {
      return new Response(
        JSON.stringify({ error: 'Business not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!business.tracking_api_key) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Tracking API not configured. Add 17track API key in settings.',
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
    let carrierCode: number | null = null
    if (carrier && carrierCodes[carrier.toLowerCase()]) {
      carrierCode = carrierCodes[carrier.toLowerCase()]
    } else {
      carrierCode = detectCarrier(cleanTrackingNumber)
    }

    // Call 17track API
    // First, register the tracking number
    const registerResponse = await fetch('https://api.17track.net/track/v2.2/register', {
      method: 'POST',
      headers: {
        '17token': business.tracking_api_key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        {
          number: cleanTrackingNumber,
          carrier: carrierCode,
        }
      ]),
    })

    if (!registerResponse.ok) {
      console.error('17track register failed:', registerResponse.status)
    }

    // Wait a moment for registration to process
    await new Promise(resolve => setTimeout(resolve, 500))

    // Get tracking info
    const trackResponse = await fetch('https://api.17track.net/track/v2.2/gettrackinfo', {
      method: 'POST',
      headers: {
        '17token': business.tracking_api_key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        {
          number: cleanTrackingNumber,
        }
      ]),
    })

    if (!trackResponse.ok) {
      throw new Error(`17track API error: ${trackResponse.status}`)
    }

    const trackData = await trackResponse.json()
    console.log('17track response:', JSON.stringify(trackData))

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

    if (trackData.data?.accepted && trackData.data.accepted.length > 0) {
      const trackInfo = trackData.data.accepted[0]
      const track = trackInfo.track

      if (track) {
        // Get carrier info
        if (track.b) {
          result.carrier = track.b
        }

        // Get status
        const statusCode = track.e || 0
        const statusInfo = statusMap[statusCode] || { status: 'unknown', description: 'Unknown' }
        result.status = statusInfo.status
        result.statusDescription = statusInfo.description

        // Get last update time
        if (track.z0?.a) {
          result.lastUpdate = track.z0.a
        }

        // Get estimated delivery (if available)
        if (track.w1) {
          result.estimatedDelivery = track.w1
        }

        // Get tracking events
        if (track.z1 && Array.isArray(track.z1)) {
          result.events = track.z1.map((event: { a?: string; c?: string; z?: string }) => ({
            time: event.a || '',
            location: event.c || '',
            description: event.z || '',
          }))
        }
      }
    } else if (trackData.data?.rejected && trackData.data.rejected.length > 0) {
      result.success = false
      result.error = trackData.data.rejected[0].error?.message || 'Tracking not found'
      result.status = 'not_found'
      result.statusDescription = 'Tracking Not Found'
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
