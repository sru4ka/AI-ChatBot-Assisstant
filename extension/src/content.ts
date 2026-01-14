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

// Create button element with unique ID
function createButtonElement(id: string): HTMLElement {
  const btn = document.createElement('div')
  btn.id = id
  btn.className = 'freshdesk-ai-inline-wrapper'
  btn.innerHTML = `
    <button class="freshdesk-ai-inline-btn freshdesk-ai-main-btn">
      <span class="ai-icon">✨</span>
      <span>Reply with AI</span>
    </button>
    <button class="freshdesk-ai-inline-dropdown freshdesk-ai-dropdown-toggle">
      <span>▼</span>
    </button>
  `
  return btn
}

// Find all Forward buttons on the page (there may be multiple action bars)
function findAllForwardButtons(): Element[] {
  const forwardButtons: Element[] = []

  // Selectors for Forward button - Freshdesk specific
  const forwardSelectors = [
    'a[title="Forward"]',
    'button[title="Forward"]',
    'a[data-action="forward"]',
    '[data-aid="forward"]',
    '[data-test-id="forward"]',
    // Freshdesk uses spans with specific classes inside links
    'a.action-button:has(span)',
  ]

  for (const selector of forwardSelectors) {
    try {
      const buttons = document.querySelectorAll(selector)
      buttons.forEach(btn => {
        if (!forwardButtons.includes(btn)) {
          forwardButtons.push(btn)
        }
      })
    } catch (e) {
      // Invalid selector, continue
    }
  }

  // Find by text content - look for "Forward" text
  const allLinks = document.querySelectorAll('a, button, [role="button"]')
  for (const el of allLinks) {
    const text = el.textContent?.trim()
    const title = (el as HTMLElement).title
    if (text === 'Forward' || title === 'Forward') {
      if (!forwardButtons.includes(el)) {
        forwardButtons.push(el)
      }
    }
  }

  // Find action bars and look for Forward inside them
  const actionBars = document.querySelectorAll('[class*="action"], [class*="toolbar"], [class*="btn-group"]')
  actionBars.forEach(bar => {
    const links = bar.querySelectorAll('a, button')
    links.forEach(link => {
      if (link.textContent?.includes('Forward') || (link as HTMLElement).title === 'Forward') {
        if (!forwardButtons.includes(link)) {
          forwardButtons.push(link)
        }
      }
    })
  })

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
    // Try parent, grandparent, or great-grandparent for proper insertion point
    let insertTarget = forwardBtn.parentElement
    let insertAfter: Element = forwardBtn

    // If parent is very small (like just containing the button), go up
    if (insertTarget && insertTarget.children.length === 1) {
      insertAfter = insertTarget
      insertTarget = insertTarget.parentElement
    }

    if (insertTarget) {
      // Check if we already added a button here
      if (insertTarget.querySelector('.freshdesk-ai-inline-wrapper')) {
        return
      }

      const btn = createButtonElement(`freshdesk-ai-inline-btn-${index}`)

      // Insert after the Forward button (or its container)
      if (insertAfter.nextSibling) {
        insertTarget.insertBefore(btn, insertAfter.nextSibling)
      } else {
        insertTarget.appendChild(btn)
      }

      inlineButtons.push(btn)
      injectedCount++
      console.log(`Freshdesk AI: Injected button ${index} next to Forward`)
    }
  })

  // If no Forward buttons found, try action bar selectors
  if (injectedCount === 0) {
    const actionBarSelectors = [
      '.reply-actions',
      '.ticket-actions',
      '.action-buttons',
      '[class*="reply-action"]',
      '[class*="ticket-action"]',
      '.conversation-actions',
    ]

    for (const selector of actionBarSelectors) {
      try {
        const bars = document.querySelectorAll(selector)
        bars.forEach((bar, index) => {
          if (!bar.querySelector('.freshdesk-ai-inline-wrapper')) {
            const btn = createButtonElement(`freshdesk-ai-inline-btn-bar-${index}`)
            bar.appendChild(btn)
            inlineButtons.push(btn)
            injectedCount++
          }
        })
        if (injectedCount > 0) break
      } catch (e) {
        // Continue
      }
    }
  }

  // Fallback: floating button if no injection points found
  if (injectedCount === 0) {
    const btn = createButtonElement('freshdesk-ai-inline-btn-floating')
    btn.classList.add('freshdesk-ai-floating')
    document.body.appendChild(btn)
    inlineButtons.push(btn)
    console.log('Freshdesk AI: Button added as floating (fallback)')
  } else {
    console.log(`Freshdesk AI: Injected ${injectedCount} buttons`)
  }

  // Create panel container (always floating, shared by all buttons)
  createPanel()

  // Load settings
  loadButtonSettings()

  // Add event listeners to all buttons
  setupEventListeners()
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
    <div id="freshdesk-ai-result-panel" class="freshdesk-ai-result-panel hidden">
      <div class="panel-header">
        <span>AI Generated Reply</span>
        <button id="freshdesk-ai-close" class="panel-close">&times;</button>
      </div>
      <div id="freshdesk-ai-content" class="panel-content">
        <div class="panel-loading"><span class="spinner"></span> Analyzing ticket...</div>
      </div>
      <div class="panel-actions">
        <button id="freshdesk-ai-copy" class="panel-btn panel-btn-secondary" disabled>Copy</button>
        <button id="freshdesk-ai-insert" class="panel-btn panel-btn-primary" disabled>Insert Reply</button>
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

  // Insert button
  insertBtn?.addEventListener('click', handleInsertGeneratedReply)

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

async function handleGenerateReply() {
  if (isGenerating) return

  const resultPanel = document.getElementById('freshdesk-ai-result-panel')
  const content = document.getElementById('freshdesk-ai-content')
  const copyBtn = document.getElementById('freshdesk-ai-copy') as HTMLButtonElement
  const insertBtn = document.getElementById('freshdesk-ai-insert') as HTMLButtonElement
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

  try {
    // Auto-scan: Get full conversation chain (or fall back to latest message)
    let customerMessage = getFullConversation()
    if (!customerMessage) {
      customerMessage = getLatestCustomerMessage()
    }
    if (!customerMessage) {
      throw new Error('Could not find customer message on this page')
    }

    // Get signature from settings
    const settings = await chrome.storage.local.get(['freshdeskAiSettings'])
    const signature = settings.freshdeskAiSettings?.signature || ''

    // Get auth session - Supabase stores as JSON string, need to parse
    const sessionData = await chrome.storage.local.get(['sb-iyeqiwixenjiakeisdae-auth-token'])
    let authData = sessionData['sb-iyeqiwixenjiakeisdae-auth-token']

    // Parse if it's a string (Supabase stores session as JSON string)
    if (typeof authData === 'string') {
      try {
        authData = JSON.parse(authData)
      } catch (e) {
        console.error('Failed to parse auth data:', e)
        authData = null
      }
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
        customerMessage,
        tone: currentTone,
        customPrompt: currentCustomPrompt || undefined,
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

    showToast('Reply generated!', 'success')
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

function handleInsertGeneratedReply() {
  if (!generatedReply) return

  const success = insertReply(generatedReply)
  if (success) {
    showToast('Reply inserted!', 'success')
    const resultPanel = document.getElementById('freshdesk-ai-result-panel')
    resultPanel?.classList.add('hidden')
    panelContainer?.classList.add('hidden')
  } else {
    // Fallback: copy to clipboard
    navigator.clipboard.writeText(generatedReply).then(() => {
      showToast('Copied to clipboard - paste manually', 'success')
    }).catch(() => {
      showToast('Could not insert - please copy manually', 'error')
    })
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
