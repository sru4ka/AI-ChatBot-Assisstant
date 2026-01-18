/**
 * Content script for Freshdesk AI Assistant
 * Injected into Freshdesk pages to read ticket content and insert replies
 */

import {
  isOnTicketPage,
  getTicketId,
  getLatestCustomerMessage,
  getFullConversation,
  getTicketSubject,
  insertReply,
  removeFloatingButton,
} from './utils/freshdesk'

// Message types
interface Message {
  type: string
  payload?: unknown
}

// State
let inlineButtons: HTMLElement[] = []
let panelContainer: HTMLElement | null = null
let isGenerating = false
let generatedReply = ''

// Current settings
let currentTone: 'professional' | 'friendly' | 'concise' = 'professional'
let currentCustomPrompt = ''

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  console.log('Content script received message:', message.type)

  switch (message.type) {
    case 'PING':
      sendResponse({ success: true })
      return true

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
    sendResponse({ success: false, error: 'Not on a Freshdesk ticket page' })
    return
  }

  const customerMessage = getLatestCustomerMessage()
  const ticketSubject = getTicketSubject()

  if (!customerMessage) {
    sendResponse({ success: false, error: 'Could not find customer message on this page' })
    return
  }

  sendResponse({ success: true, customerMessage, ticketSubject })
}

function handleInsertReply(reply: string, sendResponse: (response: unknown) => void) {
  if (!reply) {
    sendResponse({ success: false, error: 'No reply text provided' })
    return
  }

  const success = insertReply(reply)
  sendResponse({ success, error: success ? undefined : 'Could not find reply text area' })
}

// Create button element with unique ID - styled to match Freshdesk action buttons
function createButtonElement(id: string, _matchStyle?: Element | null): HTMLElement {
  const wrapper = document.createElement('span')
  wrapper.id = id
  wrapper.className = 'freshdesk-ai-inline-wrapper'

  // Style to match Freshdesk's action button styling
  wrapper.style.cssText = 'display: inline-flex; align-items: center; margin-left: 8px;'

  wrapper.innerHTML = `
    <a class="freshdesk-ai-main-btn" href="javascript:void(0)" style="display: inline-flex; align-items: center; gap: 4px; padding: 6px 10px; color: #7c3aed; font-weight: 500; text-decoration: none; font-size: 13px; border-radius: 4px; background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); border: 1px solid #c4b5fd;">
      <span style="font-size: 14px;">✨</span>
      <span>Reply with AI</span>
    </a>
    <a class="freshdesk-ai-dropdown-toggle" href="javascript:void(0)" style="display: inline-flex; align-items: center; padding: 6px 6px; margin-left: 2px; color: #7c3aed; text-decoration: none; font-size: 10px; border-radius: 4px; background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); border: 1px solid #c4b5fd;">▼</a>
  `
  return wrapper
}

// Find all Forward buttons/links on the page
function findAllForwardButtons(): Element[] {
  const forwardButtons: Element[] = []

  // Method 1: Find by text content "Forward" - most reliable
  const allElements = document.querySelectorAll('a, button, span, div')
  for (const el of allElements) {
    const text = el.textContent?.trim()
    // Must be exactly "Forward" or start with "Forward" (with icon)
    if (text === 'Forward' || text?.match(/^[\s\u200B]*Forward[\s\u200B]*$/)) {
      // Skip if it's a child of another Forward element we already found
      const isChild = forwardButtons.some(btn => btn.contains(el) || el.contains(btn))
      if (!isChild) {
        // Find the actual clickable ancestor (a or button)
        let clickable: Element | null = el
        while (clickable && clickable.tagName !== 'A' && clickable.tagName !== 'BUTTON') {
          clickable = clickable.parentElement
        }
        if (clickable && !forwardButtons.includes(clickable)) {
          forwardButtons.push(clickable)
        } else if (!clickable && !forwardButtons.includes(el)) {
          forwardButtons.push(el)
        }
      }
    }
  }

  // Method 2: Title attribute
  const titledElements = document.querySelectorAll('[title="Forward"]')
  titledElements.forEach(el => {
    if (!forwardButtons.includes(el)) {
      forwardButtons.push(el)
    }
  })

  console.log('Freshdesk AI: Forward buttons found:', forwardButtons.map(b => ({
    tag: b.tagName,
    text: b.textContent?.trim().slice(0, 20),
    parent: b.parentElement?.tagName,
    grandparent: b.parentElement?.parentElement?.tagName
  })))

  return forwardButtons
}

// Find the Freshdesk action button areas and inject our button
function injectInlineButton() {
  // Remove existing buttons
  inlineButtons.forEach(btn => btn.remove())
  inlineButtons = []

  // Find all Forward buttons (top and bottom action bars)
  const forwardButtons = findAllForwardButtons()

  console.log(`Freshdesk AI: Found ${forwardButtons.length} Forward buttons`)

  let injectedCount = 0

  // Inject a button next to each Forward button
  forwardButtons.forEach((forwardBtn, index) => {
    // Get the parent that contains the button row
    let parent = forwardBtn.parentElement

    // Check if we already added a button in this parent tree
    let checkEl: Element | null = parent
    while (checkEl) {
      if (checkEl.querySelector('.freshdesk-ai-inline-wrapper')) {
        console.log(`Freshdesk AI: Button ${index} - already have button in this area`)
        return
      }
      // Don't go too far up
      if (checkEl.tagName === 'BODY' || checkEl.classList.contains('ticket-details')) break
      checkEl = checkEl.parentElement
    }

    if (!parent) return

    const btn = createButtonElement(`freshdesk-ai-inline-btn-${index}`, forwardBtn)

    // Try to insert as a sibling right after the Forward button
    // Check if Forward button is a direct child or wrapped
    if (parent.contains(forwardBtn)) {
      // Insert directly after the forward button in the same parent
      if (forwardBtn.nextSibling) {
        parent.insertBefore(btn, forwardBtn.nextSibling)
        console.log(`Freshdesk AI: Inserted button ${index} after Forward (has sibling)`)
      } else {
        parent.appendChild(btn)
        console.log(`Freshdesk AI: Appended button ${index} to Forward's parent`)
      }
      inlineButtons.push(btn)
      injectedCount++
    }
  })

  // Fallback: If no buttons injected, look for action bars by class pattern
  if (injectedCount === 0) {
    console.log('Freshdesk AI: No Forward buttons found, trying fallback selectors')

    // Look for any area with Reply, Add note buttons
    const allLinks = document.querySelectorAll('a, button')
    for (const link of allLinks) {
      const text = link.textContent?.trim()
      if (text === 'Reply' || text?.match(/Reply$/)) {
        const parent = link.parentElement
        if (parent && !parent.querySelector('.freshdesk-ai-inline-wrapper')) {
          const btn = createButtonElement(`freshdesk-ai-inline-btn-fallback-${injectedCount}`)
          parent.appendChild(btn)
          inlineButtons.push(btn)
          injectedCount++
          console.log('Freshdesk AI: Added button to Reply button area')
          if (injectedCount >= 2) break // Max 2 buttons
        }
      }
    }
  }

  // Final fallback: floating button
  if (injectedCount === 0) {
    const btn = createButtonElement('freshdesk-ai-inline-btn-floating')
    btn.classList.add('freshdesk-ai-floating')
    document.body.appendChild(btn)
    inlineButtons.push(btn)
    console.log('Freshdesk AI: Button added as floating (fallback)')
  } else {
    console.log(`Freshdesk AI: Injected ${injectedCount} buttons inline`)
  }

  // Also try to inject near the Send button if reply editor is open
  injectNearSendButton()

  // Create panel container (always floating, shared by all buttons)
  createPanel()

  // Load settings
  loadButtonSettings()

  // Add event listeners to all buttons
  setupEventListeners()

  // Watch for Send button appearing (reply editor opening)
  watchForSendButton()
}

