# AI ChatBot Assistant

AI-powered Chrome extension that helps customer support agents generate intelligent replies to Freshdesk tickets using RAG (Retrieval-Augmented Generation) based on your business's own documentation and knowledge base.

## Features

- **Knowledge Base Integration**: Upload your FAQs, policies, and product documentation
- **AI-Powered Replies**: Generate contextual responses based on your knowledge base
- **Freshdesk Integration**: Seamlessly scan tickets and insert replies directly into Freshdesk
- **Tone Control**: Choose between professional, friendly, or concise response styles
- **Source Transparency**: See which documents were used to generate each reply

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Chrome         │     │  Supabase       │     │  OpenAI         │
│  Extension      │────▶│  Edge Functions │────▶│  API            │
│  (Freshdesk)    │     │  + PostgreSQL   │     │  (Embeddings +  │
└─────────────────┘     │  + pgvector     │     │   GPT-4o-mini)  │
                        └─────────────────┘     └─────────────────┘
        │
        ▼
┌─────────────────┐
│  Admin          │
│  Dashboard      │
│  (React + Vite) │
└─────────────────┘
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Database & Auth | Supabase (PostgreSQL + pgvector) |
| Backend API | Supabase Edge Functions (Deno) |
| Embeddings | OpenAI `text-embedding-3-small` |
| LLM | OpenAI `gpt-4o-mini` |
| Admin Dashboard | React + TypeScript + Vite |
| Chrome Extension | Manifest V3 + React + TypeScript |

## Project Structure

```
AI-ChatBot-Assistant/
├── supabase/
│   ├── config.toml              # Supabase configuration
│   └── functions/
│       ├── generate-reply/      # AI reply generation endpoint
│       └── ingest-document/     # Document processing endpoint
├── admin-dashboard/             # React web app for business onboarding
│   ├── src/
│   │   ├── components/
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── DocumentUpload.tsx
│   │   │   ├── Settings.tsx
│   │   │   └── TestArea.tsx
│   │   └── lib/
│   │       └── supabase.ts
│   └── package.json
└── extension/                   # Chrome extension
    ├── manifest.json
    ├── src/
    │   ├── background.ts
    │   ├── content.ts
    │   ├── popup/
    │   │   └── Popup.tsx
    │   └── utils/
    │       ├── api.ts
    │       └── freshdesk.ts
    └── package.json
```

## Prerequisites

- Node.js 18+
- Supabase CLI
- A Supabase project with pgvector enabled
- An OpenAI API key
- A Freshdesk account (for testing)

## Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/AI-ChatBot-Assistant.git
cd AI-ChatBot-Assistant
```

### 2. Set Up Supabase

#### Create Database Tables

Run the following SQL in your Supabase SQL Editor:

```sql
-- Enable pgvector extension
create extension if not exists vector;

-- Businesses/accounts
create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  freshdesk_domain text,
  freshdesk_api_key text,
  created_at timestamp default now()
);

-- Uploaded documents
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

-- RLS Policies (adjust as needed for your auth setup)
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

#### Deploy Edge Functions

```bash
# Login to Supabase
npx supabase login

# Link your project
npx supabase link --project-ref your-project-ref

# Set secrets for Edge Functions
npx supabase secrets set OPENAI_API_KEY=your-openai-api-key

# Deploy functions
npx supabase functions deploy generate-reply
npx supabase functions deploy ingest-document
```

### 3. Set Up Admin Dashboard

```bash
cd admin-dashboard

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Edit .env with your Supabase credentials
# VITE_SUPABASE_URL=https://your-project.supabase.co
# VITE_SUPABASE_ANON_KEY=your-anon-key

# Start development server
npm run dev
```

### 4. Build Chrome Extension

```bash
cd extension

# Install dependencies
npm install

# Build extension
npm run build

# The built extension will be in extension/dist/
```

#### Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `extension/dist` folder

### 5. Configure the Extension

1. Click the extension icon in Chrome
2. Go to "Settings" tab
3. Enter your:
   - Supabase URL
   - Supabase Anon Key
   - Business ID (from Admin Dashboard)

## Usage

### For Businesses (Admin Dashboard)

1. **Sign Up**: Create an account at the admin dashboard
2. **Configure Freshdesk**: Enter your Freshdesk domain and API key (optional)
3. **Upload Documents**: Add your FAQs, policies, and documentation
4. **Test**: Use the test area to verify AI responses

### For Support Agents (Chrome Extension)

1. **Navigate to Freshdesk**: Open a ticket in your Freshdesk account
2. **Open Extension**: Click the Freshdesk AI Assistant icon
3. **Scan Ticket**: Click "Scan Ticket" to extract the customer message
4. **Select Tone**: Choose professional, friendly, or concise
5. **Generate Reply**: Click "Generate Reply" to get an AI suggestion
6. **Edit & Insert**: Edit if needed, then click "Insert into Freshdesk"

## API Endpoints

### `generate-reply`

Generates an AI-powered reply based on the knowledge base.

```typescript
POST /functions/v1/generate-reply

Request:
{
  "businessId": "uuid",
  "customerMessage": "string",
  "tone": "professional" | "friendly" | "concise"
}

Response:
{
  "reply": "string",
  "sources": [{ "snippet": "string", "similarity": number }],
  "hasKnowledgeBase": boolean
}
```

### `ingest-document`

Processes and stores a document in the knowledge base.

```typescript
POST /functions/v1/ingest-document

Request:
{
  "businessId": "uuid",
  "documentContent": "string",
  "documentName": "string"
}

Response:
{
  "success": boolean,
  "documentId": "uuid",
  "chunkCount": number
}
```

## Development

### Run Admin Dashboard

```bash
cd admin-dashboard
npm run dev
```

### Watch Extension Changes

```bash
cd extension
npm run dev
```

### Run Supabase Locally

```bash
npx supabase start
npx supabase functions serve
```

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

## Troubleshooting

### Extension can't find ticket content

Freshdesk may update their DOM structure. Check `extension/src/utils/freshdesk.ts` and update the selectors if needed.

### Edge Functions returning errors

1. Check that secrets are set: `npx supabase secrets list`
2. View function logs: `npx supabase functions logs generate-reply`

### Document ingestion fails

- Ensure document size is under 100KB
- Check that the business ID exists in the database

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details.
