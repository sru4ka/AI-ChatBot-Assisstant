# AI ChatBot Assistant

AI-powered Chrome extension that helps customer support agents generate intelligent replies to Freshdesk tickets using RAG (Retrieval-Augmented Generation) based on your business's own documentation and knowledge base.

## Features

- **Knowledge Base Integration**: Upload your FAQs, policies, and product documentation (PDF, Word, TXT, MD)
- **AI-Powered Replies**: Generate contextual responses based on your knowledge base
- **Freshdesk Integration**: Seamlessly scan tickets and insert replies directly into Freshdesk
- **Learn from Past Tickets**: Scan 100-1000 resolved tickets to teach AI your response patterns
- **Shopify Integration**: Automatically include order information in AI replies
- **Tone Control**: Choose between professional, friendly, or concise response styles
- **Source Transparency**: See which documents were used to generate each reply

## Quick Start (Production)

### Step 1: Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your **Project Reference ID** from Project Settings → General
3. Note your **Project URL** and **anon key** from Project Settings → API

### Step 2: Run Database Setup SQL

Go to your Supabase Dashboard → SQL Editor and run this SQL:

```sql
-- Enable pgvector extension
create extension if not exists vector;

-- Businesses/accounts table
create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  freshdesk_domain text,
  freshdesk_api_key text,
  shopify_domain text,
  shopify_access_token text,
  created_at timestamp default now()
);

-- Uploaded documents table
create table documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  name text,
  content text,
  created_at timestamp default now()
);

-- Document chunks with embeddings
create table chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  content text,
  embedding vector(1536),
  created_at timestamp default now()
);

-- Vector search index
create index on chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Similarity search function
create or replace function match_chunks(
  query_embedding vector(1536),
  match_count int,
  p_business_id uuid
)
returns table (content text, similarity float)
language plpgsql
as $$
begin
  return query
  select c.content, 1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  join documents d on c.document_id = d.id
  where d.business_id = p_business_id
  order by c.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Enable Row Level Security
alter table businesses enable row level security;
alter table documents enable row level security;
alter table chunks enable row level security;

-- RLS Policies
create policy "Users can view their own business" on businesses
  for select using (auth.uid() = id);

create policy "Users can update their own business" on businesses
  for update using (auth.uid() = id);

create policy "Users can insert their own business" on businesses
  for insert with check (auth.uid() = id);

create policy "Users can view their documents" on documents
  for select using (
    business_id in (select id from businesses where id = auth.uid())
  );

create policy "Users can insert documents" on documents
  for insert with check (
    business_id in (select id from businesses where id = auth.uid())
  );

create policy "Users can delete their documents" on documents
  for delete using (
    business_id in (select id from businesses where id = auth.uid())
  );
```

### Step 3: Deploy Edge Functions

**Option A: Deploy from Command Line (Recommended)**

```bash
# Clone the repository
git clone https://github.com/sru4ka/AI-ChatBot-Assisstant.git
cd AI-ChatBot-Assisstant

# Install dependencies
npm install

# Login to Supabase
npx supabase login

# Link your project (replace with your project ref)
npx supabase link --project-ref YOUR_PROJECT_REF

# Set the OpenAI API key secret
npx supabase secrets set OPENAI_API_KEY=your-openai-api-key

# Deploy all functions (no Docker required with --legacy-bundle)
npx supabase functions deploy generate-reply --legacy-bundle --no-verify-jwt
npx supabase functions deploy ingest-document --legacy-bundle --no-verify-jwt
npx supabase functions deploy learn-tickets --legacy-bundle --no-verify-jwt
npx supabase functions deploy shopify-orders --legacy-bundle --no-verify-jwt
```

**Option B: If deployment fails**, deploy directly in Supabase Dashboard:
1. Go to Edge Functions in your Supabase Dashboard
2. Create each function manually and paste the code from `supabase/functions/`

### Step 4: Set Up Admin Dashboard

```bash
cd admin-dashboard

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Edit .env with your Supabase credentials:
# VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
# VITE_SUPABASE_ANON_KEY=your-anon-key

# Start the dashboard
npm run dev
```

