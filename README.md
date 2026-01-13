# Freshdesk AI Assistant

AI-powered customer support assistant for Freshdesk with Shopify integration. Generate intelligent replies to customer tickets using OpenAI, with automatic order lookup and learning from past conversations.

## Features

- **AI-Powered Replies**: Generate context-aware responses using OpenAI GPT-4
- **Shopify Integration**: Automatically fetch customer order information for relevant responses
- **Learn from History**: Scan 100-1000 past tickets to learn your response patterns
- **One-Click Insert**: Insert generated replies directly into Freshdesk's reply editor
- **Multiple Tones**: Professional, friendly, formal, or empathetic responses
- **Chrome Extension**: Easy-to-use browser extension for Freshdesk

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/your-repo/AI-ChatBot-Assisstant.git
cd AI-ChatBot-Assisstant
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your API credentials:

```env
# Freshdesk
FRESHDESK_DOMAIN=yourcompany.freshdesk.com
FRESHDESK_API_KEY=your_api_key

# OpenAI
OPENAI_API_KEY=sk-your-api-key
OPENAI_MODEL=gpt-4

# Shopify (optional)
SHOPIFY_STORE_DOMAIN=yourstore.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_your_token
```

### 3. Start the Server

```bash
npm start
```

Server runs at `http://localhost:3000`

### 4. Install Chrome Extension

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension` folder

## Getting API Keys

### Freshdesk API Key
1. Log in to Freshdesk
2. Click profile icon (top right) > Profile Settings
3. Find "Your API Key" on the right side

### OpenAI API Key
1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Click "Create new secret key"
3. Copy and save immediately

### Shopify Access Token
1. Shopify Admin > Settings > Apps > Develop apps
2. Create app with scopes: `read_orders`, `read_customers`
3. Install app and copy Admin API access token

See [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md) for detailed instructions.

## Usage

1. **Open a Freshdesk ticket** in Chrome
2. **Click the extension icon**
3. **Click "Scan Ticket"** to extract customer info
4. **Click "Generate Reply"** to create an AI response
5. **Click "Insert"** to paste into Freshdesk editor

### Learning from Past Tickets

1. Go to the "Learn" tab in the extension
2. Select number of tickets (100-1000)
3. Click "Start Learning"
4. The AI will analyze resolved tickets to improve responses

## Project Structure

```
AI-ChatBot-Assisstant/
├── server/                 # Backend Node.js server
│   ├── index.js           # Server entry point
│   ├── routes/            # API routes
│   │   ├── freshdesk.js   # Freshdesk endpoints
│   │   ├── shopify.js     # Shopify endpoints
│   │   ├── ai.js          # AI generation endpoints
│   │   └── health.js      # Health check
│   └── services/          # Business logic
│       ├── freshdesk.js   # Freshdesk API service
│       ├── shopify.js     # Shopify API service
│       └── ai.js          # OpenAI service
├── extension/             # Chrome extension
│   ├── manifest.json      # Extension manifest
│   ├── popup/             # Popup UI
│   ├── background/        # Service worker
│   ├── content/           # Content scripts
│   └── icons/             # Extension icons
├── docs/                  # Documentation
│   ├── SETUP_GUIDE.md     # Detailed setup instructions
│   └── API_REFERENCE.md   # API documentation
├── .env.example           # Environment template
└── package.json           # Dependencies
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Check server status |
| `/api/freshdesk/ticket/:id` | GET | Get ticket details |
| `/api/freshdesk/learn` | POST | Learn from past tickets |
| `/api/shopify/orders` | GET | Search customer orders |
| `/api/ai/generate` | POST | Generate AI reply |

See [docs/API_REFERENCE.md](docs/API_REFERENCE.md) for complete API documentation.

## Troubleshooting

### "Could not establish connection"
- Make sure the server is running (`npm start`)
- Check extension settings for correct server URL

### "Failed to generate reply"
- Verify OpenAI API key is valid
- Check OpenAI account has billing set up

### "Could not insert reply"
- Click the Reply button in Freshdesk first
- Use "Copy" button and paste manually as fallback

## License

MIT License
