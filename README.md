# insidethe.ai

Interactive visualizations of what happens inside AI models — in real time, using real activations from real forward passes.

The first experience, **Inside the Processing**, runs GPT-2 locally and streams every internal activation to the browser as the model processes your prompt: BPE tokenization, token embeddings, attention patterns across all 12 layers, MLP activations, and next-token predictions.

## Structure

```
insidethe-ai/
├── frontend/          ← Next.js app (deployed on Vercel)
├── backend/           ← FastAPI + WebSocket server (deployed on Fly.io)
└── docs/
    ├── plans/         ← implementation plans
    └── solutions/     ← documented solutions and patterns
```

## Running locally

**Frontend:**
```bash
pnpm dev
```

**Backend:**
```bash
pnpm backend
```

The frontend runs at [http://localhost:3000](http://localhost:3000). The backend runs at [http://localhost:8000](http://localhost:8000) and serves the WebSocket at `ws://localhost:8000/ws`.

See [`frontend/README.md`](frontend/README.md) and [`backend/README.md`](backend/README.md) for full setup details.

## Experiences

| Experience | Route | Status |
|---|---|---|
| Inside the Processing | `/processing` | Live |
| Inside the Agent | `/agent` | Coming soon |
| Inside the Memory | `/memory` | Coming soon |
| Inside the Algorithms | `/algorithms` | Coming soon |
| Inside the Frontier | `/frontier` | Coming soon |

## Tech

| Layer | Stack |
|---|---|
| Frontend | Next.js 14, TypeScript, CSS Modules |
| Backend | FastAPI, nnsight, PyTorch, HuggingFace Transformers |
| Transport | WebSocket with typed frame protocol |
| Frontend deploy | Vercel |
| Backend deploy | Fly.io (1 GB RAM, always-on) |