Open http://localhost:5173 in your browser.

### Step 5: Build Chrome Extension

```bash
cd extension

# Install dependencies
npm install

# Build extension
npm run build
```

Load in Chrome:
1. Go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `extension/dist` folder

---

## API Keys You Need

| Service | Where to Get | What For |
|---------|--------------|----------|
| **Supabase URL** | Supabase Dashboard → Settings → API | Database & Auth |
| **Supabase Anon Key** | Supabase Dashboard → Settings → API | Public API access |
| **OpenAI API Key** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | AI replies & embeddings |
| **Freshdesk API Key** | Freshdesk → Profile Picture → Profile Settings → Your API Key | Ticket scanning & learning |
| **Shopify Access Token** | Shopify Admin → Settings → Apps → Develop apps → Create app | Order lookup (optional) |

---

## Detailed API Setup Instructions

### OpenAI API Key

1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign up or log in
3. Click your profile → "API keys"
4. Click "Create new secret key"
5. Copy the key (starts with `sk-`)
6. Add billing at Billing → Payment methods

**Cost estimate**: ~$0.01-0.05 per reply generated

### Freshdesk API Key

1. Log in to your Freshdesk account
2. Click your **profile picture** (top right)
3. Select **"Profile Settings"**
4. Scroll down to find **"Your API Key"**
5. Copy the API key

### Shopify Admin API Access Token (Optional)

The Shopify Access Token lets the AI include order information when answering customer questions.

**Step 1: Open the Dev Dashboard**
1. Log in to your Shopify Admin
2. Go to **Settings** → **Apps and sales channels**
3. Click the **"Build apps in Dev Dashboard"** button (or "Develop apps" if shown)
4. This opens Shopify's App Development dashboard at `partners.shopify.com`

**Step 2: Create a Custom App**
1. In the Dev Dashboard, click **"Create an app"**
2. Name it something like "Freshdesk AI Integration"
3. Click **"Create app"**

**Step 3: Configure API Scopes**
1. Go to the **Configuration** tab
2. Under **Admin API integration**, click **"Configure"**
3. Search for and enable these scopes:
   - `read_orders` - View order details
   - `read_customers` - View customer info
   - `read_fulfillments` - View shipping status
4. Click **Save**

**Step 4: Install and Get Token**
1. Go to the **API credentials** tab
2. Click **"Install app"** to install it on your store
3. In the **Admin API access token** section, click **"Reveal token once"**
4. **Copy the token immediately** - it starts with `shpat_` and is only shown once!

**Important Notes:**
- As of January 2026, Shopify uses the new **Dev Dashboard** (not "Legacy custom apps")
- If you see "Legacy custom apps" in your dashboard, you can still use existing apps but should create new ones in Dev Dashboard
- The token format is `shpat_` followed by random characters (e.g., `shpat_abc123xyz...`)
- If you lose the token, you'll need to rotate it (generate a new one)

---

## Usage

### For Businesses (Admin Dashboard)

1. **Sign Up**: Create an account at the admin dashboard (localhost:5173)
2. **Configure Settings**:
   - Enter your Freshdesk domain and API key
   - (Optional) Enter your Shopify store domain and access token
3. **Upload Documents**: Add your FAQs, return policies, product docs
4. **Learn from Tickets**: Click "Learn from Past Tickets" to train AI on resolved tickets
5. **Test**: Use the test area to verify AI responses

### For Support Agents (Chrome Extension)

1. **Navigate to Freshdesk**: Open a ticket in your Freshdesk account
2. **Open Extension**: Click the Freshdesk AI Assistant icon
3. **Log In**: Use the same email/password from admin dashboard
4. **Scan Ticket**: Click "Scan Ticket" to extract the customer message
5. **Select Tone**: Choose professional, friendly, or concise
6. **Generate Reply**: Click "Generate Reply" to get an AI suggestion
7. **Edit & Insert**: Edit if needed, then click "Insert into Freshdesk"

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Chrome         │     │  Supabase       │     │  OpenAI         │
│  Extension      │────▶│  Edge Functions │────▶│  API            │
│  (Freshdesk)    │     │  + PostgreSQL   │     │  (Embeddings +  │
└─────────────────┘     │  + pgvector     │     │   GPT-4o-mini)  │
        │               └─────────────────┘     └─────────────────┘
        ▼                       │
