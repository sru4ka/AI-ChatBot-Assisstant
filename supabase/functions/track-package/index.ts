const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
}

interface RequestBody {
  businessId: string
  trackingNumber: string
  carrier?: string
  trackingUrl?: string
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

    let status = 'transit'
    let statusDescription = 'In Transit'

    const latestTrack = tracks[0]?.tkDesc?.toLowerCase() || ''
    const deliveryState = trackInfo.deliveryState?.toLowerCase() || ''

    if (deliveryState === 'delivered' || latestTrack.includes('delivered') || latestTrack.includes('signed')) {
      status = 'delivered'
      statusDescription = 'Delivered'
    } else if (latestTrack.includes('exception') || latestTrack.includes('abnormal') || latestTrack.includes('unsuccessful') || latestTrack.includes('failed')) {
      status = 'exception'
      statusDescription = latestTrack.includes('address')
        ? 'Address Issue - ' + (tracks[0]?.tkDesc || '').substring(0, 50)
        : (tracks[0]?.tkDesc || 'Delivery Exception').substring(0, 60)
    } else if (latestTrack.includes('out for delivery')) {
      status = 'out_for_delivery'
      statusDescription = 'Out for Delivery'
    } else if (latestTrack.includes('customs') || latestTrack.includes('held')) {
      status = 'held'
      statusDescription = 'Held/Customs'
    }

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
 * Query YunExpress API directly for tracking status
 */
async function queryYunExpressApi(trackingNumber: string): Promise<{ status: string; statusDescription: string; events: TrackingEvent[] } | null> {
  try {
    console.log('Querying YunExpress API for:', trackingNumber)

    const response = await fetch('https://www.yuntrack.com/Track/Query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: JSON.stringify({
        NumberList: [trackingNumber],
        CaptchaVerification: '',
      }),
    })

    if (!response.ok) {
      console.log('YunExpress API failed with status:', response.status)
      return null
    }

    const data = await response.json()
    console.log('YunExpress API response:', JSON.stringify(data).substring(0, 500))

    if (!data.ResultList || !data.ResultList[0]) {
      return null
    }

    const trackInfo = data.ResultList[0]
    const tracks = trackInfo.TrackList || []

    let status = 'transit'
    let statusDescription = 'In Transit'

    const packageStatus = trackInfo.PackageStatus?.toLowerCase() || ''
    const latestDesc = tracks[0]?.ProcessContent?.toLowerCase() || ''

    if (packageStatus === 'delivered' || latestDesc.includes('delivered') || latestDesc.includes('signed')) {
      status = 'delivered'
      statusDescription = 'Delivered'
    } else if (latestDesc.includes('exception') || latestDesc.includes('abnormal') || latestDesc.includes('failed')) {
      status = 'exception'
      statusDescription = tracks[0]?.ProcessContent || 'Delivery Exception'
    } else if (latestDesc.includes('out for delivery')) {
      status = 'out_for_delivery'
      statusDescription = 'Out for Delivery'
    } else if (latestDesc.includes('customs')) {
      status = 'held'
      statusDescription = 'Customs Processing'
    }

    const events: TrackingEvent[] = tracks.slice(0, 10).map((t: { ProcessDate: string; ProcessLocation: string; ProcessContent: string }) => ({
      time: t.ProcessDate || '',
      location: t.ProcessLocation || '',
      description: t.ProcessContent || '',
    }))

    return { status, statusDescription, events }
  } catch (error) {
    console.error('YunExpress API error:', error)
    return null
  }
}

/**
 * Query Yanwen API directly for tracking status
 */
