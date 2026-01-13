// Default configuration
const DEFAULT_SERVER_URL = 'http://localhost:3000';

// State
let serverUrl = DEFAULT_SERVER_URL;
let currentTicketData = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupTabNavigation();
  setupEventListeners();
  setupKnowledgeBase();
  checkConnection();
  loadLearningStatus();
  loadDocuments();
});

// Load settings from storage
async function loadSettings() {
  const result = await chrome.storage.local.get(['serverUrl']);
  serverUrl = result.serverUrl || DEFAULT_SERVER_URL;
  document.getElementById('server-url').value = serverUrl;
}

// Setup tab navigation
function setupTabNavigation() {
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;

      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(`${targetTab}-tab`).classList.add('active');
    });
  });
}

// Setup all event listeners
function setupEventListeners() {
  // Scan Ticket button
  document.getElementById('scan-ticket').addEventListener('click', scanTicket);

  // Generate Reply button
  document.getElementById('generate-reply').addEventListener('click', generateReply);

  // Copy Reply button
  document.getElementById('copy-reply').addEventListener('click', copyReply);

  // Insert Reply button
  document.getElementById('insert-reply').addEventListener('click', insertReply);

  // Start Learning button
  document.getElementById('start-learning').addEventListener('click', startLearning);

  // Save Settings button
  document.getElementById('save-settings').addEventListener('click', saveSettings);

  // Test Connection button
  document.getElementById('test-connection').addEventListener('click', checkConnection);

  // View docs links
  document.getElementById('view-docs').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: `${serverUrl}/docs/setup-guide.html` });
  });

  document.getElementById('view-api-docs').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: `${serverUrl}/docs/api.html` });
  });

  document.getElementById('need-help').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://github.com/your-repo/freshdesk-ai-assistant#readme' });
  });
}

// Check server connection
async function checkConnection() {
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.querySelector('.status-text');

  statusDot.className = 'status-dot';
  statusText.textContent = 'Checking connection...';

  try {
    const response = await fetch(`${serverUrl}/api/health`);
    const data = await response.json();

    if (data.success) {
      statusDot.classList.add('connected');
      statusText.textContent = 'Connected to server';
      updateApiStatus(data.configuration);
    } else {
      throw new Error('Server returned error');
    }
  } catch (error) {
    statusDot.classList.add('disconnected');
    statusText.textContent = 'Could not connect to server';
    showStatus('Could not establish connection. Make sure the server is running on ' + serverUrl, 'error');
    updateApiStatus({ freshdesk: false, openai: false, shopify: false });
  }
}

// Update API status indicators
function updateApiStatus(config) {
  document.getElementById('freshdesk-status').textContent = config.freshdesk ? '✅' : '❌';
  document.getElementById('openai-status').textContent = config.openai ? '✅' : '❌';
  document.getElementById('shopify-status').textContent = config.shopify ? '✅' : '❌';
}

// Scan current Freshdesk ticket
async function scanTicket() {
  const button = document.getElementById('scan-ticket');
  button.disabled = true;
  button.innerHTML = '<span class="btn-icon">⏳</span> Scanning...';

  try {
    // Get the current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url.includes('freshdesk.com')) {
      throw new Error('Please open a Freshdesk ticket page');
    }

    // Execute content script to extract ticket data
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: extractTicketData
    });

    const ticketData = results[0]?.result;

    if (!ticketData || !ticketData.customerMessage) {
      throw new Error('Could not extract ticket data. Make sure you have a ticket open.');
    }

    currentTicketData = ticketData;

    // Display ticket info
    document.getElementById('ticket-subject').textContent = ticketData.subject || 'No subject';
    document.getElementById('ticket-customer').textContent = ticketData.customerName || 'Unknown';
    document.getElementById('ticket-email').textContent = ticketData.customerEmail || 'Unknown';
    document.getElementById('customer-message').value = ticketData.customerMessage;

    // Show ticket info sections
    document.getElementById('ticket-info').classList.remove('hidden');
    document.getElementById('customer-message-section').classList.remove('hidden');

    // Enable generate button
    document.getElementById('generate-reply').disabled = false;

    showStatus('Ticket scanned successfully!', 'success');
  } catch (error) {
    showStatus(error.message, 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = '<span class="btn-icon">🔍</span> Scan Ticket';
  }
}

