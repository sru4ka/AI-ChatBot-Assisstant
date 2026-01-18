const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
}

interface RequestBody {
  businessId: string
  trackingNumber: string
  carrier?: string
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
  source?: string
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
 * Query 4PX API directly for tracking status
 */
async function query4PXApi(trackingNumber: string): Promise<{ status: string; statusDescription: string; events: TrackingEvent[] } | null> {
  try {
    console.log('Querying 4PX API for:', trackingNumber)

    const response = await fetch('https://track.4px.com/track/v2/front/listTrackV2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: JSON.stringify({
        queryCodes: [trackingNumber],
        language: 'en',
      }),
    })

    if (!response.ok) {
      console.log('4PX API failed with status:', response.status)
      return null
    }

    const data = await response.json()
    console.log('4PX API response:', JSON.stringify(data).substring(0, 500))

    if (!data.data || !data.data[0]) {
      return null
    }

    const trackInfo = data.data[0]
    const tracks = trackInfo.tracks || []

    // Map 4PX status to our status
    let status = 'transit'
    let statusDescription = 'In Transit'

    const latestTrack = tracks[0]?.tkDesc?.toLowerCase() || ''
    const deliveryState = trackInfo.deliveryState?.toLowerCase() || ''

    if (deliveryState === 'delivered' || latestTrack.includes('delivered') || latestTrack.includes('signed')) {
      status = 'delivered'
      statusDescription = 'Delivered'
    } else if (latestTrack.includes('exception') || latestTrack.includes('abnormal') || latestTrack.includes('unsuccessful') || latestTrack.includes('failed')) {
      status = 'exception'
      statusDescription = 'Delivery Exception'
      // Try to get more specific message
      if (latestTrack.includes('address')) {
        statusDescription = 'Address Issue - ' + (tracks[0]?.tkDesc || '').substring(0, 50)
      } else {
        statusDescription = (tracks[0]?.tkDesc || 'Delivery Exception').substring(0, 60)
      }
    } else if (latestTrack.includes('out for delivery')) {
      status = 'out_for_delivery'
      statusDescription = 'Out for Delivery'
    } else if (latestTrack.includes('customs') || latestTrack.includes('held')) {
      status = 'held'
      statusDescription = 'Held/Customs'
    }

    // Convert tracks to events
    const events: TrackingEvent[] = tracks.slice(0, 10).map((t: { tkTime: string; tkLocation: string; tkDesc: string }) => ({
      time: t.tkTime || '',
      location: t.tkLocation || '',
      description: t.tkDesc || '',
    }))

    return { status, statusDescription, events }
  } catch (error) {
    console.error('4PX API error:', error)
    return null
  }
}

/**
 * Query Cainiao API directly for tracking status
 */