// Inject button near the Send button in the reply editor
function injectNearSendButton() {
  // Find the Send button by text content
  const allButtons = document.querySelectorAll('button')
  for (const btn of allButtons) {
    const text = btn.textContent?.trim()
    if (text === 'Send' || text?.startsWith('Send')) {
      // Found Send button, check if we already have our button nearby
      const parent = btn.parentElement
      if (parent && !parent.querySelector('.freshdesk-ai-inline-wrapper')) {
        const aiBtn = createButtonElement('freshdesk-ai-inline-btn-send')
        // Insert before the Send button
        parent.insertBefore(aiBtn, btn)
        inlineButtons.push(aiBtn)
        console.log('Freshdesk AI: Added button next to Send button')

        // Re-attach event listeners
        const mainBtn = aiBtn.querySelector('.freshdesk-ai-main-btn')
        const dropdownToggle = aiBtn.querySelector('.freshdesk-ai-dropdown-toggle')

        mainBtn?.addEventListener('click', async (e) => {
          e.preventDefault()
          e.stopPropagation()
          document.getElementById('freshdesk-ai-dropdown-menu')?.classList.add('hidden')
          await handleGenerateReply()
        })

        dropdownToggle?.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          const resultPanel = document.getElementById('freshdesk-ai-result-panel')
          const dropdownMenu = document.getElementById('freshdesk-ai-dropdown-menu')
          resultPanel?.classList.add('hidden')
          dropdownMenu?.classList.toggle('hidden')
          panelContainer?.classList.toggle('hidden', dropdownMenu?.classList.contains('hidden') ?? true)
        })

        break
      }
    }
  }
}

// Watch for Send button appearing (when user clicks Reply)
function watchForSendButton() {
  const observer = new MutationObserver(() => {
    // Check if Send button appeared and we don't have our button next to it
    const allButtons = document.querySelectorAll('button')
    for (const btn of allButtons) {
      const text = btn.textContent?.trim()
      if (text === 'Send' || text?.startsWith('Send')) {
        const parent = btn.parentElement
        if (parent && !parent.querySelector('.freshdesk-ai-inline-wrapper')) {
          // Send button appeared without our button, inject it
          injectNearSendButton()
          break
        }
      }
    }
  })

  observer.observe(document.body, { childList: true, subtree: true })
}

function createPanel() {
  // Remove existing panel
  if (panelContainer) {
    panelContainer.remove()
  }

  panelContainer = document.createElement('div')
  panelContainer.id = 'freshdesk-ai-panel-container'
  panelContainer.className = 'freshdesk-ai-panel-container hidden'
  panelContainer.innerHTML = `
    <div id="freshdesk-ai-dropdown-menu" class="freshdesk-ai-dropdown-menu hidden">
      <div class="dropdown-tabs">
        <button class="dropdown-tab active" data-tab="settings">Settings</button>
        <button class="dropdown-tab" data-tab="order-info">Order Info</button>
        <button class="dropdown-tab" data-tab="summary">Summary</button>
      </div>
      <div id="dropdown-tab-settings" class="dropdown-tab-content">
        <div class="dropdown-section">
          <label>Response Tone</label>
          <div class="dropdown-tone-btns">
            <button class="dropdown-tone-btn active" data-tone="professional">Professional</button>
            <button class="dropdown-tone-btn" data-tone="friendly">Friendly</button>
            <button class="dropdown-tone-btn" data-tone="concise">Concise</button>
          </div>
        </div>
        <div class="dropdown-section">
          <label>Custom Instructions</label>
          <textarea id="freshdesk-ai-custom-prompt" placeholder="Add extra instructions for the AI..."></textarea>
        </div>
        <div class="dropdown-footer">
          <button id="freshdesk-ai-save-settings" class="dropdown-save-btn">Save & Close</button>
        </div>
      </div>
      <div id="dropdown-tab-order-info" class="dropdown-tab-content hidden">
        <div id="order-info-content" class="order-info-content">
          <div class="order-info-loading hidden"><span class="spinner"></span> Searching for orders...</div>
          <div class="order-info-empty">
            <p>Click "Search Orders" to find customer orders.</p>
            <button id="freshdesk-ai-search-orders" class="dropdown-save-btn">🔍 Search Orders</button>
          </div>
          <div class="order-info-results hidden"></div>
        </div>
      </div>
      <div id="dropdown-tab-summary" class="dropdown-tab-content hidden">
        <div id="summary-content" class="summary-content">
          <div class="summary-loading hidden"><span class="spinner"></span> Generating summary...</div>
          <div class="summary-empty">
            <p>Generate an AI summary of this ticket conversation.</p>
            <button id="freshdesk-ai-generate-summary" class="dropdown-save-btn">📝 Generate Summary</button>
          </div>
          <div class="summary-result hidden"></div>
        </div>
      </div>
    </div>
    <div id="freshdesk-ai-result-panel" class="freshdesk-ai-result-panel hidden">
      <div class="panel-header">
        <span>AI Generated Reply</span>
        <button id="freshdesk-ai-close" class="panel-close">&times;</button>
      </div>
      <div id="freshdesk-ai-content" class="panel-content">
        <div class="panel-loading"><span class="spinner"></span> Analyzing ticket...</div>
      </div>
      <div class="panel-regenerate">
        <input type="text" id="freshdesk-ai-regen-input" placeholder="Add instructions for regeneration (e.g., 'be more apologetic', 'mention refund policy')..." />
        <button id="freshdesk-ai-regenerate" class="panel-btn panel-btn-regen" disabled>🔄 Regenerate</button>
      </div>
      <div class="panel-actions">
        <button id="freshdesk-ai-copy" class="panel-btn panel-btn-secondary" disabled>Copy</button>
        <button id="freshdesk-ai-insert" class="panel-btn panel-btn-primary" disabled>Insert & Learn</button>
      </div>
    </div>
  `

  document.body.appendChild(panelContainer)
}

function setupEventListeners() {
  const dropdownMenu = document.getElementById('freshdesk-ai-dropdown-menu')
  const resultPanel = document.getElementById('freshdesk-ai-result-panel')
  const closeBtn = document.getElementById('freshdesk-ai-close')
  const copyBtn = document.getElementById('freshdesk-ai-copy')
  const insertBtn = document.getElementById('freshdesk-ai-insert')
  const saveSettingsBtn = document.getElementById('freshdesk-ai-save-settings')
  const customPromptInput = document.getElementById('freshdesk-ai-custom-prompt') as HTMLTextAreaElement
  const regenerateBtn = document.getElementById('freshdesk-ai-regenerate')
  const regenInput = document.getElementById('freshdesk-ai-regen-input') as HTMLInputElement
  const searchOrdersBtn = document.getElementById('freshdesk-ai-search-orders')
  const generateSummaryBtn = document.getElementById('freshdesk-ai-generate-summary')

  // Tab switching
  const dropdownTabs = panelContainer?.querySelectorAll('.dropdown-tab')
  dropdownTabs?.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = (tab as HTMLElement).dataset.tab
      dropdownTabs.forEach(t => t.classList.remove('active'))
      tab.classList.add('active')

      // Show/hide tab content
      document.getElementById('dropdown-tab-settings')?.classList.toggle('hidden', tabId !== 'settings')
      document.getElementById('dropdown-tab-order-info')?.classList.toggle('hidden', tabId !== 'order-info')
      document.getElementById('dropdown-tab-summary')?.classList.toggle('hidden', tabId !== 'summary')
    })
  })

  // Search orders button
  searchOrdersBtn?.addEventListener('click', handleSearchOrders)

  // Generate summary button
  generateSummaryBtn?.addEventListener('click', handleGenerateSummary)

  // Add event listeners to all main buttons (there may be multiple)
  const mainBtns = document.querySelectorAll('.freshdesk-ai-main-btn')
  mainBtns.forEach(mainBtn => {
    mainBtn.addEventListener('click', async (e) => {
      e.preventDefault()
      e.stopPropagation()
      dropdownMenu?.classList.add('hidden')
      await handleGenerateReply()
    })
  })

  // Add event listeners to all dropdown toggles
  const dropdownToggles = document.querySelectorAll('.freshdesk-ai-dropdown-toggle')
  dropdownToggles.forEach(dropdownToggle => {
    dropdownToggle.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      resultPanel?.classList.add('hidden')
      dropdownMenu?.classList.toggle('hidden')
      panelContainer?.classList.toggle('hidden', dropdownMenu?.classList.contains('hidden') ?? true)
    })
  })

  // Close button
  closeBtn?.addEventListener('click', () => {
    resultPanel?.classList.add('hidden')
    panelContainer?.classList.add('hidden')
  })

  // Copy button
  copyBtn?.addEventListener('click', handleCopyReply)

  // Insert button (now also learns)
  insertBtn?.addEventListener('click', handleInsertGeneratedReply)

  // Regenerate button - now tracks instruction history for chat-like experience
  regenerateBtn?.addEventListener('click', async () => {
    const newInstruction = regenInput?.value?.trim() || ''
    if (newInstruction) {
      // Add to instruction history for chat-like regeneration
      instructionHistory.push(newInstruction)
    }
    await handleGenerateReply(newInstruction)
    if (regenInput) regenInput.value = '' // Clear input after use
  })

  // Tone buttons
  const toneBtns = panelContainer?.querySelectorAll('.dropdown-tone-btn')
  toneBtns?.forEach(btn => {
    btn.addEventListener('click', () => {
      toneBtns.forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      currentTone = (btn as HTMLElement).dataset.tone as typeof currentTone
    })
  })

  // Save settings
  saveSettingsBtn?.addEventListener('click', () => {
    currentCustomPrompt = customPromptInput?.value || ''
    saveButtonSettings()
    dropdownMenu?.classList.add('hidden')
    panelContainer?.classList.add('hidden')
    showToast('Settings saved!', 'success')
  })

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    const target = e.target as Node
    const clickedOnButton = inlineButtons.some(btn => btn.contains(target))
    if (!clickedOnButton && !panelContainer?.contains(target)) {
      dropdownMenu?.classList.add('hidden')
      // Don't close result panel when clicking outside
    }
  })
}