// Extract ticket data from Freshdesk page (injected into page)
function extractTicketData() {
  const data = {
    subject: '',
    customerName: '',
    customerEmail: '',
    customerMessage: '',
    ticketId: ''
  };

  try {
    // Try to get ticket ID from URL
    const urlMatch = window.location.href.match(/tickets\/(\d+)/);
    if (urlMatch) {
      data.ticketId = urlMatch[1];
    }

    // Get subject
    const subjectEl = document.querySelector('.ticket-subject-heading, [data-testid="ticket-subject"], .subject-text, h2.ticket-subject');
    if (subjectEl) {
      data.subject = subjectEl.textContent.trim();
    }

    // Get customer name
    const customerNameEl = document.querySelector('.requester-name, [data-testid="requester-name"], .contact-name, .customer-name');
    if (customerNameEl) {
      data.customerName = customerNameEl.textContent.trim();
    }

    // Get customer email
    const customerEmailEl = document.querySelector('.requester-email, [data-testid="requester-email"], .contact-email, .customer-email');
    if (customerEmailEl) {
      data.customerEmail = customerEmailEl.textContent.trim();
    }

    // Get customer message (first incoming message)
    const messageEl = document.querySelector('.ticket-description, .message-body, [data-testid="conversation-body"], .conversation-content, .ticket-content');
    if (messageEl) {
      data.customerMessage = messageEl.textContent.trim();
    }

    // Alternative: Try to get from conversation thread
    if (!data.customerMessage) {
      const conversations = document.querySelectorAll('.conversation-item.incoming, .message.incoming, [data-incoming="true"]');
      if (conversations.length > 0) {
        data.customerMessage = conversations[0].textContent.trim();
      }
    }
  } catch (e) {
    console.error('Error extracting ticket data:', e);
  }

  return data;
}

