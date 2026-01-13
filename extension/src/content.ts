/**
 * Content script for Freshdesk AI Assistant
 * Injected into Freshdesk pages to read ticket content and insert replies
 */

import {
  isOnTicketPage,
  getLatestCustomerMessage,
  getTicketSubject,
  insertReply,
  removeFloatingButton,
} from './utils/freshdesk'

// Message types
interface Message {
  type: string
  payload?: unknown
}

// State for the floating button
let floatingContainer: HTMLElement | null = null
let isGenerating = false

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  console.log('Content script received message:', message.type)

  switch (message.type) {
    case 'PING':
      // Simple ping to check if content script is loaded
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

// Current settings for the floating button
let currentTone: 'professional' | 'friendly' | 'concise' = 'professional'
let currentCustomPrompt = ''

// Create the floating "Reply with AI" button
function createReplyWithAIButton() {
  // Remove existing container if any
  if (floatingContainer) {
    floatingContainer.remove()
  }

  floatingContainer = document.createElement('div')
  floatingContainer.id = 'freshdesk-ai-reply-container'
  floatingContainer.innerHTML = `
    <div class="freshdesk-ai-btn-group">
      <button id="freshdesk-ai-reply-btn" class="freshdesk-ai-floating-btn freshdesk-ai-main-btn">
        <span class="btn-icon">✨</span>
        <span class="btn-text">Reply with AI</span>
      </button>
      <button id="freshdesk-ai-dropdown-btn" class="freshdesk-ai-dropdown-toggle">
        <span>▼</span>
      </button>
    </div>
    <div id="freshdesk-ai-dropdown" class="freshdesk-ai-dropdown hidden">
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
    <div id="freshdesk-ai-panel" class="freshdesk-ai-panel hidden">
      <div class="panel-header">
        <span>AI Generated Reply</span>
        <button id="freshdesk-ai-close" class="panel-close">&times;</button>
      </div>
      <div id="freshdesk-ai-content" class="panel-content">
        <div class="panel-placeholder">Click "Reply with AI" to generate a response</div>
      </div>
      <div class="panel-actions">
        <button id="freshdesk-ai-copy" class="panel-btn panel-btn-secondary" disabled>Copy</button>
        <button id="freshdesk-ai-insert" class="panel-btn panel-btn-primary" disabled>Insert Reply</button>
      </div>
    </div>
  `

  document.body.appendChild(floatingContainer)

  // Load saved settings
  loadButtonSettings()

  // Add event listeners
  const replyBtn = document.getElementById('freshdesk-ai-reply-btn')
  const dropdownBtn = document.getElementById('freshdesk-ai-dropdown-btn')
  const dropdown = document.getElementById('freshdesk-ai-dropdown')
  const closeBtn = document.getElementById('freshdesk-ai-close')
  const copyBtn = document.getElementById('freshdesk-ai-copy')
  const insertBtn = document.getElementById('freshdesk-ai-insert')
  const panel = document.getElementById('freshdesk-ai-panel')
  const saveSettingsBtn = document.getElementById('freshdesk-ai-save-settings')
  const customPromptInput = document.getElementById('freshdesk-ai-custom-prompt') as HTMLTextAreaElement

  replyBtn?.addEventListener('click', handleGenerateReply)
  closeBtn?.addEventListener('click', () => panel?.classList.add('hidden'))
  copyBtn?.addEventListener('click', handleCopyReply)
  insertBtn?.addEventListener('click', handleInsertGeneratedReply)

  // Dropdown toggle
  dropdownBtn?.addEventListener('click', (e) => {
    e.stopPropagation()
    dropdown?.classList.toggle('hidden')
    panel?.classList.add('hidden')
  })

  // Tone buttons
  const toneBtns = floatingContainer.querySelectorAll('.dropdown-tone-btn')
  toneBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      toneBtns.forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      currentTone = (btn as HTMLElement).dataset.tone as typeof currentTone
    })
  })

  // Save settings button
  saveSettingsBtn?.addEventListener('click', () => {
    currentCustomPrompt = customPromptInput?.value || ''
    saveButtonSettings()
    dropdown?.classList.add('hidden')
    showToast('Settings saved!', 'success')
  })

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!floatingContainer?.contains(e.target as Node)) {
      dropdown?.classList.add('hidden')
    }
  })
}

