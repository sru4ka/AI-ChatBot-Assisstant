/**
 * Freshdesk DOM utilities
 * These selectors may need to be updated if Freshdesk changes their UI
 */

// Selectors for Freshdesk ticket page elements
const SELECTORS = {
  // Ticket conversation area
  ticketConversation: '.ticket-conversation, .conversation-container, [data-testid="ticket-conversation"]',

  // Customer messages (incoming)
  customerMessage: '.incoming-msg, .customer-reply, [data-testid="incoming-message"]',

  // Reply text area
  replyTextArea: '.reply-box textarea, .fr-element, [data-testid="reply-textarea"], .redactor-editor',

  // Rich text editor (Froala or Redactor)
  richTextEditor: '.fr-element.fr-view, .redactor-editor, [contenteditable="true"]',

  // Subject/ticket info
  ticketSubject: '.ticket-subject, [data-testid="ticket-subject"], h1.subject',

  // Message content
  messageContent: '.message-text, .content-text, .msg-content, [data-testid="message-content"]',
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
  // Try multiple selectors to find customer messages
  const conversationArea = document.querySelector(SELECTORS.ticketConversation)

  if (!conversationArea) {
    console.log('Freshdesk AI: Could not find conversation area')
    return null
  }

  // Look for incoming/customer messages
  const customerMessages = conversationArea.querySelectorAll(SELECTORS.customerMessage)

  if (customerMessages.length > 0) {
    // Get the most recent customer message
    const latestMessage = customerMessages[customerMessages.length - 1]
    const content = latestMessage.querySelector(SELECTORS.messageContent)
    if (content) {
      return cleanMessageText(content.textContent || '')
    }
    return cleanMessageText(latestMessage.textContent || '')
  }

  // Fallback: try to get any message content
  const allMessages = conversationArea.querySelectorAll(SELECTORS.messageContent)
  if (allMessages.length > 0) {
    const latestMessage = allMessages[allMessages.length - 1]
    return cleanMessageText(latestMessage.textContent || '')
  }

  // Last resort: get all text from conversation area
  const allText = conversationArea.textContent
  if (allText) {
    return cleanMessageText(allText).slice(0, 1000) // Limit to first 1000 chars
  }

  return null
}

/**
 * Get the ticket subject
 */
export function getTicketSubject(): string | null {
  const subjectEl = document.querySelector(SELECTORS.ticketSubject)
  if (subjectEl) {
    return cleanMessageText(subjectEl.textContent || '')
  }
  return null
}

/**
 * Insert text into the Freshdesk reply box
 */
export function insertReply(text: string): boolean {
  // Try rich text editor first (Froala/Redactor)
  const richEditor = document.querySelector(SELECTORS.richTextEditor) as HTMLElement
  if (richEditor && richEditor.getAttribute('contenteditable') === 'true') {
    // For contenteditable elements
    richEditor.focus()

    // Clear existing content and insert new
    richEditor.innerHTML = text.replace(/\n/g, '<br>')

    // Trigger input event
    richEditor.dispatchEvent(new Event('input', { bubbles: true }))
    richEditor.dispatchEvent(new Event('change', { bubbles: true }))

    return true
  }

  // Try regular textarea
  const textarea = document.querySelector(SELECTORS.replyTextArea) as HTMLTextAreaElement
  if (textarea) {
    textarea.focus()
    textarea.value = text

    // Trigger events to notify Freshdesk of the change
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.dispatchEvent(new Event('change', { bubbles: true }))

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
