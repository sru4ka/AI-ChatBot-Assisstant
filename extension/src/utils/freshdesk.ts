/**
 * Freshdesk DOM utilities
 * These selectors may need to be updated if Freshdesk changes their UI
 */

// Selectors for Freshdesk ticket page elements
const SELECTORS = {
  // Ticket conversation area - multiple possible selectors
  ticketConversation: [
    '.ticket-conversation',
    '.conversation-container',
    '[data-testid="ticket-conversation"]',
    '.ticket-details',
    '.ticket-content',
    '.ticket-body',
    '[class*="conversation"]',
    '[class*="ticket-detail"]',
    '.content-wrapper',
    'article',
    '.ticket__content',
  ],

  // Customer messages (incoming)
  customerMessage: [
    '.incoming-msg',
    '.customer-reply',
    '[data-testid="incoming-message"]',
    '.message--customer',
    '.msg-incoming',
    '[class*="incoming"]',
    '[class*="customer"]',
    '.reported-message',
    '[class*="requester"]',
  ],

  // Reply text area
  replyTextArea: [
    '.reply-box textarea',
    '.fr-element',
    '[data-testid="reply-textarea"]',
    '.redactor-editor',
    'textarea[name*="reply"]',
    '.note-editable',
    '[contenteditable="true"]',
  ],

  // Rich text editor (Froala or Redactor)
  richTextEditor: [
    '.fr-element.fr-view',
    '.redactor-editor',
    '[contenteditable="true"]',
    '.fr-wrapper [contenteditable]',
    '.note-editable',
  ],

  // Subject/ticket info
  ticketSubject: [
    '.ticket-subject',
    '[data-testid="ticket-subject"]',
    'h1.subject',
    '.subject-text',
    '.ticket-header h1',
    '[class*="subject"]',
    '.ticket__subject',
  ],

  // Message content containers
  messageContent: [
    '.message-text',
    '.content-text',
    '.msg-content',
    '[data-testid="message-content"]',
    '.message-body',
    '.ticket-description',
    '.description-text',
    'blockquote',
    '.message__body',
    '[class*="message-content"]',
    '[class*="description"]',
  ],
}

/**
 * Try multiple selectors and return the first matching element
 */
function queryWithFallback(selectors: string[], parent: Element | Document = document): Element | null {
  for (const selector of selectors) {
    try {
      const element = parent.querySelector(selector)
      if (element) {
        return element
      }
    } catch (e) {
      // Invalid selector, continue
    }
  }
  return null
}

/**
 * Try multiple selectors and return all matching elements
 */
function queryAllWithFallback(selectors: string[], parent: Element | Document = document): Element[] {
  const results: Element[] = []
  const seen = new Set<Element>()

  for (const selector of selectors) {
    try {
      const elements = parent.querySelectorAll(selector)
      elements.forEach(el => {
        if (!seen.has(el)) {
          seen.add(el)
          results.push(el)
        }
      })
    } catch (e) {
      // Invalid selector, continue
    }
  }
  return results
}

/**
 * Check if we're on a Freshdesk ticket page
 */
export function isOnTicketPage(): boolean {
  const url = window.location.href
  // Freshdesk ticket URLs typically contain /tickets/ or /a/tickets/
  return /\/tickets?\/\d+/i.test(url) || /\/a\/tickets\/\d+/i.test(url)
}

/**
 * Get the latest customer message from the ticket
 */
export function getLatestCustomerMessage(): string | null {
  console.log('Freshdesk AI: Scanning for customer message...')

  // First, try to find the conversation area
  let conversationArea = queryWithFallback(SELECTORS.ticketConversation)

  if (!conversationArea) {
    console.log('Freshdesk AI: No conversation area found, using document body')
    conversationArea = document.body
  }

  // Strategy 1: Look for specific customer message elements
  const customerMessages = queryAllWithFallback(SELECTORS.customerMessage, conversationArea)
  console.log(`Freshdesk AI: Found ${customerMessages.length} potential customer messages`)

  if (customerMessages.length > 0) {
    // Try to get content from the most recent customer message
    const latestMessage = customerMessages[customerMessages.length - 1]
    const content = queryWithFallback(SELECTORS.messageContent, latestMessage)
    if (content && content.textContent) {
      const text = cleanMessageText(content.textContent)
      if (text.length > 20) {
        console.log('Freshdesk AI: Found message via customer message selector')
        return text
      }
    }
    // Fallback to the full element text
    const msgText = cleanMessageText(latestMessage.textContent || '')
    if (msgText.length > 20) {
      console.log('Freshdesk AI: Found message via customer message element text')
      return msgText
    }
  }

  // Strategy 2: Look for message content elements directly
  const messageContents = queryAllWithFallback(SELECTORS.messageContent, conversationArea)
  console.log(`Freshdesk AI: Found ${messageContents.length} message content elements`)

  if (messageContents.length > 0) {
    // Get the first substantial message (likely the customer's initial message)
    for (const msgEl of messageContents) {
      const text = cleanMessageText(msgEl.textContent || '')
      if (text.length > 30) {
        console.log('Freshdesk AI: Found message via content selector')
        return text
      }
    }
  }

  // Strategy 3: Look for common text patterns in the page
  const patterns = [
    /Comment:\s*([\s\S]+?)(?=\n\n|Tags:|$)/i,
    /Description:\s*([\s\S]+?)(?=\n\n|$)/i,
    /Message:\s*([\s\S]+?)(?=\n\n|$)/i,
  ]

  const pageText = conversationArea.textContent || ''
  for (const pattern of patterns) {
    const match = pageText.match(pattern)
    if (match && match[1] && match[1].trim().length > 20) {
      console.log('Freshdesk AI: Found message via text pattern matching')
      return cleanMessageText(match[1])
    }
  }

  // Strategy 4: Look for blockquote or email-like content
  const blockquotes = conversationArea.querySelectorAll('blockquote, .email-content, .ticket-description')
  if (blockquotes.length > 0) {
    const text = cleanMessageText(blockquotes[0].textContent || '')
    if (text.length > 20) {
      console.log('Freshdesk AI: Found message via blockquote')
      return text
    }
  }

  // Strategy 5: Get substantial text from the main content area
  // Find divs with substantial text content
  const allDivs = conversationArea.querySelectorAll('div, p, td')
  const substantialTexts: string[] = []

  allDivs.forEach(div => {
    const text = cleanMessageText(div.textContent || '')
    // Look for text that seems like a customer message (not UI text)
    if (text.length > 50 &&
        !text.includes('Reply') &&
        !text.includes('Forward') &&
        !text.includes('Delete') &&
        !text.includes('Close') &&
        !text.includes('Add note') &&
        !text.includes('RESOLUTION DUE')) {
      substantialTexts.push(text)
    }
  })

  // Sort by length and get the most substantial one
  if (substantialTexts.length > 0) {
    substantialTexts.sort((a, b) => b.length - a.length)
    console.log('Freshdesk AI: Found message via substantial text search')
    return substantialTexts[0].slice(0, 2000)
  }

  // Last resort: just get all text from conversation area
  const allText = cleanMessageText(pageText)
  if (allText.length > 50) {
    console.log('Freshdesk AI: Using fallback full text')
    return allText.slice(0, 1500)
  }

  console.log('Freshdesk AI: No customer message found')
  return null
}

