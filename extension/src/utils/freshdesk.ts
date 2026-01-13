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
    '#ticket-details',
    '.ticket-detail-page',
    '[class*="thread"]',
  ],

  // Customer messages (incoming) - updated for newer Freshdesk UI
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
    '.thread-message.incoming',
    '.message-thread .incoming',
    '[class*="inbound"]',
    '.ticket-message',
    '.conv-content',
  ],

  // Reply text area - updated for Freshdesk's current editors
  replyTextArea: [
    '.reply-box textarea',
    '.fr-element',
    '[data-testid="reply-textarea"]',
    '.redactor-editor',
    'textarea[name*="reply"]',
    '.note-editable',
    '[contenteditable="true"]',
    '.ql-editor',
    '.tox-edit-area__iframe',
    '.reply-editor textarea',
    '#reply-editor',
    '.cke_editable',
    '.ProseMirror',
  ],

  // Rich text editor (Froala, Redactor, TinyMCE, etc.)
  richTextEditor: [
    '.fr-element.fr-view',
    '.redactor-editor',
    '.fr-wrapper [contenteditable="true"]',
    '.note-editable',
    '.ql-editor',
    '.ProseMirror',
    '.cke_editable',
    '[contenteditable="true"][class*="editor"]',
    '[contenteditable="true"][class*="reply"]',
    '[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
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
    '#ticket-subject',
    '.ticket-title',
  ],

  // Message content containers - updated for email body
  messageContent: [
    '.message-text',
    '.content-text',
    '.msg-content',
    '[data-testid="message-content"]',
    '.message-body',
    '.ticket-description',
    '.description-text',
    '.message__body',
    '[class*="message-content"]',
    '[class*="description"]',
    '.thread-body',
    '.conv-text',
    '.email-body',
    '.ticket-body-content',
    '.fr-view',
    '.email-content',
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

  // Metadata patterns to filter out (these are NOT the actual message)
  const metadataPatterns = [
    /^New customer message on/i,
    /^\d{1,2}\/\d{1,2}\/\d{4}/,
    /^Status:/i,
    /^Priority:/i,
    /^Type:/i,
    /^Group:/i,
    /^Agent:/i,
    /^Tags:/i,
  ]

  function isMetadata(text: string): boolean {
    const trimmed = text.trim()
    return metadataPatterns.some(p => p.test(trimmed)) ||
      trimmed.length < 20 ||
      /^\d+\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(trimmed) ||
      /^#\d+\s+\d+/.test(trimmed)
  }

  // First, try to find the conversation area
  let conversationArea = queryWithFallback(SELECTORS.ticketConversation)

  if (!conversationArea) {
    console.log('Freshdesk AI: No conversation area found, using document body')
    conversationArea = document.body
  }

  // Strategy 1: Look for Freshdesk's fr-view class (Froala editor view - common for message display)
  const frViews = conversationArea.querySelectorAll('.fr-view')
  for (const frView of frViews) {
    const text = cleanMessageText(frView.textContent || '')
    if (text.length > 30 && !isMetadata(text)) {
      console.log('Freshdesk AI: Found message via fr-view')
      return text
    }
  }

  // Strategy 2: Look for specific customer message elements
  const customerMessages = queryAllWithFallback(SELECTORS.customerMessage, conversationArea)
  console.log(`Freshdesk AI: Found ${customerMessages.length} potential customer messages`)

  if (customerMessages.length > 0) {
    // Try to get content from the most recent customer message
    const latestMessage = customerMessages[customerMessages.length - 1]
    const content = queryWithFallback(SELECTORS.messageContent, latestMessage)
    if (content && content.textContent) {
      const text = cleanMessageText(content.textContent)
      if (text.length > 20 && !isMetadata(text)) {
        console.log('Freshdesk AI: Found message via customer message selector')
        return text
      }
    }
    // Fallback to the full element text
    const msgText = cleanMessageText(latestMessage.textContent || '')
    if (msgText.length > 20 && !isMetadata(msgText)) {
      console.log('Freshdesk AI: Found message via customer message element text')
      return msgText
    }
  }

  // Strategy 3: Look for message content elements directly
  const messageContents = queryAllWithFallback(SELECTORS.messageContent, conversationArea)
  console.log(`Freshdesk AI: Found ${messageContents.length} message content elements`)

  if (messageContents.length > 0) {
    // Get the first substantial message (likely the customer's initial message)
    for (const msgEl of messageContents) {
      const text = cleanMessageText(msgEl.textContent || '')
      if (text.length > 30 && !isMetadata(text)) {
        console.log('Freshdesk AI: Found message via content selector')
        return text
      }
    }
  }

  // Strategy 4: Look for blockquote or email-like content
  const emailSelectors = 'blockquote, .email-content, .ticket-description, .email-body, [class*="body"], [class*="content"]'
  const emailElements = conversationArea.querySelectorAll(emailSelectors)
  for (const el of emailElements) {
    const text = cleanMessageText(el.textContent || '')
    if (text.length > 50 && !isMetadata(text)) {
      console.log('Freshdesk AI: Found message via email/blockquote selector')
      return text
    }
  }

  // Strategy 5: Look for common text patterns in the page
  const patterns = [
    /Comment:\s*([\s\S]+?)(?=\n\n|Tags:|$)/i,
    /Description:\s*([\s\S]+?)(?=\n\n|$)/i,
    /Message:\s*([\s\S]+?)(?=\n\n|$)/i,
  ]

  const pageText = conversationArea.textContent || ''
  for (const pattern of patterns) {
    const match = pageText.match(pattern)
    if (match && match[1] && match[1].trim().length > 20 && !isMetadata(match[1])) {
      console.log('Freshdesk AI: Found message via text pattern matching')
      return cleanMessageText(match[1])
    }
  }

  // Strategy 6: Get substantial text from the main content area
  // Find divs with substantial text content
  const allDivs = conversationArea.querySelectorAll('div, p, td, span')
  const substantialTexts: string[] = []

  // UI text patterns to exclude
  const uiPatterns = ['Reply', 'Forward', 'Delete', 'Close', 'Add note', 'RESOLUTION DUE',
    'Pending', 'Open', 'Resolved', 'Closed', 'Priority', 'Status', 'Type', 'Group', 'Agent']

  allDivs.forEach(div => {
    const text = cleanMessageText(div.textContent || '')
    // Look for text that seems like a customer message (not UI text)
    if (text.length > 50 &&
        !isMetadata(text) &&
        !uiPatterns.some(p => text.startsWith(p))) {
      substantialTexts.push(text)
    }
  })

  // Sort by length and get the most substantial one that looks like actual content
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

  // Helper to insert into an editor
  function insertIntoEditor(editor: HTMLElement): boolean {
    editor.focus()
    // Clear existing content and insert new
    editor.innerHTML = text.replace(/\n/g, '<br>')
    // Trigger all possible events to notify Freshdesk of the change
    editor.dispatchEvent(new Event('input', { bubbles: true }))
    editor.dispatchEvent(new Event('change', { bubbles: true }))
    editor.dispatchEvent(new Event('keyup', { bubbles: true }))
    editor.dispatchEvent(new Event('blur', { bubbles: true }))
    return true
  }

  // Strategy 1: Look for Froala editor (very common in Freshdesk)
  const froalaEditor = document.querySelector('.fr-element.fr-view') as HTMLElement
  if (froalaEditor && froalaEditor.getAttribute('contenteditable') === 'true') {
    console.log('Freshdesk AI: Found Froala editor')
    return insertIntoEditor(froalaEditor)
  }

  // Strategy 2: Look for any contenteditable in the reply area
  const replyAreas = document.querySelectorAll('.reply-box, .reply-editor, [class*="reply"], [class*="editor-wrapper"]')
  for (const area of replyAreas) {
    const editor = area.querySelector('[contenteditable="true"]') as HTMLElement
    if (editor) {
      console.log('Freshdesk AI: Found contenteditable in reply area')
      return insertIntoEditor(editor)
    }
  }

  // Strategy 3: Try rich text editor from selectors
  const richEditor = queryWithFallback(SELECTORS.richTextEditor) as HTMLElement
  if (richEditor && richEditor.getAttribute('contenteditable') === 'true') {
    console.log('Freshdesk AI: Found rich text editor via selector')
    return insertIntoEditor(richEditor)
  }

  // Strategy 4: Try regular textarea
  const textarea = queryWithFallback(SELECTORS.replyTextArea) as HTMLTextAreaElement
  if (textarea && textarea.tagName === 'TEXTAREA') {
    console.log('Freshdesk AI: Found textarea')
    textarea.focus()
    textarea.value = text
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }

  // Strategy 5: Look for ANY contenteditable on the page that's visible
  const allEditable = document.querySelectorAll('[contenteditable="true"]')
  for (const el of allEditable) {
    const htmlEl = el as HTMLElement
    // Check if it's visible and looks like a reply area
    const rect = htmlEl.getBoundingClientRect()
    if (rect.width > 200 && rect.height > 50 && rect.bottom > 0) {
      console.log('Freshdesk AI: Found visible contenteditable element')
      return insertIntoEditor(htmlEl)
    }
  }

  // Strategy 6: Try clicking the Reply button first to open the reply area
  const replyButtons = document.querySelectorAll('button[title*="Reply"], [class*="reply-btn"], a[title*="Reply"], button:contains("Reply"), [data-action="reply"]')
  for (const btn of replyButtons) {
    const htmlBtn = btn as HTMLElement
    if (htmlBtn.offsetParent !== null) { // Check if visible
      console.log('Freshdesk AI: Clicking reply button to open editor...')
      htmlBtn.click()

      // Return true - the popup should notify user to try again after clicking
      return false
    }
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