// Generate AI reply
async function generateReply() {
  const button = document.getElementById('generate-reply');
  button.disabled = true;
  button.innerHTML = '<span class="btn-icon">⏳</span> Generating...';

  try {
    const customerMessage = document.getElementById('customer-message').value;
    const includeOrders = document.getElementById('include-orders').checked;
    const tone = document.getElementById('tone').value;

    if (!customerMessage.trim()) {
      throw new Error('Customer message is required');
    }

    const response = await fetch(`${serverUrl}/api/ai/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ticketSubject: currentTicketData?.subject || '',
        customerMessage: customerMessage,
        customerEmail: currentTicketData?.customerEmail || '',
        customerName: currentTicketData?.customerName || '',
        includeOrderInfo: includeOrders,
        tone: tone
      })
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to generate reply');
    }

    // Display generated reply
    document.getElementById('generated-reply').textContent = data.data.reply;
    document.getElementById('reply-section').classList.remove('hidden');

    // Show order info if available
    if (data.data.orderInfo) {
      document.getElementById('order-details').textContent = data.data.orderInfo;
      document.getElementById('order-info').classList.remove('hidden');
    } else {
      document.getElementById('order-info').classList.add('hidden');
    }

    showStatus('Reply generated successfully!', 'success');
  } catch (error) {
    showStatus(error.message, 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = '<span class="btn-icon">✨</span> Generate Reply';
  }
}

// Copy reply to clipboard
async function copyReply() {
  const reply = document.getElementById('generated-reply').textContent;
  try {
    await navigator.clipboard.writeText(reply);
    showStatus('Reply copied to clipboard!', 'success');
  } catch (error) {
    showStatus('Failed to copy: ' + error.message, 'error');
  }
}

// Insert reply into Freshdesk
async function insertReply() {
  const reply = document.getElementById('generated-reply').textContent;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url.includes('freshdesk.com')) {
      throw new Error('Please open a Freshdesk ticket page');
    }

    // Execute content script to insert reply
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: insertReplyIntoFreshdesk,
      args: [reply]
    });

    showStatus('Reply inserted into Freshdesk!', 'success');
  } catch (error) {
    showStatus('Failed to insert: ' + error.message, 'error');
  }
}

// Insert reply into Freshdesk editor (injected into page)
function insertReplyIntoFreshdesk(reply) {
  // Try different editor selectors
  const editorSelectors = [
    '.fr-element.fr-view', // Froala editor
    '.redactor-editor', // Redactor editor
    '[contenteditable="true"]', // Generic contenteditable
    '.note-editable', // Summernote
    'iframe.cke_wysiwyg_frame', // CKEditor iframe
    'textarea.reply-body', // Plain textarea
    '#reply_body', // ID-based selector
    '.reply-editor'
  ];

  let inserted = false;

  for (const selector of editorSelectors) {
    const editor = document.querySelector(selector);

    if (editor) {
      if (editor.tagName === 'IFRAME') {
        // Handle iframe editors
        const iframeDoc = editor.contentDocument || editor.contentWindow.document;
        const body = iframeDoc.body;
        if (body) {
          body.innerHTML = reply.replace(/\n/g, '<br>');
          inserted = true;
          break;
        }
      } else if (editor.tagName === 'TEXTAREA') {
        // Handle textareas
        editor.value = reply;
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        inserted = true;
        break;
      } else if (editor.contentEditable === 'true' || editor.classList.contains('fr-element')) {
        // Handle contenteditable
        editor.innerHTML = reply.replace(/\n/g, '<br>');
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        inserted = true;
        break;
      }
    }
  }

  // Try clicking reply button first if needed
  if (!inserted) {
    const replyButton = document.querySelector('[data-testid="reply-button"], .reply-button, button[title="Reply"], .btn-reply');
    if (replyButton) {
      replyButton.click();
      // Try again after a short delay
      setTimeout(() => {
        for (const selector of editorSelectors) {
          const editor = document.querySelector(selector);
          if (editor && editor.contentEditable === 'true') {
            editor.innerHTML = reply.replace(/\n/g, '<br>');
            break;
          }
        }
      }, 500);
    }
  }

  if (!inserted) {
    // Fallback: copy to clipboard
    navigator.clipboard.writeText(reply);
    alert('Could not find editor. Reply copied to clipboard instead.');
  }

  return inserted;
}

// Start learning from past tickets
async function startLearning() {
  const button = document.getElementById('start-learning');
  const progressSection = document.getElementById('learning-progress');
  const progressFill = document.querySelector('.progress-fill');
  const progressText = document.querySelector('.progress-text');
  const ticketCount = parseInt(document.getElementById('ticket-count').value);

  button.disabled = true;
  progressSection.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = `Starting to learn from ${ticketCount} tickets...`;

  try {
    // Simulate progress updates
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 10;
      if (progress > 90) progress = 90;
      progressFill.style.width = `${progress}%`;
    }, 1000);

    const response = await fetch(`${serverUrl}/api/freshdesk/learn`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ count: ticketCount })
    });

    clearInterval(progressInterval);

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Learning failed');
    }

    progressFill.style.width = '100%';
    progressText.textContent = `Learned from ${data.data.ticketsLearned} resolved tickets!`;

    // Update status
    document.getElementById('tickets-learned').innerHTML = `Tickets learned: <strong>${data.data.ticketsLearned}</strong>`;
    document.getElementById('last-learned').innerHTML = `Last updated: <strong>${new Date().toLocaleString()}</strong>`;

    // Save to storage
    await chrome.storage.local.set({
      ticketsLearned: data.data.ticketsLearned,
      lastLearned: new Date().toISOString()
    });

    showStatus(`Successfully learned from ${data.data.ticketsLearned} tickets!`, 'success');
  } catch (error) {
    progressFill.style.width = '0%';
    progressText.textContent = 'Learning failed';
    showStatus(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

// Load learning status
async function loadLearningStatus() {
  try {
    // First check storage
    const stored = await chrome.storage.local.get(['ticketsLearned', 'lastLearned']);

    if (stored.ticketsLearned) {
      document.getElementById('tickets-learned').innerHTML = `Tickets learned: <strong>${stored.ticketsLearned}</strong>`;
      document.getElementById('last-learned').innerHTML = `Last updated: <strong>${new Date(stored.lastLearned).toLocaleString()}</strong>`;
    }

    // Then check server
    const response = await fetch(`${serverUrl}/api/freshdesk/learn/status`);
    const data = await response.json();

    if (data.success && data.ticketsLearned > 0) {
      document.getElementById('tickets-learned').innerHTML = `Tickets learned: <strong>${data.ticketsLearned}</strong>`;
    }
  } catch (error) {
    console.log('Could not load learning status');
  }
}

// Save settings
async function saveSettings() {
  serverUrl = document.getElementById('server-url').value.trim() || DEFAULT_SERVER_URL;

  // Remove trailing slash
  if (serverUrl.endsWith('/')) {
    serverUrl = serverUrl.slice(0, -1);
  }

  await chrome.storage.local.set({ serverUrl });
  showStatus('Settings saved!', 'success');
  checkConnection();
}

// Show status message
function showStatus(message, type) {
  const statusEl = document.getElementById('status-message');
  statusEl.textContent = message;
  statusEl.className = `status-message ${type}`;
  statusEl.classList.remove('hidden');

  // Auto-hide after 5 seconds
  setTimeout(() => {
    statusEl.classList.add('hidden');
  }, 5000);
}

// ============================================
// KNOWLEDGE BASE FUNCTIONS
// ============================================

// Setup Knowledge Base event listeners
function setupKnowledgeBase() {
  const uploadArea = document.getElementById('upload-area');
  const fileInput = document.getElementById('file-input');

  // Click to select files
  uploadArea.addEventListener('click', () => fileInput.click());

  // File input change
  fileInput.addEventListener('change', handleFileSelect);

  // Drag and drop
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });

  uploadArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      uploadFiles(files);
    }
  });

  // Add text document button
  document.getElementById('add-text-doc').addEventListener('click', addTextDocument);

  // Refresh documents button
  document.getElementById('refresh-docs').addEventListener('click', loadDocuments);
}

// Handle file selection
function handleFileSelect(e) {
  const files = e.target.files;
  if (files.length > 0) {
    uploadFiles(files);
  }
}

// Upload files
async function uploadFiles(files) {
  const progressSection = document.getElementById('upload-progress');
  const progressFill = document.getElementById('upload-progress-fill');
  const progressText = document.getElementById('upload-progress-text');

  progressSection.classList.remove('hidden');
  progressFill.style.width = '0%';

  const results = [];
  const totalFiles = files.length;

  for (let i = 0; i < totalFiles; i++) {
    const file = files[i];
    progressText.textContent = `Uploading ${file.name} (${i + 1}/${totalFiles})...`;
    progressFill.style.width = `${((i) / totalFiles) * 100}%`;

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${serverUrl}/api/knowledge-base/upload`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (data.success) {
        results.push({ name: file.name, success: true });
      } else {
        results.push({ name: file.name, success: false, error: data.error });
      }
    } catch (error) {
      results.push({ name: file.name, success: false, error: error.message });
    }
  }

  progressFill.style.width = '100%';

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  if (failCount === 0) {
    progressText.textContent = `Successfully uploaded ${successCount} file(s)!`;
    showKBStatus(`Successfully uploaded ${successCount} document(s)!`, 'success');
  } else {
    progressText.textContent = `Uploaded ${successCount}, failed ${failCount}`;
    const errors = results.filter(r => !r.success).map(r => `${r.name}: ${r.error}`).join('\n');
    showKBStatus(`Some uploads failed:\n${errors}`, 'error');
  }

  // Clear file input
  document.getElementById('file-input').value = '';

  // Reload documents list
  await loadDocuments();

  // Hide progress after delay
  setTimeout(() => {
    progressSection.classList.add('hidden');
  }, 3000);
}

