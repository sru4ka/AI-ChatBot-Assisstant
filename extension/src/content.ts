/**
 * Content script for Freshdesk AI Assistant
 * Injected into Freshdesk pages to read ticket content and insert replies
 */

import {
  isOnTicketPage,
  getLatestCustomerMessage,
  getTicketSubject,
  insertReply,
  createFloatingButton,
  removeFloatingButton,
} from './utils/freshdesk'

// Message types
interface Message {
  type: string
  payload?: unknown
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  console.log('Content script received message:', message.type)

  switch (message.type) {
    case 'GET_TICKET_INFO':
      handleGetTicketInfo(sendResponse)
      return true

    case 'INSERT_REPLY':
      handleInsertReply(message.payload as string, sendResponse)
      return true

    default:
      sendResponse({ error: 'Unknown message type' })
  }
})

function handleGetTicketInfo(sendResponse: (response: unknown) => void) {
  if (!isOnTicketPage()) {
    sendResponse({
      success: false,
      error: 'Not on a Freshdesk ticket page',
    })
    return
  }

  const customerMessage = getLatestCustomerMessage()
  const ticketSubject = getTicketSubject()

  if (!customerMessage) {
    sendResponse({
      success: false,
      error: 'Could not find customer message on this page',
    })
    return
  }

  sendResponse({
    success: true,
    customerMessage,
    ticketSubject,
  })
}

function handleInsertReply(reply: string, sendResponse: (response: unknown) => void) {
  if (!reply) {
    sendResponse({
      success: false,
      error: 'No reply text provided',
    })
    return
  }

  const success = insertReply(reply)

  sendResponse({
    success,
    error: success ? undefined : 'Could not find reply text area',
  })
}

// Initialize content script
function init() {
  console.log('Freshdesk AI Assistant content script loaded')

  // Check if we're on a ticket page
  if (isOnTicketPage()) {
    // Optionally create a floating button
    // createFloatingButton()
    console.log('On Freshdesk ticket page')
  }

  // Watch for URL changes (Freshdesk is a SPA)
  let lastUrl = window.location.href
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href
      console.log('URL changed:', lastUrl)

      if (isOnTicketPage()) {
        console.log('Navigated to ticket page')
      } else {
        removeFloatingButton()
      }
    }
  })

  observer.observe(document.body, { childList: true, subtree: true })
}

// Run initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