async function queryCainiaoApi(trackingNumber: string): Promise<{ status: string; statusDescription: string; events: TrackingEvent[] } | null> {
  try {
    console.log('Querying Cainiao API for:', trackingNumber)

    const response = await fetch(`https://global.cainiao.com/global/detail.json?mailNos=${trackingNumber}&lang=en-US`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      console.log('Cainiao API failed with status:', response.status)
      return null
    }

    const data = await response.json()
    console.log('Cainiao API response:', JSON.stringify(data).substring(0, 500))

    if (!data.module || !data.module[0]) {
      return null
    }

    const trackInfo = data.module[0]
    const details = trackInfo.detailList || []

    // Map Cainiao status
    let status = 'transit'
    let statusDescription = 'In Transit'

    const statusType = trackInfo.statusType?.toLowerCase() || ''
    const latestDesc = details[0]?.desc?.toLowerCase() || ''

    if (statusType === 'sign' || latestDesc.includes('delivered') || latestDesc.includes('signed')) {
      status = 'delivered'
      statusDescription = 'Delivered'
    } else if (statusType === 'abnormal' || latestDesc.includes('abnormal') || latestDesc.includes('exception') || latestDesc.includes('unsuccessful')) {
      status = 'exception'
      statusDescription = details[0]?.desc || 'Delivery Exception'
    } else if (latestDesc.includes('out for delivery')) {
      status = 'out_for_delivery'
      statusDescription = 'Out for Delivery'
    } else if (latestDesc.includes('customs')) {
      status = 'held'
      statusDescription = 'Customs Processing'
    } else if (statusType === 'transit' || statusType === 'process') {
      status = 'transit'
      statusDescription = details[0]?.desc || 'In Transit'
    }

    // Convert to events
    const events: TrackingEvent[] = details.slice(0, 10).map((d: { time: string; standerdDesc: string; desc: string }) => ({
      time: d.time || '',
      location: '',
      description: d.standerdDesc || d.desc || '',
    }))

    return { status, statusDescription, events }
  } catch (error) {
    console.error('Cainiao API error:', error)
    return null
  }
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
      { keywords: ['delivered', 'delivery completed', 'has been delivered', 'was delivered', 'package delivered', 'successfully delivered'], status: 'delivered', description: 'Delivered' },
      { keywords: ['abnormal status', 'abnormal', 'delivery attempt unsuccessful', 'delivery attempt failure', 'address is incorrect', 'address is unknown', 'address unknown', 'wrong address', 'incorrect address', 'undeliverable'], status: 'exception', description: 'Delivery Exception' },
      { keywords: ['out for delivery', 'out-for-delivery', 'on vehicle for delivery'], status: 'out_for_delivery', description: 'Out for Delivery' },
      { keywords: ['in transit', 'in-transit', 'on the way', 'on its way', 'shipment in progress', 'en route', 'transit'], status: 'transit', description: 'In Transit' },
      { keywords: ['arrived at', 'departed from', 'processed', 'arrived at destination', 'arrival scan', 'departure scan', 'local delivery center'], status: 'transit', description: 'In Transit' },
      { keywords: ['held in', 'held at', 'holding at', 'held by customs', 'customs clearance'], status: 'held', description: 'Held/Customs' },
      { keywords: ['pickup scheduled', 'ready for pickup', 'available for pickup'], status: 'pickup', description: 'Ready for Pickup' },
      { keywords: ['shipped', 'dispatched', 'label created', 'shipping label', 'order shipped'], status: 'shipped', description: 'Shipped' },
      { keywords: ['exception', 'delivery attempt', 'delivery failed', 'unable to deliver', 'returned', 'return to sender'], status: 'exception', description: 'Exception' },
      { keywords: ['pending', 'awaiting shipment', 'not yet shipped', 'processing', 'info received'], status: 'pending', description: 'Pending' },
    ]

    for (const { keywords, status, description } of statusKeywords) {
      for (const keyword of keywords) {
        if (textLower.includes(keyword)) {
          console.log(`Found keyword "${keyword}" - status: ${status}`)

          let extraInfo = ''

          // For exceptions/abnormal status, try to extract the specific error message
          if (status === 'exception') {
            // Try to extract specific error messages
            const errorPatterns = [
              /delivery attempt unsuccessful[.\s]*([^<\n]{0,100})/i,
              /address is (?:incorrect|unknown|wrong)[.\s]*([^<\n]{0,50})/i,
              /carrier note[:\s]*([^<\n]{0,100})/i,
              /abnormal status[.\s]*([^<\n]{0,100})/i,
              /exception[:\s]*([^<\n]{0,100})/i,
            ]
            for (const pattern of errorPatterns) {
              const match = html.match(pattern)
              if (match) {
                const detail = match[0].replace(/<[^>]*>/g, '').trim().slice(0, 80)
                if (detail && detail.length > 5) {
                  extraInfo = ` - ${detail}`
                  break
                }
              }
            }
          }

          // Try to extract days to delivery
          if (!extraInfo) {
            const daysMatch = html.match(/(\d+)\s*(?:days?|business days?)\s*(?:to|until|for)?\s*(?:delivery|arrive)/i)
            if (daysMatch) {
              extraInfo = ` (Est. ${daysMatch[1]} days)`
            }
          }

          // Try to extract delivery date
          if (!extraInfo) {
            const dateMatch = html.match(/(?:estimated|expected|delivery)[\s:]+(?:by\s+)?([A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i)
            if (dateMatch) {
              extraInfo = ` (Est. ${dateMatch[1]})`
            }
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

    // Detect carrier from tracking number or URL
    const detectedCarrier = detectCarrier(trackingNumber) || carrier?.toLowerCase() || ''
    const is4PX = detectedCarrier === '4px' || trackingNumber.toUpperCase().startsWith('UUSC') || trackingUrl?.includes('4px')
    const isCainiao = detectedCarrier === 'cainiao' || trackingUrl?.includes('cainiao') || trackingUrl?.includes('global.cainiao')

    console.log('Tracking:', trackingNumber, 'Detected carrier:', detectedCarrier, '4PX:', is4PX, 'Cainiao:', isCainiao)

    // STRATEGY 1: Try carrier-specific APIs first (works for JS-rendered pages)
    if (is4PX) {
      console.log('Trying 4PX API...')
      const result = await query4PXApi(trackingNumber)
      if (result) {
        console.log('4PX API successful:', result.statusDescription)
        return new Response(
          JSON.stringify({
            success: true,
            trackingNumber,
            carrier: '4PX',
            status: result.status,
            statusDescription: result.statusDescription,
            estimatedDelivery: null,
            lastUpdate: new Date().toISOString(),
            events: result.events,
            source: '4px-api',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      console.log('4PX API failed, trying Cainiao API...')
      // 4PX packages are often tracked via Cainiao too
      const cainiaoResult = await queryCainiaoApi(trackingNumber)
      if (cainiaoResult) {
        console.log('Cainiao API successful for 4PX package:', cainiaoResult.statusDescription)
        return new Response(
          JSON.stringify({
            success: true,
            trackingNumber,
            carrier: '4PX/Cainiao',
            status: cainiaoResult.status,
            statusDescription: cainiaoResult.statusDescription,
            estimatedDelivery: null,
            lastUpdate: new Date().toISOString(),
            events: cainiaoResult.events,
            source: 'cainiao-api',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    if (isCainiao) {
      console.log('Trying Cainiao API...')
      const result = await queryCainiaoApi(trackingNumber)
      if (result) {
        console.log('Cainiao API successful:', result.statusDescription)
        return new Response(
          JSON.stringify({
            success: true,
            trackingNumber,
            carrier: 'Cainiao',
            status: result.status,
            statusDescription: result.statusDescription,
            estimatedDelivery: null,
            lastUpdate: new Date().toISOString(),
            events: result.events,
            source: 'cainiao-api',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // STRATEGY 2: Fall back to URL scraping
    if (trackingUrl) {
      console.log('Trying URL scraping:', trackingUrl)
      const scraped = await scrapeTrackingUrl(trackingUrl)
      if (scraped) {
        console.log('Scraping successful:', scraped.statusDescription)
        return new Response(
          JSON.stringify({
            success: true,
            trackingNumber,
            carrier: carrier || null,
            status: scraped.status,
            statusDescription: scraped.statusDescription,
            estimatedDelivery: null,
            lastUpdate: new Date().toISOString(),
            events: [],
            source: 'scraped',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      console.log('Scraping failed - could not extract status from tracking page')
    }

    // All strategies failed
    console.log('All tracking strategies failed')
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Could not retrieve tracking status',
        trackingNumber,
        carrier: carrier || detectedCarrier || null,
        status: 'unavailable',
        statusDescription: 'Status unavailable',
        estimatedDelivery: null,
        lastUpdate: null,
        events: [],
      }),
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