// Add text document
async function addTextDocument() {
  const name = document.getElementById('doc-name').value.trim();
  const content = document.getElementById('doc-content').value.trim();

  if (!content) {
    showKBStatus('Please enter document content', 'error');
    return;
  }

  const button = document.getElementById('add-text-doc');
  button.disabled = true;
  button.innerHTML = '<span class="btn-icon">⏳</span> Adding...';

  try {
    const response = await fetch(`${serverUrl}/api/knowledge-base/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: name || 'Untitled Document',
        content: content
      })
    });

    const data = await response.json();

    if (data.success) {
      showKBStatus(`Document "${data.data.name}" added successfully!`, 'success');
      document.getElementById('doc-name').value = '';
      document.getElementById('doc-content').value = '';
      await loadDocuments();
    } else {
      throw new Error(data.error || 'Failed to add document');
    }
  } catch (error) {
    showKBStatus(error.message, 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = '<span class="btn-icon">➕</span> Add to Knowledge Base';
  }
}

// Load documents list
async function loadDocuments() {
  const listEl = document.getElementById('documents-list');
  const statsEl = document.getElementById('kb-stats');

  try {
    const response = await fetch(`${serverUrl}/api/knowledge-base/documents`);
    const data = await response.json();

    if (data.success) {
      if (data.data.length === 0) {
        listEl.innerHTML = '<p class="empty-state">No documents yet. Upload files or paste text to get started.</p>';
        statsEl.classList.add('hidden');
      } else {
        listEl.innerHTML = data.data.map(doc => createDocumentItem(doc)).join('');
        statsEl.classList.remove('hidden');

        // Calculate total size
        const totalSize = data.data.reduce((sum, doc) => sum + doc.size, 0);
        document.getElementById('doc-count').textContent = `${data.count} document(s)`;
        document.getElementById('doc-size').textContent = formatBytes(totalSize);

        // Add delete handlers
        listEl.querySelectorAll('.delete-doc').forEach(btn => {
          btn.addEventListener('click', () => deleteDocument(btn.dataset.id, btn.dataset.name));
        });

        // Add view handlers
        listEl.querySelectorAll('.view-doc').forEach(btn => {
          btn.addEventListener('click', () => viewDocument(btn.dataset.id));
        });
      }
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    listEl.innerHTML = `<p class="empty-state" style="color: #dc2626;">Error loading documents: ${error.message}</p>`;
  }
}

// Create document item HTML
function createDocumentItem(doc) {
  const icon = getDocIcon(doc.type);
  const date = new Date(doc.createdAt).toLocaleDateString();

  return `
    <div class="document-item">
      <span class="doc-icon">${icon}</span>
      <div class="doc-info">
        <div class="doc-name" title="${doc.name}">${doc.name}</div>
        <div class="doc-meta">${doc.type.toUpperCase()} • ${formatBytes(doc.size)} • ${date}</div>
      </div>
      <div class="doc-actions">
        <button class="view-doc" data-id="${doc.id}" title="View">👁️</button>
        <button class="delete-doc delete" data-id="${doc.id}" data-name="${doc.name}" title="Delete">🗑️</button>
      </div>
    </div>
  `;
}

// Get icon for document type
function getDocIcon(type) {
  const icons = {
    'pdf': '📕',
    'docx': '📘',
    'doc': '📘',
    'txt': '📄',
    'text': '📄',
    'markdown': '📝',
    'json': '📋'
  };
  return icons[type] || '📄';
}

// Format bytes to human readable
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Delete document
async function deleteDocument(id, name) {
  if (!confirm(`Delete "${name}"?`)) return;

  try {
    const response = await fetch(`${serverUrl}/api/knowledge-base/documents/${id}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (data.success) {
      showKBStatus(`Document "${name}" deleted`, 'success');
      await loadDocuments();
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    showKBStatus(`Failed to delete: ${error.message}`, 'error');
  }
}

// View document (show in alert for now)
async function viewDocument(id) {
  try {
    const response = await fetch(`${serverUrl}/api/knowledge-base/documents/${id}`);
    const data = await response.json();

    if (data.success) {
      const doc = data.data;
      const preview = doc.content.substring(0, 1000);
      alert(`${doc.name}\n\n${preview}${doc.content.length > 1000 ? '\n\n[Content truncated...]' : ''}`);
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    showKBStatus(`Failed to load document: ${error.message}`, 'error');
  }
}

// Show Knowledge Base status message
function showKBStatus(message, type) {
  const statusEl = document.getElementById('kb-status-message');
  statusEl.textContent = message;
  statusEl.className = `status-message ${type}`;
  statusEl.classList.remove('hidden');

  setTimeout(() => {
    statusEl.classList.add('hidden');
  }, 5000);
}