async function loadButtonSettings() {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      console.warn('Chrome storage not available')
      return
    }
    const result = await chrome.storage.local.get(['freshdeskAiSettings', 'defaultTone', 'customPrompt'])

    if (result.freshdeskAiSettings) {
      currentTone = result.freshdeskAiSettings.defaultTone || 'professional'
      currentCustomPrompt = result.freshdeskAiSettings.customPrompt || ''
    } else {
      currentTone = result.defaultTone || 'professional'
      currentCustomPrompt = result.customPrompt || ''
    }

    // Update UI
    const toneBtns = document.querySelectorAll('.dropdown-tone-btn')
    toneBtns.forEach(btn => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.tone === currentTone)
    })

    const customPromptInput = document.getElementById('freshdesk-ai-custom-prompt') as HTMLTextAreaElement
    if (customPromptInput) {
      customPromptInput.value = currentCustomPrompt
    }
  } catch (err) {
    console.error('Failed to load settings:', err)
  }
}

async function saveButtonSettings() {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      console.warn('Chrome storage not available')
      return
    }
    const result = await chrome.storage.local.get(['freshdeskAiSettings'])
    const existingSettings = result.freshdeskAiSettings || {}

    await chrome.storage.local.set({
      freshdeskAiSettings: {
        ...existingSettings,
        defaultTone: currentTone,
        customPrompt: currentCustomPrompt,
      },
      defaultTone: currentTone,
      customPrompt: currentCustomPrompt,
    })
  } catch (err) {
    console.error('Failed to save settings:', err)
  }
}

// Store the current conversation for regeneration
let currentConversation = ''
// Store instruction history for chat-like regeneration
let instructionHistory: string[] = []
// Store the last AI reply for context
let lastAiReply = ''

async function handleGenerateReply(oneTimeInstructions = '') {
  if (isGenerating) return

  const resultPanel = document.getElementById('freshdesk-ai-result-panel')
  const content = document.getElementById('freshdesk-ai-content')
  const copyBtn = document.getElementById('freshdesk-ai-copy') as HTMLButtonElement
  const insertBtn = document.getElementById('freshdesk-ai-insert') as HTMLButtonElement
  const regenerateBtn = document.getElementById('freshdesk-ai-regenerate') as HTMLButtonElement
  const mainBtns = document.querySelectorAll('.freshdesk-ai-main-btn')

  if (!resultPanel || !content || !panelContainer) return

  // Auto-open the reply editor first so it's ready when the AI generates a reply
  const replyOpened = await openReplyEditor()
  if (replyOpened) {
    console.log('Freshdesk AI: Reply editor opened, waiting for it to load...')
    // Wait for the editor to appear
    await new Promise(resolve => setTimeout(resolve, 800))
  }

  // Show panel and loading state
  panelContainer.classList.remove('hidden')
  resultPanel.classList.remove('hidden')
  isGenerating = true

  // Update all buttons to show loading state
  mainBtns.forEach(btn => {
    btn.innerHTML = '<span class="ai-icon">⏳</span><span>Generating...</span>'
  })
  content.innerHTML = '<div class="panel-loading"><span class="spinner"></span> Scanning ticket and generating reply...</div>'

  if (copyBtn) copyBtn.disabled = true
  if (insertBtn) insertBtn.disabled = true
  if (regenerateBtn) regenerateBtn.disabled = true

  try {
    // Auto-scan: Get full conversation chain (or fall back to latest message)
    // Only re-scan if we don't have a conversation yet (first generation)
    const isRegeneration = oneTimeInstructions !== ''
    if (!currentConversation || !isRegeneration) {
      currentConversation = getFullConversation() || ''
      if (!currentConversation) {
        currentConversation = getLatestCustomerMessage() || ''
      }
      // Reset instruction history on fresh generation
      if (!isRegeneration) {
        instructionHistory = []
        lastAiReply = ''
      }
    }

    if (!currentConversation) {
      throw new Error('Could not find customer message on this page')
    }

    // Get signature from settings - with safety check
    let signature = ''
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const settings = await chrome.storage.local.get(['freshdeskAiSettings'])
        signature = settings.freshdeskAiSettings?.signature || ''
      }
    } catch (e) {
      console.warn('Could not access chrome storage for settings:', e)
    }

    // Get auth session - Supabase stores as JSON string, need to parse
    let authData: { access_token?: string; user?: { id: string } } | null = null
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const sessionData = await chrome.storage.local.get(['sb-iyeqiwixenjiakeisdae-auth-token'])
        authData = sessionData['sb-iyeqiwixenjiakeisdae-auth-token']

        // Parse if it's a string (Supabase stores session as JSON string)
        if (typeof authData === 'string') {
          try {
            authData = JSON.parse(authData)
          } catch (e) {
            console.error('Failed to parse auth data:', e)
            authData = null
          }
        }
      }
    } catch (e) {
      console.error('Could not access chrome storage for auth:', e)
      throw new Error('Could not access extension storage. Please refresh the page.')
    }

    if (!authData?.access_token) {
      throw new Error('Please log in via the extension popup first')
    }

    // Call the generate-reply function
    const response = await fetch('https://iyeqiwixenjiakeisdae.supabase.co/functions/v1/generate-reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authData.access_token}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5ZXFpd2l4ZW5qaWFrZWlzZGFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMjQ0ODMsImV4cCI6MjA4MzgwMDQ4M30.1IFITfO7xh-cXCYarz4pJTqwMCpBSHgHaK6yxbzT3rc',
      },
      body: JSON.stringify({
        businessId: authData.user?.id,
        customerMessage: currentConversation,
        tone: currentTone,
        customPrompt: currentCustomPrompt || undefined,
        oneTimeInstructions: oneTimeInstructions || undefined, // For regeneration guidance
        instructionHistory: instructionHistory.length > 0 ? instructionHistory : undefined, // Full history for chat-like experience
        previousReply: lastAiReply || undefined, // Previous AI reply for context
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to generate reply')
    }

    const data = await response.json()
    generatedReply = data.reply + (signature ? `\n\n${signature}` : '')
    lastAiReply = generatedReply // Store for chat-like regeneration context

    // Show the reply (editable so user can make tweaks before inserting)
    content.innerHTML = `<div class="panel-reply" contenteditable="true" id="freshdesk-ai-reply-editor">${generatedReply.replace(/\n/g, '<br>')}</div>`

    // Add input listener to track user edits
    const replyEditor = document.getElementById('freshdesk-ai-reply-editor')
    replyEditor?.addEventListener('input', () => {
      // Update generatedReply when user edits
      generatedReply = replyEditor.innerText || ''
    })

    if (copyBtn) copyBtn.disabled = false
    if (insertBtn) insertBtn.disabled = false
    if (regenerateBtn) regenerateBtn.disabled = false

    showToast(oneTimeInstructions ? 'Reply regenerated!' : 'Reply generated!', 'success')
  } catch (error) {
    console.error('Error generating reply:', error)
    content.innerHTML = `<div class="panel-error">Error: ${error instanceof Error ? error.message : 'Failed to generate reply'}</div>`
    showToast(error instanceof Error ? error.message : 'Failed to generate reply', 'error')
  } finally {
    isGenerating = false
    // Reset all buttons to normal state
    const allMainBtns = document.querySelectorAll('.freshdesk-ai-main-btn')
    allMainBtns.forEach(btn => {
      btn.innerHTML = '<span class="ai-icon">✨</span><span>Reply with AI</span>'
    })
  }
}