async function queryYanwenApi(trackingNumber: string): Promise<{ status: string; statusDescription: string; events: TrackingEvent[] } | null> {
  try {
    console.log('Querying Yanwen API for:', trackingNumber)

    const response = await fetch(`https://track.yw56.com.cn/api/tracking?nums=${trackingNumber}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      console.log('Yanwen API failed with status:', response.status)
      return null
    }

    const data = await response.json()
    console.log('Yanwen API response:', JSON.stringify(data).substring(0, 500))

    if (!data.data || !data.data[0]) {
      return null
    }

    const trackInfo = data.data[0]
    const tracks = trackInfo.tracks || trackInfo.checkpoints || []

    let status = 'transit'
    let statusDescription = 'In Transit'

    const latestDesc = tracks[0]?.message?.toLowerCase() || tracks[0]?.remark?.toLowerCase() || ''

    if (latestDesc.includes('delivered') || latestDesc.includes('signed')) {
      status = 'delivered'
      statusDescription = 'Delivered'
    } else if (latestDesc.includes('exception') || latestDesc.includes('abnormal') || latestDesc.includes('failed')) {
      status = 'exception'
      statusDescription = tracks[0]?.message || tracks[0]?.remark || 'Delivery Exception'
    } else if (latestDesc.includes('out for delivery')) {
      status = 'out_for_delivery'
      statusDescription = 'Out for Delivery'
    } else if (latestDesc.includes('customs')) {
      status = 'held'
      statusDescription = 'Customs Processing'
    }

    const events: TrackingEvent[] = tracks.slice(0, 10).map((t: { time: string; date: string; location: string; message: string; remark: string }) => ({
      time: t.time || t.date || '',
      location: t.location || '',
      description: t.message || t.remark || '',
    }))

    return { status, statusDescription, events }
  } catch (error) {
    console.error('Yanwen API error:', error)
    return null
  }
}

/**
 * Query 17Track API for any carrier (universal tracker)
 */
async function query17TrackApi(trackingNumber: string): Promise<{ status: string; statusDescription: string; events: TrackingEvent[] } | null> {
  try {
    console.log('Querying 17Track API for:', trackingNumber)

    // 17Track has a public API endpoint for basic tracking
    const response = await fetch('https://api.17track.net/track/v2/gettrackinfo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: JSON.stringify({
        data: [{ num: trackingNumber }],
      }),
    })

    if (!response.ok) {
      console.log('17Track API failed with status:', response.status)
      return null
    }

    const data = await response.json()
    console.log('17Track API response:', JSON.stringify(data).substring(0, 500))

    if (!data.data || !data.data.accepted || !data.data.accepted[0]) {
      return null
    }

    const trackInfo = data.data.accepted[0]
    const tracks = trackInfo.track?.z || []

    let status = 'transit'
    let statusDescription = 'In Transit'

    // 17Track status codes: 0=Not found, 10=In transit, 20=Expired, 30=Pick up, 35=Undelivered, 40=Delivered, 50=Alert
    const trackStatus = trackInfo.track?.e
    if (trackStatus === 40) {
      status = 'delivered'
      statusDescription = 'Delivered'
    } else if (trackStatus === 50 || trackStatus === 35) {
      status = 'exception'
      statusDescription = tracks[0]?.z || 'Delivery Exception'
    } else if (trackStatus === 30) {
      status = 'pickup'
      statusDescription = 'Ready for Pickup'
    }

    const events: TrackingEvent[] = tracks.slice(0, 10).map((t: { a: string; c: string; z: string }) => ({
      time: t.a || '',
      location: t.c || '',
      description: t.z || '',
    }))

    return { status, statusDescription, events }
  } catch (error) {
    console.error('17Track API error:', error)
    return null
  }
}

/**
 * Scrape a tracking URL for status keywords
 */
async function scrapeTrackingUrl(url: string): Promise<{ status: string; statusDescription: string } | null> {
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

    const statusKeywords: Array<{ keywords: string[]; status: string; description: string }> = [
      { keywords: ['delivered', 'delivery completed', 'has been delivered', 'was delivered', 'package delivered', 'successfully delivered'], status: 'delivered', description: 'Delivered' },
      { keywords: ['abnormal status', 'abnormal', 'delivery attempt unsuccessful', 'delivery attempt failure', 'address is incorrect', 'address is unknown', 'address unknown', 'wrong address', 'incorrect address', 'undeliverable'], status: 'exception', description: 'Delivery Exception' },
      { keywords: ['out for delivery', 'out-for-delivery', 'on vehicle for delivery'], status: 'out_for_delivery', description: 'Out for Delivery' },
      { keywords: ['in transit', 'in-transit', 'on the way', 'on its way', 'shipment in progress', 'en route'], status: 'transit', description: 'In Transit' },
      { keywords: ['arrived at', 'departed from', 'processed', 'arrival scan', 'departure scan'], status: 'transit', description: 'In Transit' },
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
          if (status === 'exception') {
            const errorPatterns = [
              /delivery attempt unsuccessful[.\s]*([^<\n]{0,100})/i,
              /address is (?:incorrect|unknown|wrong)[.\s]*([^<\n]{0,50})/i,
              /abnormal status[.\s]*([^<\n]{0,100})/i,
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

          return { status, statusDescription: description + extraInfo }
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
 * Detect carrier from tracking number format
 */
function detectCarrier(trackingNumber: string): string | null {
  const num = trackingNumber.toUpperCase().replace(/\s/g, '')

  // 4PX patterns
  if (/^4PX/.test(num) || /^UUSC/.test(num)) return '4px'

  // YunExpress patterns
  if (/^YT\d{16}$/.test(num) || /^YUN/.test(num)) return 'yunexpress'

  // Yanwen patterns
  if (/^S\d{12}$/.test(num) || /^UY/.test(num)) return 'yanwen'

  // Cainiao patterns
  if (/^LP\d+$/.test(num) || /^CAINIAO/.test(num) || /^CN/.test(num)) return 'cainiao'

  // China Post / China EMS patterns
  if (/^[A-Z]{2}\d{9}CN$/.test(num)) return 'china-ems'

  // USPS patterns
  if (/^(94|93|92|91)\d{20,}$/.test(num) || /^[A-Z]{2}\d{9}US$/.test(num)) return 'usps'

  // UPS patterns
  if (/^1Z[A-Z0-9]{16}$/.test(num)) return 'ups'

  // FedEx patterns
  if (/^\d{12}$/.test(num) || /^\d{15}$/.test(num)) return 'fedex'

  // DHL patterns
  if (/^\d{10}$/.test(num) || /^[A-Z]{3}\d{7}$/.test(num)) return 'dhl'

  return null
}

/**
 * Try all carrier APIs in sequence
 */
async function tryCarrierApis(trackingNumber: string, detectedCarrier: string, trackingUrl?: string): Promise<{ status: string; statusDescription: string; events: TrackingEvent[]; carrier: string; source: string } | null> {

  // Try specific carrier APIs first based on detection
  if (detectedCarrier === '4px' || trackingNumber.toUpperCase().startsWith('UUSC')) {
    console.log('Trying 4PX API...')
    const result = await query4PXApi(trackingNumber)
    if (result) return { ...result, carrier: '4PX', source: '4px-api' }
  }

  if (detectedCarrier === 'yunexpress' || trackingNumber.toUpperCase().startsWith('YT')) {
    console.log('Trying YunExpress API...')
    const result = await queryYunExpressApi(trackingNumber)
    if (result) return { ...result, carrier: 'YunExpress', source: 'yunexpress-api' }
  }

  if (detectedCarrier === 'yanwen') {
    console.log('Trying Yanwen API...')
    const result = await queryYanwenApi(trackingNumber)
    if (result) return { ...result, carrier: 'Yanwen', source: 'yanwen-api' }
  }

  // Try Cainiao for any Chinese tracking (often works as aggregator)
  if (detectedCarrier === 'cainiao' || trackingUrl?.includes('cainiao') || detectedCarrier === '4px') {
    console.log('Trying Cainiao API...')
    const result = await queryCainiaoApi(trackingNumber)
    if (result) return { ...result, carrier: 'Cainiao', source: 'cainiao-api' }
  }

  // Try 17Track as universal fallback for Chinese carriers
  if (['4px', 'yunexpress', 'yanwen', 'cainiao', 'china-ems'].includes(detectedCarrier)) {
    console.log('Trying 17Track API...')
    const result = await query17TrackApi(trackingNumber)
    if (result) return { ...result, carrier: '17Track', source: '17track-api' }
  }

  return null
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

    const detectedCarrier = detectCarrier(trackingNumber) || carrier?.toLowerCase() || ''
    console.log('Tracking:', trackingNumber, 'Detected carrier:', detectedCarrier)

    // STRATEGY 1: Try carrier-specific APIs
    const apiResult = await tryCarrierApis(trackingNumber, detectedCarrier, trackingUrl)
    if (apiResult) {
      console.log('API successful:', apiResult.source, apiResult.statusDescription)
      return new Response(
        JSON.stringify({
          success: true,
          trackingNumber,
          carrier: apiResult.carrier,
          status: apiResult.status,
          statusDescription: apiResult.statusDescription,
          estimatedDelivery: null,
          lastUpdate: new Date().toISOString(),
          events: apiResult.events,
          source: apiResult.source,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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
            carrier: carrier || detectedCarrier || null,
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