async function loadButtonSettings() {
  try {
    const result = await chrome.storage.local.get(['freshdeskAiSettings', 'defaultTone', 'customPrompt'])

    // Load from popup settings if available
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
    // Get existing settings and merge
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

// Store the generated reply
let generatedReply = ''

async function handleGenerateReply() {
  if (isGenerating) return

  const panel = document.getElementById('freshdesk-ai-panel')
  const content = document.getElementById('freshdesk-ai-content')
  const copyBtn = document.getElementById('freshdesk-ai-copy') as HTMLButtonElement
  const insertBtn = document.getElementById('freshdesk-ai-insert') as HTMLButtonElement
  const replyBtn = document.getElementById('freshdesk-ai-reply-btn')

  if (!panel || !content || !replyBtn) return

  // Show panel and loading state
  panel.classList.remove('hidden')
  isGenerating = true
  replyBtn.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-text">Generating...</span>'
  content.innerHTML = '<div class="panel-loading"><span class="spinner"></span> Analyzing ticket and generating reply...</div>'

  if (copyBtn) copyBtn.disabled = true
  if (insertBtn) insertBtn.disabled = true

  try {
    // Get ticket info
    const customerMessage = getLatestCustomerMessage()
    if (!customerMessage) {
      throw new Error('Could not find customer message')
    }

    // Get settings - use currentTone and currentCustomPrompt from dropdown, signature from storage
    const settings = await chrome.storage.local.get(['freshdeskAiSettings'])
    const signature = settings.freshdeskAiSettings?.signature || ''
    const tone = currentTone
    const customPrompt = currentCustomPrompt

    // Get auth session
    const sessionData = await chrome.storage.local.get(['sb-iyeqiwixenjiakeisdae-auth-token'])
    const authData = sessionData['sb-iyeqiwixenjiakeisdae-auth-token']

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
        tone,
        customPrompt: customPrompt || undefined,
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

    showToast('Reply generated successfully!', 'success')
  } catch (error) {
    console.error('Error generating reply:', error)
    content.innerHTML = `<div class="panel-error">Error: ${error instanceof Error ? error.message : 'Failed to generate reply'}</div>`
    showToast(error instanceof Error ? error.message : 'Failed to generate reply', 'error')
  } finally {
    isGenerating = false
    replyBtn.innerHTML = '<span class="btn-icon">✨</span><span class="btn-text">Reply with AI</span>'
  }
}

function handleCopyReply() {
  if (!generatedReply) return

  navigator.clipboard.writeText(generatedReply).then(() => {
    showToast('Reply copied to clipboard!', 'success')
  }).catch(() => {
    showToast('Failed to copy', 'error')
  })
}

function handleInsertGeneratedReply() {
  if (!generatedReply) return

  const success = insertReply(generatedReply)
  if (success) {
    showToast('Reply inserted!', 'success')
    const panel = document.getElementById('freshdesk-ai-panel')
    panel?.classList.add('hidden')
  } else {
    showToast('Could not insert reply - try copying instead', 'error')
  }
}

function showToast(message: string, type: 'success' | 'error') {
  // Remove existing toast
  const existingToast = document.querySelector('.freshdesk-ai-toast')
  if (existingToast) existingToast.remove()

  const toast = document.createElement('div')
  toast.className = `freshdesk-ai-toast ${type}`
  toast.textContent = message
  document.body.appendChild(toast)

  setTimeout(() => toast.remove(), 3000)
}

// Remove the floating button
function removeReplyButton() {
  if (floatingContainer) {
    floatingContainer.remove()
    floatingContainer = null
  }
}

// Initialize content script
function init() {
  console.log('Freshdesk AI Assistant content script loaded')

  // Check if we're on a ticket page
  if (isOnTicketPage()) {
    createReplyWithAIButton()
    console.log('On Freshdesk ticket page - button created')
  }

  // Watch for URL changes (Freshdesk is a SPA)
  let lastUrl = window.location.href
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href
      console.log('URL changed:', lastUrl)

      if (isOnTicketPage()) {
        console.log('Navigated to ticket page')
        createReplyWithAIButton()
      } else {
        removeFloatingButton()
        removeReplyButton()
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