function handleCopyReply() {
  if (!generatedReply) return

  navigator.clipboard.writeText(generatedReply).then(() => {
    showToast('Copied to clipboard!', 'success')
  }).catch(() => {
    showToast('Failed to copy', 'error')
  })
}

async function handleInsertGeneratedReply() {
  if (!generatedReply) return

  const insertBtn = document.getElementById('freshdesk-ai-insert') as HTMLButtonElement
  if (insertBtn) {
    insertBtn.disabled = true
    insertBtn.textContent = 'Inserting...'
  }

  // First, try to open the reply editor by clicking the Reply button
  const replyOpened = await openReplyEditor()
  if (replyOpened) {
    // Wait a bit for the editor to fully appear
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  const success = insertReply(generatedReply)
  if (success) {
    showToast('Reply inserted! Learning...', 'success')
    const resultPanel = document.getElementById('freshdesk-ai-result-panel')
    resultPanel?.classList.add('hidden')
    panelContainer?.classList.add('hidden')

    // Auto-learn: Save this Q&A pair to knowledge base
    try {
      const ticketId = getTicketId()
      const result = await saveToKnowledgeBase(currentConversation, generatedReply, ticketId)
      if (result.success) {
        console.log('Freshdesk AI: Saved reply to knowledge base for ticket', ticketId)
        showToast(`✓ Learned from Ticket #${ticketId || 'unknown'}!`, 'success')
      } else if (result.error) {
        console.warn('Freshdesk AI: Learning issue:', result.error)
        // Show error if it's not a duplicate
        if (!result.error.includes('Similar content')) {
          showToast('Reply inserted, but learning failed', 'error')
        }
      }
    } catch (err) {
      console.error('Freshdesk AI: Failed to save to knowledge base:', err)
      showToast('Reply inserted, but learning failed', 'error')
    }
  } else {
    // Fallback: copy to clipboard
    navigator.clipboard.writeText(generatedReply).then(() => {
      showToast('Copied to clipboard - paste manually', 'success')
    }).catch(() => {
      showToast('Could not insert - please copy manually', 'error')
    })
  }

  // Reset button state
  if (insertBtn) {
    insertBtn.disabled = false
    insertBtn.textContent = 'Insert & Learn'
  }
}

// Try to open the reply editor by clicking the Reply button
async function openReplyEditor(): Promise<boolean> {
  console.log('Freshdesk AI: Attempting to open reply editor...')

  // Selectors for the Reply button in Freshdesk
  const replyButtonSelectors = [
    // Primary Freshdesk reply buttons
    'a[data-action="reply"]',
    'button[data-action="reply"]',
    '[data-aid="reply"]',
    '[data-testid="reply-button"]',
    // Text-based selectors
    'a:not(.freshdesk-ai-main-btn)',
    'button:not(.freshdesk-ai-main-btn)',
  ]

  // First try specific selectors
  for (const selector of replyButtonSelectors.slice(0, 4)) {
    try {
      const btn = document.querySelector(selector) as HTMLElement
      if (btn) {
        console.log(`Freshdesk AI: Found reply button via ${selector}`)
        btn.click()
        return true
      }
    } catch (e) {
      // Continue
    }
  }

  // Try finding by text content "Reply"
  const allButtons = document.querySelectorAll('a, button')
  for (const btn of allButtons) {
    const text = btn.textContent?.trim()
    // Look for buttons that say exactly "Reply" (not "Reply with AI")
    if (text === 'Reply' && !btn.classList.contains('freshdesk-ai-main-btn')) {
      console.log('Freshdesk AI: Found Reply button by text content')
      ;(btn as HTMLElement).click()
      return true
    }
  }

  // Try clicking on reply area that might expand
  const replyAreaSelectors = [
    '.reply-click-area',
    '[data-aid="reply-click-area"]',
    '.reply-toggle',
    '[class*="reply-area"]',
    '.compose-reply',
    '[class*="compose"]',
  ]

  for (const selector of replyAreaSelectors) {
    try {
      const area = document.querySelector(selector) as HTMLElement
      if (area) {
        console.log(`Freshdesk AI: Found reply area via ${selector}`)
        area.click()
        return true
      }
    } catch (e) {
      // Continue
    }
  }

  console.log('Freshdesk AI: Could not find reply button/area')
  return false
}

// Save Q&A pair to knowledge base for learning
async function saveToKnowledgeBase(question: string, answer: string, ticketId?: string | null): Promise<{ success: boolean; error?: string }> {
  // Get auth session with safety check
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    console.warn('Chrome storage not available for learning')
    return { success: false, error: 'Chrome storage not available. Please refresh the page.' }
  }

  try {
    const sessionData = await chrome.storage.local.get(['sb-iyeqiwixenjiakeisdae-auth-token'])
    let authData = sessionData['sb-iyeqiwixenjiakeisdae-auth-token']

    if (typeof authData === 'string') {
      try {
        authData = JSON.parse(authData)
      } catch (e) {
        return { success: false, error: 'Invalid auth data' }
      }
    }

    if (!authData?.access_token) {
      return { success: false, error: 'Not logged in. Please log in via the extension popup.' }
    }

    // Call the learn-reply endpoint
    const response = await fetch('https://iyeqiwixenjiakeisdae.supabase.co/functions/v1/learn-reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authData.access_token}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5ZXFpd2l4ZW5qaWFrZWlzZGFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMjQ0ODMsImV4cCI6MjA4MzgwMDQ4M30.1IFITfO7xh-cXCYarz4pJTqwMCpBSHgHaK6yxbzT3rc',
      },
      body: JSON.stringify({
        businessId: authData.user?.id,
        question,
        answer,
        ticketId: ticketId || undefined,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to save to knowledge base' }
    }

    console.log('Freshdesk AI: Learned from ticket', ticketId || 'unknown', 'document:', data.documentName)
    return { success: true }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    // Check for extension context invalidated error
    if (errorMessage.includes('Extension context invalidated')) {
      return { success: false, error: 'Extension was reloaded. Please refresh the page.' }
    }
    return { success: false, error: errorMessage }
  }
}

// Extract customer info from the Freshdesk ticket page
interface CustomerInfo {
  email: string | null
  name: string | null
  phone: string | null
  orderNumber: string | null
}

function extractCustomerInfo(): CustomerInfo {
  const info: CustomerInfo = {
    email: null,
    name: null,
    phone: null,
    orderNumber: null,
  }

  const bodyText = document.body.innerText || ''

  // 1. Extract requester name from Freshdesk (the customer who submitted the ticket)
  // Look for the ticket requester name (shown at top of ticket)
  const requesterNameSelectors = [
    '.requester-name',
    '.ticket-requester-name',
    '[data-testid="requester-name"]',
    '.contact-name',
    // Freshdesk specific: the name shown in ticket header
    '.ticket-header .name',
    '.fw-ticket-header .name',
    '.reported-by a',
    '.requester a',
  ]

  for (const selector of requesterNameSelectors) {
    try {
      const el = document.querySelector(selector)
      if (el) {
        const text = el.textContent?.trim()
        if (text && text.length > 2 && !text.includes('@')) {
          info.name = text
          break
        }
      }
    } catch (e) {
      // Continue
    }
  }

  // Also try to find name from "reported via email" pattern
  const reportedByMatch = bodyText.match(/([A-Z][a-z]+ [A-Z][a-z]+)\s+reported via email/i)
  if (reportedByMatch && !info.name) {
    info.name = reportedByMatch[1]
  }

  // 2. Extract requester email (the customer's email, NOT the support email)
  // First try specific Freshdesk selectors
  const emailSelectors = [
    '.requester-email',
    '.customer-email',
    '[data-testid="requester-email"]',
    '.contact-email',
    '.ticket-requester a[href^="mailto:"]',
  ]

  for (const selector of emailSelectors) {
    try {
      const el = document.querySelector(selector)
      if (el) {
        const text = el.textContent?.trim() || ''
        if (text.includes('@') && !text.toLowerCase().includes('support@')) {
          info.email = text
          break
        }
        const href = el.getAttribute('href')
        if (href?.startsWith('mailto:')) {
          const email = href.replace('mailto:', '')
          if (!email.toLowerCase().includes('support@')) {
            info.email = email
            break
          }
        }
      }
    } catch (e) {
      // Continue
    }
  }

  // Try to find email from the message content - look for customer email in "From:" or similar
  if (!info.email) {
    // Look for contact form email field
    const emailFieldMatch = bodyText.match(/(?:Email|From|Customer Email):\s*\n?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i)
    if (emailFieldMatch) {
      const email = emailFieldMatch[1].trim()
      if (!email.toLowerCase().includes('support@') && !email.toLowerCase().includes('ergonomiclux')) {
        info.email = email
      }
    }
  }

  // Find all emails on the page and pick the best one (customer email)
  if (!info.email) {
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
    const emails = bodyText.match(emailPattern)
    if (emails && emails.length > 0) {
      // Filter out support/internal emails and find customer email
      for (const email of emails) {
        const lowerEmail = email.toLowerCase()
        if (!lowerEmail.includes('freshdesk') &&
            !lowerEmail.includes('support@') &&
            !lowerEmail.includes('noreply') &&
            !lowerEmail.includes('ergonomiclux.com') &&  // Filter out your own domain
            !lowerEmail.includes('neckfort')) {
          info.email = email
          break
        }
      }
    }
  }

  // 3. Extract phone number
  const phoneSelectors = [
    '.requester-phone',
    '.customer-phone',
    '.contact-phone',
  ]

  for (const selector of phoneSelectors) {
    try {
      const el = document.querySelector(selector)
      if (el) {
        const text = el.textContent?.trim()
        if (text && /[\d\s\-+()]{7,}/.test(text)) {
          info.phone = text.replace(/\D/g, '')
          break
        }
      }
    } catch (e) {
      // Continue
    }
  }

  // Also try to find phone from text
  if (!info.phone) {
    const phoneMatch = bodyText.match(/(?:Phone|Tel|Mobile|Cell):\s*\n?([\d\s\-+()]{7,})/i)
    if (phoneMatch) {
      info.phone = phoneMatch[1].replace(/\D/g, '')
    }
  }

  // 4. Extract order number from message content
  // Look for patterns like #2213, Order #2213, Order: 2213, etc.
  const orderPatterns = [
    /Order\s*#?\s*(\d{3,})/i,
    /#(\d{4,})/,
    /Order\s*(?:Number|No|ID)?:?\s*#?(\d{3,})/i,
    /ORDER\s*#(\d+)/i,
  ]

  for (const pattern of orderPatterns) {
    const match = bodyText.match(pattern)
    if (match) {
      info.orderNumber = match[1]
      break
    }
  }

  // Also check the subject line specifically
  const subjectEl = document.querySelector('.ticket-subject, .subject, h1, h2')
  if (subjectEl && !info.orderNumber) {
    const subjectText = subjectEl.textContent || ''
    const subjectOrderMatch = subjectText.match(/Order\s*#?\s*(\d{3,})/i) || subjectText.match(/#(\d{4,})/)
    if (subjectOrderMatch) {
      info.orderNumber = subjectOrderMatch[1]
    }
  }

  console.log('Extracted customer info:', info)
  return info
}

// Search for orders from Shopify
async function handleSearchOrders() {
  const orderInfoContent = document.getElementById('order-info-content')
  const loadingEl = orderInfoContent?.querySelector('.order-info-loading')
  const emptyEl = orderInfoContent?.querySelector('.order-info-empty')
  const resultsEl = orderInfoContent?.querySelector('.order-info-results')

  if (!orderInfoContent || !loadingEl || !emptyEl || !resultsEl) return

  // Show loading
  loadingEl.classList.remove('hidden')
  emptyEl.classList.add('hidden')
  resultsEl.classList.add('hidden')

  try {
    // Extract customer info from ticket
    const customerInfo = extractCustomerInfo()

    // Build search queries - prioritize email as it's most accurate
    // If we have email, ONLY use email to avoid getting orders from other customers with same name
    const searchQueries: string[] = []

    if (customerInfo.orderNumber) {
      // Specific order number is always highest priority
      searchQueries.push(`#${customerInfo.orderNumber}`)
    }

    if (customerInfo.email) {
      // Email is the most accurate way to find customer's orders
      searchQueries.push(customerInfo.email)
    } else {
      // Only use name/phone if we don't have email (less accurate)
      if (customerInfo.name) {
        searchQueries.push(customerInfo.name)
      }
      if (customerInfo.phone) {
        searchQueries.push(customerInfo.phone)
      }
    }

    if (searchQueries.length === 0) {
      throw new Error('Could not find customer info (name, email, phone, or order number) on this ticket')
    }

    console.log('Search queries to try:', searchQueries)

    // Get auth session
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      throw new Error('Chrome storage not available')
    }

    const sessionData = await chrome.storage.local.get(['sb-iyeqiwixenjiakeisdae-auth-token'])
    let authData = sessionData['sb-iyeqiwixenjiakeisdae-auth-token']

    if (typeof authData === 'string') {
      authData = JSON.parse(authData)
    }

    if (!authData?.access_token) {
      throw new Error('Please log in via the extension popup first')
    }

    // Define order type for proper typing
    interface ShopifyOrderResult {
      name: string
      email: string
      date: string
      status: string
      fulfillmentStatus: string | null
      total: string
      trackingNumbers: string[]
      trackingUrls: string[]
      trackingCompanies: string[]
      trackingStatuses: string[]
      note: string | null
      noteAttributes: { name: string; value: string }[] | null
      events: { id: number; created_at: string; message: string; subject_type: string; verb: string; author: string | null; body: string | null }[]
      items: { title: string; quantity: number; price: string }[]
      shippingAddress: { city: string; province: string; country: string } | null
      adminUrl: string
    }

    // Try each search query until we find results
    let data: { found: boolean; orders: ShopifyOrderResult[] } | null = null

    for (const query of searchQueries) {
      console.log('Trying search query:', query)

      const response = await fetch('https://iyeqiwixenjiakeisdae.supabase.co/functions/v1/shopify-orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authData.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5ZXFpd2l4ZW5qaWFrZWlzZGFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMjQ0ODMsImV4cCI6MjA4MzgwMDQ4M30.1IFITfO7xh-cXCYarz4pJTqwMCpBSHgHaK6yxbzT3rc',
        },
        body: JSON.stringify({
          businessId: authData.user?.id,
          searchQuery: query,
        }),
      })

      if (!response.ok) {
        console.warn('Search failed for query:', query)
        continue
      }

      const result = await response.json()
      if (result.found && result.orders && result.orders.length > 0) {
        data = result
        console.log('Found orders with query:', query)
        break
      }
    }

    if (!data || !data.found || !data.orders || data.orders.length === 0) {
      const searchedInfo = [
        customerInfo.orderNumber ? `Order #${customerInfo.orderNumber}` : null,
        customerInfo.name,
        customerInfo.email,
        customerInfo.phone,
      ].filter(Boolean).join(', ')

      resultsEl.innerHTML = `
        <div class="order-info-no-results">
          <p>No orders found for:</p>
          <p><strong>${searchedInfo || 'Unknown customer'}</strong></p>
        </div>
      `
      resultsEl.classList.remove('hidden')
      return
    }

    // Filter orders to only show orders matching the customer's email (if available)
    // This prevents showing orders from other customers with similar names
    let filteredOrders = data.orders
    if (customerInfo.email) {
      const customerEmailLower = customerInfo.email.toLowerCase()
      filteredOrders = data.orders.filter((order: { email?: string }) =>
        order.email?.toLowerCase() === customerEmailLower
      )
      // If no orders match the email, fall back to showing all (might be a different email on order)
      if (filteredOrders.length === 0) {
        filteredOrders = data.orders
      }
    }

    // Limit to 5 most recent orders
    filteredOrders = filteredOrders.slice(0, 5)

    // Render orders
    resultsEl.innerHTML = filteredOrders.map((order: ShopifyOrderResult) => `
      <div class="order-card">
        <div class="order-header">
          <span class="order-number">${order.name}</span>
          <span class="order-date">${new Date(order.date).toLocaleDateString()}</span>
        </div>
        <div class="order-status">
          <span class="status-badge ${order.status}">${order.status}</span>
          ${order.fulfillmentStatus ? `<span class="status-badge ${order.fulfillmentStatus}">${order.fulfillmentStatus}</span>` : ''}
        </div>
        <div class="order-total">${order.total}</div>
        ${order.items && order.items.length > 0 ? `
          <div class="order-items">
            ${order.items.map((item: { title: string; quantity: number }) => `<div class="order-item">${item.title} x${item.quantity}</div>`).join('')}
          </div>
        ` : ''}
        ${order.trackingNumbers && order.trackingNumbers.length > 0 ? `
          <div class="tracking-status">
            <div class="tracking-status-header">
              <span class="tracking-status-label">Tracking</span>
              ${order.trackingStatuses && order.trackingStatuses.length > 0
                ? `<span class="tracking-status-badge ${order.trackingStatuses[0].replace(/_/g, '-')}">${order.trackingStatuses[0].replace(/_/g, ' ')}</span>`
                : '<span class="tracking-status-badge confirmed">Shipped</span>'
              }
            </div>
            <div class="tracking-info">
              ${order.trackingNumbers.map((num: string, i: number) => `
                <div class="tracking-number-row" data-tracking="${num}" data-carrier="${order.trackingCompanies?.[i] || ''}" data-url="${order.trackingUrls?.[i] || ''}">
                  <span>${order.trackingCompanies?.[i] || 'Carrier'}: <strong>${num}</strong></span>
                  <button class="track-btn get-tracking-status" data-tracking="${num}" data-carrier="${order.trackingCompanies?.[i] || ''}" data-url="${order.trackingUrls?.[i] || ''}">Refresh</button>
                  ${order.trackingUrls?.[i] ? `<a href="${order.trackingUrls[i]}" target="_blank" class="track-btn" style="background:#6b7280;">Track →</a>` : ''}
                </div>
                <div class="tracking-details hidden" id="tracking-details-${num.replace(/[^a-zA-Z0-9]/g, '')}"></div>
              `).join('')}
            </div>
          </div>
        ` : ''}
        ${order.shippingAddress ? `
          <div class="order-shipping">Ships to: ${order.shippingAddress.city}, ${order.shippingAddress.province}, ${order.shippingAddress.country}</div>
        ` : ''}
        ${order.note ? `
          <div class="order-note"><strong>Order Note:</strong> ${order.note}</div>
        ` : ''}
        ${order.noteAttributes && order.noteAttributes.length > 0 ? `
          <div class="order-note-attributes">
            ${order.noteAttributes.map((attr: { name: string; value: string }) => `
              <div class="order-note"><strong>${attr.name}:</strong> ${linkifyOrderIds(attr.value)}</div>
            `).join('')}
          </div>
        ` : ''}
        ${(() => {
          // Filter events that have a body (comments/notes)
          const comments = order.events?.filter((e: { body: string | null }) => e.body) || []
          if (comments.length === 0) return ''
          return `
            <details class="order-comments" open>
              <summary class="order-comments-title">Comments (${comments.length})</summary>
              <div class="comments-list">
                ${comments.map((comment: { created_at: string; message: string; body: string | null; author: string | null }) => `
                  <div class="comment-item">
                    <div class="comment-header">
                      ${comment.author ? `<span class="comment-author">${comment.author}</span>` : ''}
                      <span class="comment-date">${new Date(comment.created_at).toLocaleString()}</span>
                    </div>
                    <div class="comment-body">${linkifyOrderIds(comment.body || '')}</div>
                  </div>
                `).join('')}
              </div>
            </details>
          `
        })()}
        <details class="order-timeline">
          <summary class="order-timeline-title">Timeline ${order.events && order.events.length > 0 ? `(${order.events.length} events)` : ''}</summary>
          <div class="timeline-events">
            ${order.events && order.events.length > 0 ? order.events.slice(0, 15).map((event: { created_at: string; message: string; verb: string; body: string | null; author: string | null }) => `
              <div class="timeline-event ${event.verb === 'comment' || event.verb === 'note_added' || event.body ? 'comment' : ''} ${event.verb === 'fulfillment_success' ? 'fulfillment' : ''}">
                <div class="timeline-dot"></div>
                <div class="timeline-content">
                  <div class="timeline-message">${event.message}</div>
                  ${event.author ? `<div class="timeline-author">by ${event.author}</div>` : ''}
                  ${event.body ? `<div class="timeline-comment">${event.body}</div>` : ''}
                  <div class="timeline-date">${new Date(event.created_at).toLocaleString()}</div>
                </div>
              </div>
            `).join('') : '<div class="timeline-empty">No timeline events found. Check Supabase logs for details.</div>'}
          </div>
        </details>
        <div class="order-actions">
          <a href="${order.adminUrl}" target="_blank" class="order-link-btn">View in Shopify</a>
        </div>
      </div>
    `).join('')

    resultsEl.classList.remove('hidden')
    showToast(`Found ${filteredOrders.length} order(s)`, 'success')

    // Add tracking status button handlers AND auto-fetch tracking status
    const trackingButtons = resultsEl.querySelectorAll('.get-tracking-status')
    trackingButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement
        const trackingNumber = target.dataset.tracking
        const carrier = target.dataset.carrier
        const trackingUrl = target.dataset.url // For URL scraping fallback
        if (trackingNumber) {
          await handleGetTrackingStatus(trackingNumber, carrier || '', authData, trackingUrl)
        }
      })
    })

    // Auto-fetch tracking status for all tracking numbers
    trackingButtons.forEach(async (btn) => {
      const trackingNumber = (btn as HTMLElement).dataset.tracking
      const carrier = (btn as HTMLElement).dataset.carrier
      const trackingUrl = (btn as HTMLElement).dataset.url
      if (trackingNumber) {
        await handleGetTrackingStatus(trackingNumber, carrier || '', authData, trackingUrl)
      }
    })
  } catch (error) {
    console.error('Error searching orders:', error)
    resultsEl.innerHTML = `
      <div class="order-info-error">
        <p>Error: ${error instanceof Error ? error.message : 'Failed to search orders'}</p>
        <button id="freshdesk-ai-retry-search" class="dropdown-save-btn">Retry</button>
      </div>
    `
    resultsEl.classList.remove('hidden')

    // Add retry handler
    document.getElementById('freshdesk-ai-retry-search')?.addEventListener('click', handleSearchOrders)
  } finally {
    loadingEl.classList.add('hidden')
  }
}

