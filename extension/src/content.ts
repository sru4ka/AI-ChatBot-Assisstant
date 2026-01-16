/**
 * Content script for Freshdesk AI Assistant
 * Injected into Freshdesk pages to read ticket content and insert replies
 */

import {
  isOnTicketPage,
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
    })
  })

  // Search orders button
  searchOrdersBtn?.addEventListener('click', handleSearchOrders)

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

  // Regenerate button
  regenerateBtn?.addEventListener('click', async () => {
    const oneTimeInstructions = regenInput?.value || ''
    await handleGenerateReply(oneTimeInstructions)
    if (regenInput) regenInput.value = '' // Clear after use
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

async function handleGenerateReply(oneTimeInstructions = '') {
  if (isGenerating) return

  const resultPanel = document.getElementById('freshdesk-ai-result-panel')
  const content = document.getElementById('freshdesk-ai-content')
  const copyBtn = document.getElementById('freshdesk-ai-copy') as HTMLButtonElement
  const insertBtn = document.getElementById('freshdesk-ai-insert') as HTMLButtonElement
  const regenerateBtn = document.getElementById('freshdesk-ai-regenerate') as HTMLButtonElement
  const mainBtns = document.querySelectorAll('.freshdesk-ai-main-btn')

  if (!resultPanel || !content || !panelContainer) return

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
    if (!currentConversation || !oneTimeInstructions) {
      currentConversation = getFullConversation() || ''
      if (!currentConversation) {
        currentConversation = getLatestCustomerMessage() || ''
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
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to generate reply')
    }

    const data = await response.json()
    generatedReply = data.reply + (signature ? `\n\n${signature}` : '')

    // Show the reply
    content.innerHTML = `<div class="panel-reply">${generatedReply.replace(/\n/g, '<br>')}</div>`

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

  const success = insertReply(generatedReply)
  if (success) {
    showToast('Reply inserted! Learning...', 'success')
    const resultPanel = document.getElementById('freshdesk-ai-result-panel')
    resultPanel?.classList.add('hidden')
    panelContainer?.classList.add('hidden')

    // Auto-learn: Save this Q&A pair to knowledge base
    try {
      await saveToKnowledgeBase(currentConversation, generatedReply)
      console.log('Freshdesk AI: Saved reply to knowledge base')
    } catch (err) {
      console.error('Freshdesk AI: Failed to save to knowledge base:', err)
      // Don't show error toast - learning is a background task
    }
  } else {
    // Fallback: copy to clipboard
    navigator.clipboard.writeText(generatedReply).then(() => {
      showToast('Copied to clipboard - paste manually', 'success')
    }).catch(() => {
      showToast('Could not insert - please copy manually', 'error')
    })
  }
}

// Save Q&A pair to knowledge base for learning
async function saveToKnowledgeBase(question: string, answer: string) {
  // Get auth session with safety check
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    console.warn('Chrome storage not available for learning')
    return
  }

  const sessionData = await chrome.storage.local.get(['sb-iyeqiwixenjiakeisdae-auth-token'])
  let authData = sessionData['sb-iyeqiwixenjiakeisdae-auth-token']

  if (typeof authData === 'string') {
    try {
      authData = JSON.parse(authData)
    } catch (e) {
      return
    }
  }

  if (!authData?.access_token) return

  // Call the learn-reply endpoint
  await fetch('https://iyeqiwixenjiakeisdae.supabase.co/functions/v1/learn-reply', {
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
    }),
  })
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
  const bodyHtml = document.body.innerHTML || ''

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

    // Build search queries in priority order: order number > name > email > phone
    const searchQueries: string[] = []

    if (customerInfo.orderNumber) {
      searchQueries.push(`#${customerInfo.orderNumber}`)
    }
    if (customerInfo.name) {
      searchQueries.push(customerInfo.name)
    }
    if (customerInfo.email) {
      searchQueries.push(customerInfo.email)
    }
    if (customerInfo.phone) {
      searchQueries.push(customerInfo.phone)
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

    // Try each search query until we find results
    let data: { found: boolean; orders: unknown[] } | null = null
    let usedQuery = ''

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
        usedQuery = query
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

    // Render orders
    resultsEl.innerHTML = data.orders.map((order: {
      name: string
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
    }) => `
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
                <div class="tracking-number-row" data-tracking="${num}" data-carrier="${order.trackingCompanies?.[i] || ''}">
                  <span>${order.trackingCompanies?.[i] || 'Carrier'}: <strong>${num}</strong></span>
                  <button class="track-btn get-tracking-status" data-tracking="${num}" data-carrier="${order.trackingCompanies?.[i] || ''}">Refresh</button>
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
              <div class="order-note"><strong>${attr.name}:</strong> ${attr.value}</div>
            `).join('')}
          </div>
        ` : ''}
        <details class="order-timeline" open>
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
    showToast(`Found ${data.orders.length} order(s)`, 'success')

    // Add tracking status button handlers AND auto-fetch tracking status
    const trackingButtons = resultsEl.querySelectorAll('.get-tracking-status')
    trackingButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement
        const trackingNumber = target.dataset.tracking
        const carrier = target.dataset.carrier
        if (trackingNumber) {
          await handleGetTrackingStatus(trackingNumber, carrier || '', authData)
        }
      })
    })

    // Auto-fetch tracking status for all tracking numbers
    trackingButtons.forEach(async (btn) => {
      const trackingNumber = (btn as HTMLElement).dataset.tracking
      const carrier = (btn as HTMLElement).dataset.carrier
      if (trackingNumber) {
        await handleGetTrackingStatus(trackingNumber, carrier || '', authData)
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

// Fetch detailed tracking status from TrackingMore
async function handleGetTrackingStatus(trackingNumber: string, carrier: string, authData: { access_token: string; user?: { id: string } }) {
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

// Initialize
function init() {
  console.log('Freshdesk AI Assistant content script loaded')

  if (isOnTicketPage()) {
    // Delay injection to let Freshdesk UI load
    setTimeout(() => {
      injectInlineButton()
    }, 1000)
  }

  // Watch for URL changes (Freshdesk is a SPA)
  let lastUrl = window.location.href
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href
      console.log('URL changed:', lastUrl)

      if (isOnTicketPage()) {
        setTimeout(() => {
          injectInlineButton()
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
