# Freshdesk AI Assistant - Complete Setup Guide

This guide will walk you through setting up the Freshdesk AI Assistant with all integrations including Freshdesk, OpenAI, and Shopify.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Freshdesk API Setup](#freshdesk-api-setup)
4. [OpenAI API Setup](#openai-api-setup)
5. [Shopify API Setup](#shopify-api-setup)
6. [Server Installation](#server-installation)
7. [Chrome Extension Installation](#chrome-extension-installation)
8. [Using the Extension](#using-the-extension)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- Node.js 18 or higher
- Google Chrome browser
- Freshdesk account with admin access
- OpenAI account with API access
- Shopify store with admin access (optional, for order lookup)

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-repo/freshdesk-ai-assistant.git
cd freshdesk-ai-assistant

# 2. Install dependencies
npm install

# 3. Copy environment file and configure
cp .env.example .env
# Edit .env with your API keys (see sections below)

# 4. Start the server
npm start

# 5. Load the Chrome extension (see Chrome Extension Installation)
```

---

## Freshdesk API Setup

### Step 1: Get Your Freshdesk Domain
Your Freshdesk domain is the URL you use to access Freshdesk:
- Example: `yourcompany.freshdesk.com`
- Do NOT include `https://`

### Step 2: Get Your API Key

1. **Log in to Freshdesk** at `https://yourcompany.freshdesk.com`

2. **Click on your profile icon** in the top-right corner

3. **Select "Profile Settings"**

4. **Find "Your API Key"** on the right side of the page
   - Click "View API Key" if it's hidden
   - Copy the API key

5. **Add to your `.env` file:**
   ```env
   FRESHDESK_DOMAIN=yourcompany.freshdesk.com
   FRESHDESK_API_KEY=your_api_key_here
   ```

### API Key Permissions
The API key inherits your user permissions. For full functionality, ensure your account has:
- Read access to tickets
- Read access to contacts/customers
- Read access to conversations

---

## OpenAI API Setup

### Step 1: Create an OpenAI Account
1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign up or log in

### Step 2: Generate an API Key

1. **Go to API Keys:** [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

2. **Click "Create new secret key"**

3. **Name your key** (e.g., "Freshdesk AI Assistant")

4. **Copy the key immediately** - it won't be shown again!

5. **Add to your `.env` file:**
   ```env
   OPENAI_API_KEY=sk-your-api-key-here
   OPENAI_MODEL=gpt-4
   ```

### Choosing a Model
- `gpt-4` - Best quality, most expensive
- `gpt-4-turbo` - Good balance of quality and speed
- `gpt-3.5-turbo` - Fastest and cheapest, good quality

### API Usage & Billing
- Check your usage at [platform.openai.com/usage](https://platform.openai.com/usage)
- Set up billing at [platform.openai.com/account/billing](https://platform.openai.com/account/billing)
- Consider setting usage limits to prevent unexpected charges

---

## Shopify API Setup

### Step 1: Create a Custom App

1. **Log in to Shopify Admin** at `your-store.myshopify.com/admin`

2. **Go to Settings** (bottom left) > **Apps and sales channels**

3. **Click "Develop apps"** (at the top)

4. **Click "Allow custom app development"** if prompted

5. **Click "Create an app"**
   - Name: "Freshdesk AI Assistant"
   - Developer: Your name

### Step 2: Configure API Scopes

1. **Click "Configure Admin API scopes"**

2. **Select these scopes:**
   - `read_orders` - Required for order lookup
   - `read_customers` - Required for customer info
   - `read_products` - Optional, for product details

3. **Click "Save"**

### Step 3: Install the App and Get Token

1. **Click "Install app"** (top right)

2. **Confirm installation**

3. **Go to "API credentials"** tab

4. **Copy the "Admin API access token"**
   - ⚠️ This is only shown once!

5. **Add to your `.env` file:**
   ```env
   SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
   SHOPIFY_ACCESS_TOKEN=shpat_your_token_here
   SHOPIFY_API_VERSION=2024-01
   ```

### Finding Your Store Domain
Your store domain is: `your-store-name.myshopify.com`
- Do NOT include `https://`
- Do NOT include `/admin`

---

## Server Installation

### Step 1: Install Dependencies

```bash
cd freshdesk-ai-assistant
npm install
```

### Step 2: Configure Environment

```bash
# Copy the example file
cp .env.example .env

# Edit with your favorite editor
nano .env
# or
code .env
```

### Step 3: Start the Server

```bash
# Development mode (auto-restart on changes)
npm run dev

# Production mode
npm start
```

### Step 4: Verify Server is Running

Visit `http://localhost:3000/api/health` in your browser. You should see:

```json
{
  "success": true,
  "status": "running",
  "configuration": {
    "freshdesk": true,
    "openai": true,
    "shopify": true
  }
}
```

---

## Chrome Extension Installation

### Step 1: Prepare Extension Files

Make sure the `extension/icons` folder has PNG icons:
- icon16.png
- icon48.png
- icon128.png

(See `extension/icons/README.md` for creating icons)

### Step 2: Load Extension in Chrome

1. **Open Chrome** and go to `chrome://extensions/`

2. **Enable "Developer mode"** (toggle in top-right)

3. **Click "Load unpacked"**

4. **Select the `extension` folder** from this project

5. **Pin the extension** by clicking the puzzle icon and pinning "Freshdesk AI Assistant"

### Step 3: Configure Extension

1. **Click the extension icon** in Chrome toolbar

2. **Go to Settings tab**

3. **Verify Server URL** is `http://localhost:3000`

4. **Click "Test Connection"** to verify everything works

---

## Using the Extension

### Generating Replies

1. **Open a Freshdesk ticket** in your browser

2. **Click the extension icon**

3. **Click "Scan Ticket"** to extract ticket info

4. **Optionally adjust:**
   - Toggle "Include Shopify order info"
   - Select response tone

5. **Click "Generate Reply"**

6. **Review the generated reply**

7. **Click "Insert"** to paste into Freshdesk editor
   - Or click "Copy" to copy to clipboard

### Learning from Past Tickets

1. **Click the extension icon**

2. **Go to "Learn" tab**

3. **Select number of tickets** (100-1000)

4. **Click "Start Learning"**

5. **Wait for process to complete**

The AI will now use patterns from your past responses to generate better replies!

---

## Troubleshooting

### "Could not establish connection"

**Causes:**
- Server is not running
- Wrong server URL in extension settings

**Solutions:**
1. Start the server: `npm start`
2. Check extension settings for correct URL
3. Make sure no firewall is blocking localhost:3000

### "Failed to fetch ticket"

**Causes:**
- Invalid Freshdesk API key
- Wrong Freshdesk domain

**Solutions:**
1. Verify API key in `.env` file
2. Check domain format (no https://, no trailing slash)
3. Ensure your Freshdesk user has ticket read permissions

### "AI generation failed"

**Causes:**
- Invalid OpenAI API key
- No API credits/billing set up
- Rate limiting

**Solutions:**
1. Verify OpenAI API key
2. Check billing at platform.openai.com
3. Wait a moment and retry if rate limited

### "Could not insert reply"

**Causes:**
- Freshdesk UI has changed
- Reply editor not visible

**Solutions:**
1. Click the Reply button in Freshdesk first
2. Use "Copy" and paste manually
3. Make sure you're on a ticket detail page

### Extension Not Working on Freshdesk

**Solutions:**
1. Refresh the Freshdesk page
2. Reload the extension at chrome://extensions/
3. Check Chrome console for errors (F12)

---

## Support

For issues and feature requests, please open an issue on GitHub.