// Fetch detailed tracking status (API with URL scraping fallback)
async function handleGetTrackingStatus(trackingNumber: string, carrier: string, authData: { access_token: string; user?: { id: string } }, trackingUrl?: string) {
  const detailsId = `tracking-details-${trackingNumber.replace(/[^a-zA-Z0-9]/g, '')}`
  const detailsEl = document.getElementById(detailsId)
  const btn = document.querySelector(`button[data-tracking="${trackingNumber}"]`) as HTMLButtonElement

  if (!detailsEl) return

  // Show loading state
  btn.disabled = true
  btn.textContent = 'Loading...'
  detailsEl.classList.remove('hidden')
  detailsEl.innerHTML = '<div class="tracking-loading">Fetching tracking status...</div>'

  try {
    const response = await fetch('https://iyeqiwixenjiakeisdae.supabase.co/functions/v1/track-package', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authData.access_token}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5ZXFpd2l4ZW5qaWFrZWlzZGFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMjQ0ODMsImV4cCI6MjA4MzgwMDQ4M30.1IFITfO7xh-cXCYarz4pJTqwMCpBSHgHaK6yxbzT3rc',
      },
      body: JSON.stringify({
        businessId: authData.user?.id,
        trackingNumber,
        carrier: carrier || undefined,
        trackingUrl: trackingUrl || undefined, // For URL scraping fallback
      }),
    })

    const data = await response.json()

    if (!data.success) {
      detailsEl.innerHTML = `
        <div class="tracking-error">
          <p>${data.error || 'Could not fetch tracking status'}</p>
        </div>
      `
      return
    }

    // Render tracking details
    detailsEl.innerHTML = `
      <div class="tracking-details-content">
        <div class="tracking-details-header">
          <span class="tracking-status-badge ${data.status}">${data.statusDescription}</span>
          ${data.carrier ? `<span class="tracking-carrier">${data.carrier}</span>` : ''}
          ${data.source === 'scraped' ? `<span class="tracking-source-badge">via URL</span>` : ''}
        </div>
        ${data.estimatedDelivery ? `
          <div class="tracking-eta">
            <strong>Est. Delivery:</strong> ${new Date(data.estimatedDelivery).toLocaleDateString()}
          </div>
        ` : ''}
        ${data.lastUpdate ? `
          <div class="tracking-last-update">
            <strong>Last Update:</strong> ${new Date(data.lastUpdate).toLocaleString()}
          </div>
        ` : ''}
        ${data.events && data.events.length > 0 ? `
          <details class="tracking-events-details" open>
            <summary>Tracking History (${data.events.length} events)</summary>
            <div class="tracking-events-list">
              ${data.events.slice(0, 10).map((event: { time: string; location: string; description: string }) => `
                <div class="tracking-event-item">
                  <div class="tracking-event-time">${event.time ? new Date(event.time).toLocaleString() : ''}</div>
                  <div class="tracking-event-desc">${event.description}</div>
                  ${event.location ? `<div class="tracking-event-location">${event.location}</div>` : ''}
                </div>
              `).join('')}
            </div>
          </details>
        ` : '<p class="tracking-no-events">No tracking events available yet</p>'}
      </div>
    `

    btn.textContent = 'Refresh'
  } catch (error) {
    console.error('Error fetching tracking:', error)
    detailsEl.innerHTML = `
      <div class="tracking-error">
        <p>Error: ${error instanceof Error ? error.message : 'Failed to fetch tracking'}</p>
      </div>
    `
  } finally {
    btn.disabled = false
  }
}

