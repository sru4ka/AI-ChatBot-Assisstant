// Background service worker for Freshdesk AI Assistant

// Default server URL
const DEFAULT_SERVER_URL = 'http://localhost:3000';

// Handle installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default settings
    chrome.storage.local.set({
      serverUrl: DEFAULT_SERVER_URL,
      ticketsLearned: 0,
      lastLearned: null
    });

    console.log('Freshdesk AI Assistant installed successfully');
  }
});

// Handle messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_SERVER_URL') {
    chrome.storage.local.get(['serverUrl'], (result) => {
      sendResponse({ serverUrl: result.serverUrl || DEFAULT_SERVER_URL });
    });
    return true; // Keep channel open for async response
  }

  if (message.type === 'CHECK_CONNECTION') {
    checkServerConnection().then(sendResponse);
    return true;
  }

  if (message.type === 'GENERATE_REPLY') {
    generateReply(message.data).then(sendResponse);
    return true;
  }
});

// Check server connection
async function checkServerConnection() {
  const result = await chrome.storage.local.get(['serverUrl']);
  const serverUrl = result.serverUrl || DEFAULT_SERVER_URL;

  try {
    const response = await fetch(`${serverUrl}/api/health`);
    const data = await response.json();
    return { connected: data.success, configuration: data.configuration };
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

// Generate reply via server
async function generateReply(data) {
  const result = await chrome.storage.local.get(['serverUrl']);
  const serverUrl = result.serverUrl || DEFAULT_SERVER_URL;

  try {
    const response = await fetch(`${serverUrl}/api/ai/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    return await response.json();
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Create context menu for quick actions
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'generate-reply',
    title: 'Generate AI Reply',
    contexts: ['selection'],
    documentUrlPatterns: ['https://*.freshdesk.com/*']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'generate-reply' && info.selectionText) {
    // Send message to content script to show popup or generate reply
    chrome.tabs.sendMessage(tab.id, {
      type: 'GENERATE_FROM_SELECTION',
      text: info.selectionText
    });
  }
});
