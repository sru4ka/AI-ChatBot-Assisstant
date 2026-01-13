// Content script for Freshdesk AI Assistant
// This runs on Freshdesk pages and handles inserting replies

(function() {
  'use strict';

  // Listen for messages from popup or background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'INSERT_REPLY') {
      const success = insertReplyIntoEditor(message.reply);
      sendResponse({ success });
    }

    if (message.type === 'EXTRACT_TICKET') {
      const data = extractTicketData();
      sendResponse({ data });
    }

    if (message.type === 'GENERATE_FROM_SELECTION') {
      handleSelectionGenerate(message.text);
    }

    return true;
  });

  // Extract ticket data from the page
  function extractTicketData() {
    const data = {
      ticketId: '',
      subject: '',
      customerName: '',
      customerEmail: '',
      customerMessage: '',
      status: ''
    };

    try {
      // Get ticket ID from URL
      const urlMatch = window.location.href.match(/tickets\/(\d+)/);
      if (urlMatch) {
        data.ticketId = urlMatch[1];
      }

      // Subject - try multiple selectors for different Freshdesk versions
      const subjectSelectors = [
        '.ticket-subject-heading',
        '[data-testid="ticket-subject"]',
        '.subject-text',
        'h2.ticket-subject',
        '.ticket-detail-header h2',
        '.ticket-header .subject'
      ];

      for (const selector of subjectSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          data.subject = el.textContent.trim();
          break;
        }
      }

      // Customer name
      const nameSelectors = [
        '.requester-name',
        '[data-testid="requester-name"]',
        '.contact-name',
        '.customer-name',
        '.requester-info .name',
        '.ticket-requester .name'
      ];

      for (const selector of nameSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          data.customerName = el.textContent.trim();
          break;
        }
      }

      // Customer email
      const emailSelectors = [
        '.requester-email',
        '[data-testid="requester-email"]',
        '.contact-email',
        '.customer-email',
        '.requester-info .email',
        'a[href^="mailto:"]'
      ];

      for (const selector of emailSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          data.customerEmail = el.textContent.trim().replace('mailto:', '');
          break;
        }
      }

      // Customer message - get the first/original message
      const messageSelectors = [
        '.ticket-description',
        '.message-body',
        '[data-testid="conversation-body"]',
        '.conversation-content',
        '.ticket-content',
        '.ticket-detail .description'
      ];

      for (const selector of messageSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          data.customerMessage = el.innerText.trim();
          break;
        }
      }

      // Fallback: get first incoming conversation
      if (!data.customerMessage) {
        const conversationSelectors = [
          '.conversation-item.incoming .message-body',
          '.message.incoming .content',
          '[data-incoming="true"] .message-content'
        ];

        for (const selector of conversationSelectors) {
          const el = document.querySelector(selector);
          if (el) {
            data.customerMessage = el.innerText.trim();
            break;
          }
        }
      }

      // Ticket status
      const statusSelectors = [
        '.ticket-status',
        '[data-testid="ticket-status"]',
        '.status-label',
        '.ticket-detail-status'
      ];

      for (const selector of statusSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          data.status = el.textContent.trim();
          break;
        }
      }

    } catch (error) {
      console.error('Error extracting ticket data:', error);
    }

    return data;
  }

  // Insert reply into the editor
  function insertReplyIntoEditor(reply) {
    // Convert newlines to HTML breaks
    const htmlReply = reply.replace(/\n/g, '<br>');

    // Try to find and populate different editor types
    const editorStrategies = [
      // Froala Editor (commonly used in Freshdesk)
      () => {
        const froala = document.querySelector('.fr-element.fr-view');
        if (froala) {
          froala.innerHTML = htmlReply;
          froala.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
        return false;
      },

      // TinyMCE
      () => {
        const tinymce = document.querySelector('.mce-content-body');
        if (tinymce) {
          tinymce.innerHTML = htmlReply;
          return true;
        }
        return false;
      },

      // CKEditor
      () => {
        const ckeditor = document.querySelector('.cke_editable');
        if (ckeditor) {
          ckeditor.innerHTML = htmlReply;
          return true;
        }
        return false;
      },

      // CKEditor iframe
      () => {
        const ckeFrame = document.querySelector('iframe.cke_wysiwyg_frame');
        if (ckeFrame) {
          const doc = ckeFrame.contentDocument || ckeFrame.contentWindow.document;
          const body = doc.body;
          if (body) {
            body.innerHTML = htmlReply;
            return true;
          }
        }
        return false;
      },

      // Generic contenteditable
      () => {
        const contentEditable = document.querySelector('[contenteditable="true"]:not(.fr-element)');
        if (contentEditable) {
          contentEditable.innerHTML = htmlReply;
          contentEditable.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
        return false;
      },

      // Redactor
      () => {
        const redactor = document.querySelector('.redactor-editor');
        if (redactor) {
          redactor.innerHTML = htmlReply;
          return true;
        }
        return false;
      },

      // Plain textarea
      () => {
        const textareas = document.querySelectorAll('textarea.reply-body, #reply_body, textarea[name="body"]');
        for (const textarea of textareas) {
          if (textarea && !textarea.hidden) {
            textarea.value = reply;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
        return false;
      },

      // Freshdesk specific editors
      () => {
        // Try clicking reply button first
        const replyBtn = document.querySelector('[data-testid="reply-button"], .reply-button, button[title="Reply"]');
        if (replyBtn) {
          replyBtn.click();
          // Wait for editor to appear
          return new Promise(resolve => {
            setTimeout(() => {
              const editor = document.querySelector('.fr-element.fr-view, [contenteditable="true"]');
              if (editor) {
                editor.innerHTML = htmlReply;
                editor.dispatchEvent(new Event('input', { bubbles: true }));
                resolve(true);
              } else {
                resolve(false);
              }
            }, 500);
          });
        }
        return false;
      }
    ];

    // Try each strategy
    for (const strategy of editorStrategies) {
      try {
        const result = strategy();
        if (result === true) {
          showNotification('Reply inserted successfully!', 'success');
          return true;
        }
        if (result instanceof Promise) {
          result.then(success => {
            if (success) {
              showNotification('Reply inserted successfully!', 'success');
            }
          });
          return true;
        }
      } catch (e) {
        console.log('Strategy failed:', e);
      }
    }

    // Fallback: copy to clipboard
    navigator.clipboard.writeText(reply).then(() => {
      showNotification('Could not find editor. Reply copied to clipboard!', 'info');
    });

    return false;
  }

  // Handle generate from text selection
  async function handleSelectionGenerate(selectedText) {
    // Get server URL
    const result = await chrome.storage.local.get(['serverUrl']);
    const serverUrl = result.serverUrl || 'http://localhost:3000';

    try {
      // Extract additional context from page
      const ticketData = extractTicketData();

      // Generate reply
      const response = await fetch(`${serverUrl}/api/ai/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ticketSubject: ticketData.subject,
          customerMessage: selectedText,
          customerEmail: ticketData.customerEmail,
          customerName: ticketData.customerName,
          includeOrderInfo: true,
          tone: 'professional'
        })
      });

      const data = await response.json();

      if (data.success) {
        insertReplyIntoEditor(data.data.reply);
      } else {
        showNotification('Failed to generate reply: ' + data.error, 'error');
      }
    } catch (error) {
      showNotification('Error: ' + error.message, 'error');
    }
  }

  // Show notification on the page
  function showNotification(message, type = 'info') {
    // Remove existing notification
    const existing = document.getElementById('fd-ai-notification');
    if (existing) {
      existing.remove();
    }

    const notification = document.createElement('div');
    notification.id = 'fd-ai-notification';
    notification.className = `fd-ai-notification fd-ai-${type}`;
    notification.innerHTML = `
      <span class="fd-ai-icon">${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}</span>
      <span class="fd-ai-message">${message}</span>
      <button class="fd-ai-close">×</button>
    `;

    document.body.appendChild(notification);

    // Close button handler
    notification.querySelector('.fd-ai-close').addEventListener('click', () => {
      notification.remove();
    });

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.classList.add('fd-ai-fadeout');
        setTimeout(() => notification.remove(), 300);
      }
    }, 5000);
  }

  // Log that content script is loaded
  console.log('Freshdesk AI Assistant content script loaded');
})();