/**
 * Convert order IDs in text to clickable links
 * Supports:
 * - eBay: XX-XXXXX-XXXXX (e.g., 04-14081-51237, 25-14090-96590)
 * - AliExpress: Long numeric IDs (e.g., 8207323845276674)
 */
function linkifyOrderIds(text: string): string {
  // Pattern for eBay order IDs: 2 digits - 5 digits - 5 digits
  const ebayPattern = /(\d{2}-\d{4,5}-\d{4,5})/g

  // Pattern for AliExpress order IDs: 16+ digit numbers (typically 16-20 digits)
  const aliexpressPattern = /\b(\d{16,20})\b/g

  // First, replace eBay order IDs
  let result = text.replace(ebayPattern, (match) => {
    const ebayUrl = `https://www.ebay.com/mye/myebay/purchase?page=1&q=${match}&mp=purchase-search-module-v2&type=v2&pg=purchase`
    return `<a href="${ebayUrl}" target="_blank" class="ebay-order-link">${match}</a>`
  })

  // Then, replace AliExpress order IDs (if not already inside a link)
  result = result.replace(aliexpressPattern, (match, _group, offset, string) => {
    // Check if this number is already inside an anchor tag (already linked)
    const before = string.substring(Math.max(0, offset - 50), offset)
    if (before.includes('<a ') && !before.includes('</a>')) {
      return match // Already inside a link, don't double-link
    }
    const aliexpressUrl = `https://www.aliexpress.com/p/order/detail.html?orderId=${match}`
    return `<a href="${aliexpressUrl}" target="_blank" class="aliexpress-order-link">${match}</a>`
  })

  return result
}

