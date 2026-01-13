/**
 * Background service worker for Freshdesk AI Assistant
 * Handles communication between popup and content scripts
 */

// Message types
interface Message {
  type: string
  payload?: unknown
}

interface ScanTicketResponse {
  success: boolean
  customerMessage?: string
  ticketSubject?: string
  error?: string
}

interface InsertReplyResponse {
  success: boolean
  error?: string
}

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  console.log('Background received message:', message.type)

  switch (message.type) {
    case 'SCAN_TICKET':
      handleScanTicket(sendResponse)
      return true // Keep channel open for async response

    case 'INSERT_REPLY':
      handleInsertReply(message.payload as string, sendResponse)
      return true

    case 'CHECK_FRESHDESK':
      handleCheckFreshdesk(sendResponse)
      return true

    default:
      sendResponse({ error: 'Unknown message type' })
  }
})

/**
 * Try to inject content script if it's not already there
 */
async function ensureContentScript(tabId: number): Promise<boolean> {
  try {
    // Try to ping the content script
    await chrome.tabs.sendMessage(tabId, { type: 'PING' })
    return true
  } catch {
    // Content script not loaded, try to inject it
    console.log('Content script not found, attempting to inject...')
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      })
      // Wait a moment for the script to initialize
      await new Promise(resolve => setTimeout(resolve, 100))
      return true
    } catch (injectError) {
      console.error('Failed to inject content script:', injectError)
      return false
    }
  }
}

async function handleScanTicket(sendResponse: (response: ScanTicketResponse) => void) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    if (!tab.id) {
      sendResponse({ success: false, error: 'No active tab found' })
      return
    }

    if (!tab.url?.includes('freshdesk.com')) {
      sendResponse({ success: false, error: 'Please open a Freshdesk ticket page first' })
      return
    }

    // Ensure content script is loaded
    const scriptReady = await ensureContentScript(tab.id)
    if (!scriptReady) {
      sendResponse({
        success: false,
        error: 'Could not connect to page. Please refresh the Freshdesk page and try again.'
      })
      return
    }

    // Try to get ticket info with retry
    let lastError: string = ''
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_TICKET_INFO' })
        sendResponse(response)
        return
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Unknown error'
        console.log(`Attempt ${attempt} failed:`, lastError)
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 200))
        }
      }
    }

    sendResponse({
      success: false,
      error: 'Could not connect to page. Please refresh the Freshdesk page (Ctrl+Shift+R) and try again.',
    })
  } catch (error) {
    console.error('Error scanning ticket:', error)
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to scan ticket',
    })
  }
}

async function handleInsertReply(reply: string, sendResponse: (response: InsertReplyResponse) => void) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    if (!tab.id) {
      sendResponse({ success: false, error: 'No active tab found' })
      return
    }

    // Ensure content script is loaded
    await ensureContentScript(tab.id)

    // Send message to content script
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'INSERT_REPLY',
      payload: reply,
    })
    sendResponse(response)
  } catch (error) {
    console.error('Error inserting reply:', error)
    sendResponse({
      success: false,
      error: 'Could not insert reply. Please refresh the page and try again.',
    })
  }
}

async function handleCheckFreshdesk(sendResponse: (response: { isOnFreshdesk: boolean; isOnTicket: boolean }) => void) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    if (!tab.url) {
      sendResponse({ isOnFreshdesk: false, isOnTicket: false })
      return
    }

    const isOnFreshdesk = tab.url.includes('freshdesk.com')
    const isOnTicket = /\/tickets?\/\d+/i.test(tab.url)

    sendResponse({ isOnFreshdesk, isOnTicket })
  } catch (error) {
    console.error('Error checking Freshdesk:', error)
    sendResponse({ isOnFreshdesk: false, isOnTicket: false })
  }
}

// Extension installation handler
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Freshdesk AI Assistant installed')
  } else if (details.reason === 'update') {
    console.log('Freshdesk AI Assistant updated')
  }
})
