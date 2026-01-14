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

  // Patterns that indicate metadata/UI text (NOT the actual message)
  const metadataPatterns = [
    /^New customer message on/i,
    /^\d{1,2}\/\d{1,2}\/\d{4}/,
    /^Status:/i,
    /^Priority:/i,
    /^Type:/i,
    /^Group:/i,
    /^Agent:/i,
    /^Tags:/i,
    /^Re:/i,
    /^Order #\d+/i,
    /reported via email/i,
    /hours? ago/i,
    /minutes? ago/i,
    /days? ago/i,
    /^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i,
    /^To:/i,
    /^From:/i,
    /^CC:/i,
    /PM\s*$/i,
    /AM\s*$/i,
    /Status:\s*Open/i,
    /Status:\s*Pending/i,
    /Status:\s*Closed/i,
  ]

  function isMetadataText(text: string): boolean {
    const trimmed = text.trim()
    if (trimmed.length < 30) return true
    return metadataPatterns.some(p => p.test(trimmed))
  }

  function isActualMessageContent(text: string): boolean {
    const trimmed = text.trim()
    // Must be substantial
    if (trimmed.length < 50) return false
    // Should contain sentence-like patterns
    if (!/[.!?]/.test(trimmed)) return false
    // Should have multiple words
    if (trimmed.split(/\s+/).length < 10) return false
    // Should not be metadata
    if (isMetadataText(trimmed)) return false
    return true
  }

  // Strategy 1: Look for the email body content specifically
  // Freshdesk displays emails in specific containers
  const emailBodySelectors = [
    '.ticket-message-content',
    '.message-content',
    '.email-body',
    '.ticket-description',
    '.conversation-body',
    '.msg-body',
    '[class*="message-body"]',
    '[class*="email-content"]',
    '[class*="ticket-body"]',
  ]

  for (const selector of emailBodySelectors) {
    try {
      const elements = document.querySelectorAll(selector)
      for (const el of elements) {
        const text = cleanMessageText(el.textContent || '')
        if (isActualMessageContent(text)) {
          console.log(`Freshdesk AI: Found message via ${selector}`)
          return text.slice(0, 2000)
        }
      }
    } catch (e) {
      // Continue
    }
  }

  // Strategy 2: Look for paragraphs that look like email content
  // Real email messages typically have greeting + content + signature pattern
  const allParagraphs = document.querySelectorAll('p, div')
  const contentBlocks: string[] = []

  allParagraphs.forEach(el => {
    const text = cleanMessageText(el.textContent || '')
    // Look for content that starts with a greeting or has email patterns
    if (text.length > 100 && (
      /^(hi|hello|dear|greetings|good\s+(morning|afternoon|evening))/i.test(text) ||
      /thank\s*(you|s)/i.test(text) ||
      /@[a-z0-9.-]+\.[a-z]{2,}/i.test(text) || // Contains email
      /sent from my (iphone|android|mobile)/i.test(text)
    )) {
      if (!isMetadataText(text)) {
        contentBlocks.push(text)
      }
    }
  })

  if (contentBlocks.length > 0) {
    // Get the longest content block (likely the main message)
    contentBlocks.sort((a, b) => b.length - a.length)
    console.log('Freshdesk AI: Found message via paragraph scan')
    return contentBlocks[0].slice(0, 2000)
  }

  // Strategy 3: Look for fr-view elements (Freshdesk's rich text display)
  const frViews = document.querySelectorAll('.fr-view')
  for (const frView of frViews) {
    const text = cleanMessageText(frView.textContent || '')
    if (isActualMessageContent(text)) {
      console.log('Freshdesk AI: Found message via fr-view')
      return text.slice(0, 2000)
    }
  }

  // Strategy 4: Look for the main ticket content area
  const mainContentSelectors = [
    '.ticket-details',
    '.ticket-content',
    '.conversation-container',
    '[class*="ticket-detail"]',
    'article',
  ]

  for (const selector of mainContentSelectors) {
    try {
      const container = document.querySelector(selector)
      if (container) {
        // Look for substantial text within this container
        const innerElements = container.querySelectorAll('div, p, span, td')
        for (const el of innerElements) {
          const text = cleanMessageText(el.textContent || '')
          if (isActualMessageContent(text)) {
            console.log(`Freshdesk AI: Found message in ${selector}`)
            return text.slice(0, 2000)
          }
        }
      }
    } catch (e) {
      // Continue
    }
  }

  // Strategy 5: Scan all text nodes and find the most message-like content
  const allElements = document.querySelectorAll('div, p, td, span, article')
  let bestMessage = ''
  let bestScore = 0

  allElements.forEach(el => {
    const text = cleanMessageText(el.textContent || '')
    if (text.length < 50 || text.length > 5000) return
    if (isMetadataText(text)) return

    // Score the text based on how "message-like" it is
    let score = 0
    if (/^(hi|hello|dear|greetings)/i.test(text)) score += 20
    if (/thank\s*(you|s)/i.test(text)) score += 10
    if (/@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) score += 10
    if (/[.!?]/.test(text)) score += 5
    if (text.split(/\s+/).length > 20) score += 10
    if (text.length > 200) score += 10
    if (/sent from my/i.test(text)) score += 15
    // Penalize text with too much metadata
    if (/Status:|Priority:|Type:|Group:/i.test(text)) score -= 50

    if (score > bestScore) {
      bestScore = score
      bestMessage = text
    }
  })

  if (bestScore > 10 && bestMessage.length > 50) {
    console.log('Freshdesk AI: Found message via scoring')
    return bestMessage.slice(0, 2000)
  }

  // Last resort: get longest text block
  let longestText = ''
  allElements.forEach(el => {
    const text = cleanMessageText(el.textContent || '')
    if (text.length > longestText.length && text.length < 3000 && !isMetadataText(text)) {
      longestText = text
    }
  })

  if (longestText.length > 100) {
    console.log('Freshdesk AI: Using longest text as fallback')
    return longestText.slice(0, 2000)
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
 * Clean message text but preserve some structure
 */
function cleanMessagePreserveStructure(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ')  // Normalize spaces but not newlines
    .replace(/^\s+|\s+$/gm, '')  // Trim each line
    .replace(/\n{3,}/g, '\n\n')  // Max 2 newlines
    .trim()
}

/**
 * Get the full email chain/conversation from the ticket
 * Returns messages in chronological order with sender labels
 */
export function getFullConversation(): string | null {
  console.log('Freshdesk AI: Scanning for full email chain...')

  const messages: Array<{ sender: 'customer' | 'agent' | 'unknown', text: string, timestamp?: string }> = []

  // Patterns to identify metadata vs actual content
  const metadataPatterns = [
    /^Status:/i, /^Priority:/i, /^Type:/i, /^Group:/i, /^Agent:/i, /^Tags:/i,
    /^To:/i, /^From:/i, /^CC:/i, /^Subject:/i,
    /reported via email/i, /hours? ago/i, /minutes? ago/i, /days? ago/i,
  ]

  function isMetadata(text: string): boolean {
    const trimmed = text.trim()
    if (trimmed.length < 30) return true
    return metadataPatterns.some(p => p.test(trimmed))
  }

  function isSubstantialContent(text: string): boolean {
    const trimmed = text.trim()
    if (trimmed.length < 40) return false
    if (!/[.!?]/.test(trimmed)) return false
    if (trimmed.split(/\s+/).length < 8) return false
    return !isMetadata(trimmed)
  }

  // Strategy 1: Look for structured conversation threads
  // Freshdesk often has .conversation-thread, .thread-item, etc.
  const threadSelectors = [
    '.conversation-thread .thread-item',
    '.message-thread .message',
    '[class*="conversation"] [class*="message"]',
    '[class*="thread"] [class*="item"]',
    '.ticket-conversation > div',
    '.conv-container > div',
  ]

  for (const selector of threadSelectors) {
    try {
      const items = document.querySelectorAll(selector)
      if (items.length > 0) {
        items.forEach(item => {
          const text = cleanMessagePreserveStructure(item.textContent || '')
          if (isSubstantialContent(text)) {
            // Try to determine if it's from customer or agent
            const isCustomer = item.classList.contains('incoming') ||
                               item.classList.contains('customer') ||
                               item.classList.contains('requester') ||
                               item.querySelector('[class*="incoming"], [class*="customer"]') !== null
            const isAgent = item.classList.contains('outgoing') ||
                            item.classList.contains('agent') ||
                            item.querySelector('[class*="outgoing"], [class*="agent"]') !== null

            messages.push({
              sender: isCustomer ? 'customer' : (isAgent ? 'agent' : 'unknown'),
              text: text.slice(0, 1500)
            })
          }
        })

        if (messages.length > 0) {
          console.log(`Freshdesk AI: Found ${messages.length} messages via thread selector`)
          break
        }
      }
    } catch (e) {
      // Continue
    }
  }

  // Strategy 2: Look for fr-view elements (Freshdesk's rich text display)
  // These often contain the actual message bodies
  if (messages.length === 0) {
    const frViews = document.querySelectorAll('.fr-view')
    frViews.forEach((frView, index) => {
      const text = cleanMessagePreserveStructure(frView.textContent || '')
      if (isSubstantialContent(text)) {
        // Try to determine sender from parent context
        const parent = frView.closest('[class*="message"], [class*="thread"], [class*="conv"]')
        const isCustomer = parent?.classList.contains('incoming') ||
                           parent?.classList.contains('customer') ||
                           parent?.querySelector('[class*="incoming"]') !== null
        const isAgent = parent?.classList.contains('outgoing') ||
                        parent?.classList.contains('agent') ||
                        parent?.querySelector('[class*="outgoing"]') !== null

        messages.push({
          sender: isCustomer ? 'customer' : (isAgent ? 'agent' : (index === 0 ? 'customer' : 'unknown')),
          text: text.slice(0, 1500)
        })
      }
    })

    if (messages.length > 0) {
      console.log(`Freshdesk AI: Found ${messages.length} messages via fr-view`)
    }
  }

  // Strategy 3: Look for blockquotes (often used for quoted replies in email chains)
  if (messages.length === 0) {
    // First get the main message
    const mainContent = document.querySelector('.ticket-description, .message-content, [class*="ticket-body"]')
    if (mainContent) {
      const mainText = cleanMessagePreserveStructure(mainContent.textContent || '')
      if (isSubstantialContent(mainText)) {
        messages.push({ sender: 'customer', text: mainText.slice(0, 1500) })
      }
    }

    // Then look for quoted content
    const blockquotes = document.querySelectorAll('blockquote, [class*="quoted"], [class*="reply-quote"]')
    blockquotes.forEach(bq => {
      const text = cleanMessagePreserveStructure(bq.textContent || '')
      if (isSubstantialContent(text)) {
        messages.push({ sender: 'agent', text: text.slice(0, 1500) })
      }
    })
  }

  // Strategy 4: Parse email chain from "On X wrote:" patterns
  if (messages.length <= 1) {
    const bodyText = document.body.textContent || ''
    const emailChainPattern = /On\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[^:]+wrote:/gi
    const parts = bodyText.split(emailChainPattern)

    if (parts.length > 1) {
      parts.forEach((part, index) => {
        const cleaned = cleanMessagePreserveStructure(part)
        if (isSubstantialContent(cleaned)) {
          messages.push({
            sender: index === 0 ? 'customer' : 'agent',
            text: cleaned.slice(0, 1500)
          })
        }
      })

      if (messages.length > 1) {
        console.log(`Freshdesk AI: Found ${messages.length} messages via email chain parsing`)
      }
    }
  }

  // If we have messages, format them as a conversation
  if (messages.length > 0) {
    // Remove duplicates (same text)
    const seen = new Set<string>()
    const uniqueMessages = messages.filter(m => {
      const key = m.text.slice(0, 100)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // Format the conversation
    const formatted = uniqueMessages.map((m, i) => {
      const label = m.sender === 'customer' ? 'CUSTOMER' :
                    m.sender === 'agent' ? 'AGENT' : `MESSAGE ${i + 1}`
      return `[${label}]:\n${m.text}`
    }).join('\n\n---\n\n')

    console.log(`Freshdesk AI: Returning conversation with ${uniqueMessages.length} messages`)
    return formatted.slice(0, 6000) // Allow longer for full chain
  }

  // Fallback: use the single message extraction
  console.log('Freshdesk AI: No conversation found, falling back to single message')
  return null
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
