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

### Shopify Access Token (Optional)

1. Go to Shopify Admin → **Settings** → **Apps and sales channels**
2. Click **"Develop apps"** (may need to enable first)
3. Click **"Create an app"** and name it "Freshdesk AI"
4. Go to **Configuration** → **Admin API integration**
5. Click **"Configure Admin API scopes"**
6. Enable these scopes:
   - `read_orders`
   - `read_customers`
   - `read_fulfillments`
7. Click **Save** then **Install app**
8. Click **"Reveal token once"** and copy the Admin API access token

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

This means the Edge Functions aren't deployed. Run:
```bash
npx supabase functions deploy generate-reply --legacy-bundle --no-verify-jwt
npx supabase functions deploy ingest-document --legacy-bundle --no-verify-jwt
```

### "Docker Desktop is a prerequisite"

You don't need Docker for production deployment. Use `--legacy-bundle` flag:
```bash
npx supabase functions deploy generate-reply --legacy-bundle --no-verify-jwt
```

### Extension can't find ticket content

Freshdesk may update their DOM structure. Check `extension/src/utils/freshdesk.ts` and update the selectors if needed.

### Document upload fails

- Ensure document size is under 100KB
- Check that the business ID exists in the database
- Verify the Edge Function is deployed

### AI replies are generic

- Upload more relevant documents to the knowledge base
- Use "Learn from Past Tickets" to train on your actual responses
- Make sure documents contain specific information about your products/services

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
