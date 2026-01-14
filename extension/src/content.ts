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
let inlineButton: HTMLElement | null = null
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

// Find the Freshdesk action button area and inject our button
function injectInlineButton() {
  // Remove existing button if any
  if (inlineButton) {
    inlineButton.remove()
    inlineButton = null
  }

  // Selectors for Freshdesk action button areas
  const actionBarSelectors = [
    '.reply-actions',
    '.ticket-actions',
    '.action-buttons',
    '[class*="reply-action"]',
    '[class*="ticket-action"]',
    '.conversation-actions',
    '.btn-group',
    // Look for the Forward button's parent
    'button[title="Forward"]',
    'a[title="Forward"]',
    '[data-action="forward"]',
    'button:contains("Forward")',
  ]

  let actionBar: Element | null = null
  let forwardButton: Element | null = null

  // First try to find the Forward button specifically
  const forwardSelectors = [
    'button[title="Forward"]',
    'a[title="Forward"]',
    '[data-action="forward"]',
    'button[data-testid="forward"]',
  ]

  for (const selector of forwardSelectors) {
    try {
      forwardButton = document.querySelector(selector)
      if (forwardButton) {
        actionBar = forwardButton.parentElement
        break
      }
    } catch (e) {
      // Invalid selector, continue
    }
  }

  // If we didn't find Forward button, look for action bar
  if (!actionBar) {
    for (const selector of actionBarSelectors) {
      try {
        const el = document.querySelector(selector)
        if (el) {
          actionBar = el
          break
        }
      } catch (e) {
        // Invalid selector, continue
      }
    }
  }

  // Also try finding by text content
  if (!forwardButton) {
    const allButtons = document.querySelectorAll('button, a[role="button"], .btn')
    for (const btn of allButtons) {
      if (btn.textContent?.toLowerCase().includes('forward')) {
        forwardButton = btn
        actionBar = btn.parentElement
        break
      }
    }
  }

  // Create inline button
  inlineButton = document.createElement('div')
  inlineButton.id = 'freshdesk-ai-inline-btn'
  inlineButton.className = 'freshdesk-ai-inline-wrapper'
  inlineButton.innerHTML = `
    <button class="freshdesk-ai-inline-btn" id="freshdesk-ai-main-btn">
      <span class="ai-icon">✨</span>
      <span>Reply with AI</span>
    </button>
    <button class="freshdesk-ai-inline-dropdown" id="freshdesk-ai-dropdown-toggle">
      <span>▼</span>
    </button>
  `

  // Insert button - either next to Forward or as floating fallback
  if (forwardButton && forwardButton.parentElement) {
    // Insert after Forward button
    forwardButton.parentElement.insertBefore(inlineButton, forwardButton.nextSibling)
    console.log('Freshdesk AI: Button injected next to Forward')
  } else if (actionBar) {
    // Append to action bar
    actionBar.appendChild(inlineButton)
    console.log('Freshdesk AI: Button injected into action bar')
  } else {
    // Fallback: floating button
    inlineButton.classList.add('freshdesk-ai-floating')
    document.body.appendChild(inlineButton)
    console.log('Freshdesk AI: Button added as floating (fallback)')
  }

  // Create panel container (always floating)
  createPanel()

  // Load settings
  loadButtonSettings()

  // Add event listeners
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
  const mainBtn = document.getElementById('freshdesk-ai-main-btn')
  const dropdownToggle = document.getElementById('freshdesk-ai-dropdown-toggle')
  const dropdownMenu = document.getElementById('freshdesk-ai-dropdown-menu')
  const resultPanel = document.getElementById('freshdesk-ai-result-panel')
  const closeBtn = document.getElementById('freshdesk-ai-close')
  const copyBtn = document.getElementById('freshdesk-ai-copy')
  const insertBtn = document.getElementById('freshdesk-ai-insert')
  const saveSettingsBtn = document.getElementById('freshdesk-ai-save-settings')
  const customPromptInput = document.getElementById('freshdesk-ai-custom-prompt') as HTMLTextAreaElement

  // Main button - auto scan and generate
  mainBtn?.addEventListener('click', async (e) => {
    e.preventDefault()
    e.stopPropagation()
    dropdownMenu?.classList.add('hidden')
    await handleGenerateReply()
  })

  // Dropdown toggle
  dropdownToggle?.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    resultPanel?.classList.add('hidden')
    dropdownMenu?.classList.toggle('hidden')
    panelContainer?.classList.toggle('hidden', dropdownMenu?.classList.contains('hidden') ?? true)
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
    if (!inlineButton?.contains(target) && !panelContainer?.contains(target)) {
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
  const mainBtn = document.getElementById('freshdesk-ai-main-btn')

  if (!resultPanel || !content || !panelContainer) return

  // Show panel and loading state
  panelContainer.classList.remove('hidden')
  resultPanel.classList.remove('hidden')
  isGenerating = true

  if (mainBtn) {
    mainBtn.innerHTML = '<span class="ai-icon">⏳</span><span>Generating...</span>'
  }
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
    if (mainBtn) {
      mainBtn.innerHTML = '<span class="ai-icon">✨</span><span>Reply with AI</span>'
    }
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
  if (inlineButton) {
    inlineButton.remove()
    inlineButton = null
  }
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
