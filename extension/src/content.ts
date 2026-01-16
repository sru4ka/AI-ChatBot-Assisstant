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