/**
 * Get the ticket subject
 */
export function getTicketSubject(): string | null {
  const subjectEl = queryWithFallback(SELECTORS.ticketSubject)
  if (subjectEl && subjectEl.textContent) {
    return cleanMessageText(subjectEl.textContent)
  }

  // Fallback: look for h1 or h2 with ticket-like content
  const headings = document.querySelectorAll('h1, h2')
  for (const h of headings) {
    const text = h.textContent?.trim()
    if (text && text.length > 5 && text.length < 200) {
      // Skip navigation/UI headings
      if (!text.includes('All') && !text.includes('ticket')) {
        return text
      }
    }
  }

  return null
}

/**
 * Insert text into the Freshdesk reply box
 */
export function insertReply(text: string): boolean {
  console.log('Freshdesk AI: Attempting to insert reply...')

  // Try rich text editor first (Froala/Redactor)
  const richEditor = queryWithFallback(SELECTORS.richTextEditor) as HTMLElement
  if (richEditor && richEditor.getAttribute('contenteditable') === 'true') {
    console.log('Freshdesk AI: Found rich text editor')
    richEditor.focus()

    // Clear existing content and insert new
    richEditor.innerHTML = text.replace(/\n/g, '<br>')

    // Trigger input event
    richEditor.dispatchEvent(new Event('input', { bubbles: true }))
    richEditor.dispatchEvent(new Event('change', { bubbles: true }))

    return true
  }

  // Try regular textarea
  const textarea = queryWithFallback(SELECTORS.replyTextArea) as HTMLTextAreaElement
  if (textarea) {
    console.log('Freshdesk AI: Found textarea')
    textarea.focus()
    textarea.value = text

    // Trigger events to notify Freshdesk of the change
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.dispatchEvent(new Event('change', { bubbles: true }))

    return true
  }

  // Try clicking the Reply button first to open the reply area
  const replyButton = document.querySelector('button[title*="Reply"], [class*="reply-btn"], a[title*="Reply"]')
  if (replyButton) {
    console.log('Freshdesk AI: Clicking reply button to open editor...')
    ;(replyButton as HTMLElement).click()

    // Wait a bit and try again
    setTimeout(() => {
      const editor = queryWithFallback(SELECTORS.richTextEditor) as HTMLElement
      if (editor) {
        editor.innerHTML = text.replace(/\n/g, '<br>')
        editor.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }, 500)

    return true
  }

  console.log('Freshdesk AI: Could not find reply text area')
  return false
}

/**
 * Clean up message text
 */
function cleanMessageText(text: string): string {
  return text
    .replace(/\s+/g, ' ')  // Normalize whitespace
    .replace(/^\s+|\s+$/g, '')  // Trim
    .replace(/\n\s*\n/g, '\n')  // Remove multiple newlines
}

/**
 * Create and show a floating UI element for the extension
 */
export function createFloatingButton(): HTMLElement {
  const existingButton = document.getElementById('freshdesk-ai-assistant-btn')
  if (existingButton) {
    return existingButton
  }

  const button = document.createElement('button')
  button.id = 'freshdesk-ai-assistant-btn'
  button.innerHTML = '🤖 AI Assist'
  button.className = 'freshdesk-ai-floating-btn'

  document.body.appendChild(button)
  return button
}

/**
 * Remove the floating button
 */
export function removeFloatingButton(): void {
  const button = document.getElementById('freshdesk-ai-assistant-btn')
  if (button) {
    button.remove()
  }
}