/**
 * Handle generating ticket summary
 */
async function handleGenerateSummary() {
  const summaryContent = document.getElementById('summary-content')
  const loadingEl = summaryContent?.querySelector('.summary-loading')
  const emptyEl = summaryContent?.querySelector('.summary-empty')
  const resultEl = summaryContent?.querySelector('.summary-result')

  if (!summaryContent || !loadingEl || !emptyEl || !resultEl) return

  // Show loading state
  emptyEl.classList.add('hidden')
  resultEl.classList.add('hidden')
  loadingEl.classList.remove('hidden')

  try {
    // Get auth data
    let authData: { access_token?: string; user?: { id: string } } | null = null
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const sessionData = await chrome.storage.local.get(['sb-iyeqiwixenjiakeisdae-auth-token'])
        authData = sessionData['sb-iyeqiwixenjiakeisdae-auth-token']
        if (typeof authData === 'string') {
          authData = JSON.parse(authData)
        }
      }
    } catch (e) {
      throw new Error('Could not access extension storage')
    }

    if (!authData?.access_token) {
      throw new Error('Please log in via the extension popup first')
    }

    // Get the conversation from the page
    const conversation = getFullConversation() || getLatestCustomerMessage() || ''
    if (!conversation) {
      throw new Error('Could not find ticket conversation')
    }

    // Get ticket ID for context
    const ticketId = getTicketId()

    // Call the summarize-ticket function
    const response = await fetch('https://iyeqiwixenjiakeisdae.supabase.co/functions/v1/summarize-ticket', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authData.access_token}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5ZXFpd2l4ZW5qaWFrZWlzZGFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMjQ0ODMsImV4cCI6MjA4MzgwMDQ4M30.1IFITfO7xh-cXCYarz4pJTqwMCpBSHgHaK6yxbzT3rc',
      },
      body: JSON.stringify({
        businessId: authData.user?.id,
        conversation,
        ticketId,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to generate summary')
    }

    const data = await response.json()

    // Display the summary
    resultEl.innerHTML = `
      <div class="summary-card">
        <div class="summary-header">
          <span class="summary-title">📋 Ticket Summary</span>
          ${ticketId ? `<span class="summary-ticket">#${ticketId}</span>` : ''}
        </div>
        <div class="summary-body">${data.summary.replace(/\n/g, '<br>')}</div>
        ${data.keyPoints && data.keyPoints.length > 0 ? `
          <div class="summary-key-points">
            <strong>Key Points:</strong>
            <ul>
              ${data.keyPoints.map((point: string) => `<li>${point}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        ${data.sentiment ? `
          <div class="summary-sentiment">
            <strong>Customer Sentiment:</strong>
            <span class="sentiment-badge ${data.sentiment}">${data.sentiment}</span>
          </div>
        ` : ''}
        ${data.actionNeeded ? `
          <div class="summary-action">
            <strong>Action Needed:</strong> ${data.actionNeeded}
          </div>
        ` : ''}
      </div>
      <button id="freshdesk-ai-refresh-summary" class="dropdown-save-btn" style="margin-top: 10px;">🔄 Refresh Summary</button>
    `
    resultEl.classList.remove('hidden')

    // Add refresh button handler
    document.getElementById('freshdesk-ai-refresh-summary')?.addEventListener('click', handleGenerateSummary)

    showToast('Summary generated!', 'success')
  } catch (error) {
    console.error('Error generating summary:', error)
    resultEl.innerHTML = `
      <div class="summary-error">
        <p>Error: ${error instanceof Error ? error.message : 'Failed to generate summary'}</p>
        <button id="freshdesk-ai-retry-summary" class="dropdown-save-btn">Retry</button>
      </div>
    `
    resultEl.classList.remove('hidden')

    document.getElementById('freshdesk-ai-retry-summary')?.addEventListener('click', handleGenerateSummary)
  } finally {
    loadingEl.classList.add('hidden')
  }
}

function showToast(message: string, type: 'success' | 'error') {
  const existingToast = document.querySelector('.freshdesk-ai-toast')
  if (existingToast) existingToast.remove()

  const toast = document.createElement('div')
  toast.className = `freshdesk-ai-toast ${type}`
  toast.textContent = message
  document.body.appendChild(toast)

  setTimeout(() => toast.remove(), 3000)
}

function removeButton() {
  inlineButtons.forEach(btn => btn.remove())
  inlineButtons = []
  if (panelContainer) {
    panelContainer.remove()
    panelContainer = null
  }
}

/**
 * Inject a summary button above the Freshdesk TIMELINE widget in the sidebar
 */
// Track retry attempts for sidebar injection
let sidebarInjectionAttempts = 0
const MAX_SIDEBAR_INJECTION_ATTEMPTS = 10

function injectSidebarSummaryButton() {
  // Don't inject if already present
  if (document.getElementById('freshdesk-ai-sidebar-summary-btn')) {
    return
  }

  console.log('Freshdesk AI: Looking for sidebar widgets... (attempt ' + (sidebarInjectionAttempts + 1) + ')')

  // Helper to create the summary widget
  const createSummaryWidget = (): HTMLElement => {
    const summaryContainer = document.createElement('div')
    summaryContainer.id = 'freshdesk-ai-sidebar-summary-btn'
    summaryContainer.className = 'freshdesk-ai-sidebar-widget'
    summaryContainer.innerHTML = `
      <div class="sidebar-summary-header">
        <span>✨ AI SUMMARY</span>
      </div>
      <div class="sidebar-summary-content">
        <button class="sidebar-summary-generate-btn">Generate Summary</button>
        <div class="sidebar-summary-result hidden"></div>
      </div>
    `
    return summaryContainer
  }

  // Strategy 1: Look for the right sidebar container (Freshdesk uses specific class patterns)
  // The sidebar typically has classes like "ticket-details-sidebar", "right-container", etc.
  const sidebarSelectors = [
    '.ticket-details-sidebar',
    '.right-container',
    '[class*="sidebar"][class*="right"]',
    '[class*="ticket-sidebar"]',
    '.ticket-properties',
    '[data-testid*="sidebar"]',
    // MFE containers
    '[class*="mfe__container"]',
  ]

  for (const selector of sidebarSelectors) {
    const sidebar = document.querySelector(selector)
    if (sidebar) {
      console.log('Freshdesk AI: Found sidebar with selector:', selector)

      // Look for accordion/collapsible sections inside
      const accordionHeaders = sidebar.querySelectorAll('[class*="accordion"], [class*="collapsible"], [class*="expandable"], details > summary, [role="button"]')

      for (const header of accordionHeaders) {
        const headerText = header.textContent?.trim().toUpperCase()
        if (headerText?.includes('TIMELINE') || headerText?.includes('ACTIVITY')) {
          console.log('Freshdesk AI: Found TIMELINE accordion header')
          const container = header.closest('details, [class*="accordion"], [class*="section"]') || header.parentElement
          if (container) {
            const summaryWidget = createSummaryWidget()
            container.parentElement?.insertBefore(summaryWidget, container)
            attachSidebarSummaryHandler(summaryWidget)
            console.log('Freshdesk AI: Injected sidebar summary button')
            return
          }
        }
      }
    }
  }

  // Strategy 2: Search all elements for TIMELINE text (case-insensitive)
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null)
  let textNode: Text | null

  while ((textNode = walker.nextNode() as Text | null)) {
    const text = textNode.textContent?.trim().toUpperCase()
    if (text === 'TIMELINE' || text === 'ACTIVITY LOG' || text === 'TICKET ACTIVITY') {
      const parent = textNode.parentElement
      if (parent) {
        console.log('Freshdesk AI: Found TIMELINE text in:', parent.tagName, parent.className)

        // Go up to find a suitable container (accordion section, details, div with class)
        let container: HTMLElement | null = parent
        for (let i = 0; i < 5 && container; i++) {
          const classes = container.className || ''
          if (classes.includes('accordion') || classes.includes('section') ||
              classes.includes('widget') || classes.includes('collapsible') ||
              container.tagName === 'DETAILS') {
            console.log('Freshdesk AI: Found widget container:', container.tagName, container.className)
            const summaryWidget = createSummaryWidget()
            container.parentElement?.insertBefore(summaryWidget, container)
            attachSidebarSummaryHandler(summaryWidget)
            console.log('Freshdesk AI: Injected sidebar summary button')
            return
          }
          container = container.parentElement
        }

        // Fallback: just insert before the parent's parent
        if (parent.parentElement?.parentElement) {
          const summaryWidget = createSummaryWidget()
          parent.parentElement.parentElement.insertBefore(summaryWidget, parent.parentElement)
          attachSidebarSummaryHandler(summaryWidget)
          console.log('Freshdesk AI: Injected sidebar summary button (fallback)')
          return
        }
      }
    }
  }

  // Strategy 3: Look for PROPERTIES section (another common sidebar section)
  const propsSection = document.querySelector('[class*="properties"], [class*="ticket-fields"]')
  if (propsSection) {
    console.log('Freshdesk AI: Found PROPERTIES section, inserting after it')
    const summaryWidget = createSummaryWidget()
    propsSection.parentElement?.insertBefore(summaryWidget, propsSection.nextSibling)
    attachSidebarSummaryHandler(summaryWidget)
    return
  }

  // If not found, retry with delay (MFE components load asynchronously)
  sidebarInjectionAttempts++
  if (sidebarInjectionAttempts < MAX_SIDEBAR_INJECTION_ATTEMPTS) {
    console.log('Freshdesk AI: Sidebar not ready, retrying in 1s...')
    setTimeout(injectSidebarSummaryButton, 1000)
  } else {
    console.log('Freshdesk AI: Could not find sidebar after ' + MAX_SIDEBAR_INJECTION_ATTEMPTS + ' attempts')
  }
}

/**
 * Attach click handler to sidebar summary button
 */
function attachSidebarSummaryHandler(container: HTMLElement) {
  const generateBtn = container.querySelector('.sidebar-summary-generate-btn')
  const resultDiv = container.querySelector('.sidebar-summary-result')

  generateBtn?.addEventListener('click', async () => {
    if (!resultDiv || !generateBtn) return

    (generateBtn as HTMLButtonElement).disabled = true
    generateBtn.textContent = 'Generating...'
    resultDiv.classList.add('hidden')

    try {
      // Get auth data
      let authData: { access_token?: string; user?: { id: string } } | null = null
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const sessionData = await chrome.storage.local.get(['sb-iyeqiwixenjiakeisdae-auth-token'])
        authData = sessionData['sb-iyeqiwixenjiakeisdae-auth-token']
        if (typeof authData === 'string') {
          authData = JSON.parse(authData)
        }
      }

      if (!authData?.access_token) {
        throw new Error('Please log in via the extension popup first')
      }

      // Get conversation
      const conversation = getFullConversation() || getLatestCustomerMessage() || ''
      if (!conversation) {
        throw new Error('Could not find ticket conversation')
      }

      const ticketId = getTicketId()

      // Call summarize API
      const response = await fetch('https://iyeqiwixenjiakeisdae.supabase.co/functions/v1/summarize-ticket', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authData.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5ZXFpd2l4ZW5qaWFrZWlzZGFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMjQ0ODMsImV4cCI6MjA4MzgwMDQ4M30.1IFITfO7xh-cXCYarz4pJTqwMCpBSHgHaK6yxbzT3rc',
        },
        body: JSON.stringify({
          businessId: authData.user?.id,
          conversation,
          ticketId,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate summary')
      }

      const data = await response.json()

      resultDiv.innerHTML = `
        <div class="sidebar-summary-card">
          <p class="sidebar-summary-text">${data.summary}</p>
          ${data.sentiment ? `<span class="sentiment-badge ${data.sentiment}">${data.sentiment}</span>` : ''}
          ${data.actionNeeded ? `<p class="sidebar-action"><strong>Action:</strong> ${data.actionNeeded}</p>` : ''}
        </div>
      `
      resultDiv.classList.remove('hidden')
      showToast('Summary generated!', 'success')
    } catch (error) {
      resultDiv.innerHTML = `<p class="sidebar-summary-error">${error instanceof Error ? error.message : 'Error'}</p>`
      resultDiv.classList.remove('hidden')
    } finally {
      (generateBtn as HTMLButtonElement).disabled = false
      generateBtn.textContent = 'Refresh Summary'
    }
  })
}

// Initialize
function init() {
  console.log('Freshdesk AI Assistant content script loaded')

  if (isOnTicketPage()) {
    // Delay injection to let Freshdesk UI load
    setTimeout(() => {
      injectInlineButton()
      // Also try to inject sidebar summary button
      setTimeout(() => injectSidebarSummaryButton(), 500)
    }, 1000)
  }

  // Watch for URL changes (Freshdesk is a SPA)
  let lastUrl = window.location.href
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href
      console.log('URL changed:', lastUrl)

      if (isOnTicketPage()) {
        // Reset sidebar injection attempts for new ticket
        sidebarInjectionAttempts = 0

        setTimeout(() => {
          injectInlineButton()
          // Also try to inject sidebar summary button on new ticket
          setTimeout(() => injectSidebarSummaryButton(), 500)
        }, 1000)
      } else {
        removeFloatingButton()
        removeButton()
      }
    }
  })

  observer.observe(document.body, { childList: true, subtree: true })
}

// Run initialization
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