┌─────────────────┐            │
│  Admin          │            ▼
│  Dashboard      │     ┌─────────────────┐
│  (React + Vite) │     │  Freshdesk API  │
└─────────────────┘     │  Shopify API    │
                        └─────────────────┘
```

## Edge Functions

| Function | Purpose |
|----------|---------|
| `generate-reply` | Generates AI replies using RAG |
| `ingest-document` | Processes and stores documents with embeddings |
| `learn-tickets` | Scans Freshdesk tickets to learn response patterns |
| `shopify-orders` | Looks up customer orders from Shopify |

---

## Troubleshooting

### "Edge Function returned a non-2xx status code"

This error means the Edge Function failed. Here's how to diagnose and fix it:

**Step 1: Check if functions are deployed**
Go to your Supabase Dashboard → Edge Functions. You should see:
- `generate-reply`
- `ingest-document`
- `learn-tickets`
- `shopify-orders`

If any are missing, deploy them (see Step 2).

**Step 2: Deploy functions (without Docker)**

If the CLI says "Docker Desktop is a prerequisite", deploy directly via Supabase Dashboard:

1. Go to https://supabase.com/dashboard/project/YOUR_PROJECT_REF/functions
2. Click **"Create a new function"**
3. For each function:
   - Enter the function name (e.g., `generate-reply`)
   - Copy the code from `supabase/functions/[name]/index.ts`
   - **Uncheck "Verify JWT"** (important!)
   - Click **Deploy**

**Step 3: Check OpenAI API key is set**

The functions need an OpenAI API key. Set it via CLI:
```bash
npx supabase secrets set OPENAI_API_KEY=sk-your-key-here
```

Or in Dashboard → Edge Functions → select function → **Secrets** → Add `OPENAI_API_KEY`.

**Step 4: Check function logs**

Go to Supabase Dashboard → Edge Functions → select the failing function → **Logs**.
Look for error messages that explain what's wrong.

**Common causes:**
- Missing `OPENAI_API_KEY` secret
- Function not deployed
- Database tables not created (run the SQL from Step 2)
- Invalid API key (expired or incorrect)

### "Docker Desktop is a prerequisite"

This appears when deploying via CLI. **You don't need Docker** - deploy directly through the Supabase Dashboard instead (see above).

### "Error creating business: [object Object]"

This usually means:
1. The `businesses` table doesn't exist - run the SQL from "Step 2: Run Database Setup SQL"
2. Row Level Security is blocking the insert - make sure RLS policies are created
3. User already has a business (not an error - can be ignored)

### Extension can't find ticket content / "Receiving end does not exist"

1. **Reload the extension**: Go to `chrome://extensions/`, find the extension, click the refresh icon
2. **Refresh Freshdesk**: Close and reopen the Freshdesk ticket page
3. **Check you're on a ticket**: The extension only works on individual ticket pages, not the ticket list

### Document upload fails

- Ensure document size is under 100KB (for text) or 10MB (for PDF/Word)
- Make sure you're logged in to the Admin Dashboard
- Check Edge Function logs for specific errors
- Verify the `ingest-document` function is deployed

### AI replies are generic / not using knowledge base

1. **Upload documents first**: Go to Admin Dashboard → Upload Documents
2. **Use "Learn from Past Tickets"**: This trains the AI on your actual responses
3. **Check documents exist**: Go to Admin Dashboard and verify documents are listed
4. **Check for content**: Documents need actual text content, not just titles

---

## Environment Variables

### Root `.env`
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=your-openai-api-key
```

### Admin Dashboard `.env`
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

---

## License

MIT License - see LICENSE file for details.
