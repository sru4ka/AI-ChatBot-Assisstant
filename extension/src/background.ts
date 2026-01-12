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

async function handleScanTicket(sendResponse: (response: ScanTicketResponse) => void) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    if (!tab.id) {
      sendResponse({ success: false, error: 'No active tab found' })
      return
    }

    // Send message to content script
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_TICKET_INFO' })
    sendResponse(response)
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
      error: error instanceof Error ? error.message : 'Failed to insert reply',
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
