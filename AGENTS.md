# insidethe.ai — Agent Instructions

## Project Overview

**insidethe.ai** is an educational web app that visualizes the real-time internal processing of GPT-2. Users submit text and watch the model's forward pass unfold — attention heads, layer norms, MLP activations — as it happens, streamed live via nnsight.

The brand premise: the wordmark *is* the lesson. `in | side | the | .ai` — four tokens, each with its ID floating above. The site teaches what's inside language models by showing, not telling.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, CSS Modules |
| Backend | Python, FastAPI, nnsight, transformers (HuggingFace) |
| Model | `gpt2` (117M params, 12 layers, 12 heads, d_model=768) |
| Streaming | WebSockets (FastAPI + Next.js native WebSocket client) |
| Package manager | `pnpm` — always, never npm or yarn |

---

## Repository Structure

```
insidethe-ai/
├── AGENTS.md               ← you are here
├── CLAUDE.md
├── mocks/                  ← HTML design mocks (source of truth for UI)
│   ├── insidethe-ai-style-system.html
│   ├── landing-mock-01.html   ← finalized landing page design
│   └── ...
├── app/                    ← Next.js app (App Router)
│   ├── layout.tsx          ← shared layout: nav + bg canvas
│   ├── page.tsx            ← landing page (4 portals)
│   ├── processing/
│   │   └── page.tsx        ← Inside the Processing
│   ├── chip/
│   │   └── page.tsx        ← Inside the Chip (coming soon)
│   ├── algorithms/
│   │   └── page.tsx        ← Inside the Algorithms (coming soon)
│   └── agent/
│       └── page.tsx        ← Inside the Agent (coming soon)
├── components/
│   ├── Wordmark.tsx        ← token-row wordmark component
│   ├── BgCanvas.tsx        ← gravitational lensing grid canvas
│   ├── Nav.tsx             ← top nav bar
│   └── processing/
│       ├── InputPanel.tsx
│       ├── LayerStack.tsx
│       └── LayerCard.tsx
├── lib/
│   ├── websocket.ts        ← WebSocket client hook
│   └── tokens.ts           ← tokenization utilities (client-side display)
├── styles/
│   └── tokens.css          ← design system CSS variables (extracted from style system)
├── backend/
│   ├── main.py             ← FastAPI app + WebSocket endpoint
│   ├── model.py            ← nnsight GPT-2 wrapper + forward pass hooks
│   ├── streamer.py         ← streams layer activations over WebSocket
│   └── requirements.txt
└── public/
```

---

## Design System

Always refer to `mocks/insidethe-ai-style-system.html` for the source of truth. Key tokens:

```css
--bg:           #0a0a0a   /* page background */
--surface-1:    #111111   /* cards, panels */
--acid:         #c4ff3d   /* THE brand color — use sparingly */
--ink:          #f5f5f0   /* primary text */
--ink-muted:    #888888
--ink-quiet:    #555555

--font-display: 'Fraunces'      /* headlines */
--font-body:    'Newsreader'    /* body / italic labels */
--font-mono:    'JetBrains Mono' /* code, data, wordmark */
```

**Wordmark** — always rendered as four token chips with IDs floating above:
- `in` (2294) · `side` (3349) · `the` (1820) · `.ai` (13, acid accent)

**Background** — every page uses the gravitational lensing grid canvas (`BgCanvas.tsx`). The grid is a warped Cartesian grid bent toward a central void. See `landing-mock-01.html` JS for the exact algorithm.

**Header** — every page has the same fixed nav: wordmark left, status indicator right, solid `--bg` background, 1px bottom border.

---

## The Four Entrance Points

| # | Name | Route | Status | Description |
|---|---|---|---|---|
| 01 | Inside the Processing | `/processing` | **Active** | Full forward pass visualization. Input → tokens → 12 layers → output |
| 02 | Inside the Chip | `/chip` | Coming Soon | Hardware-level: matrix ops, memory, silicon |
| 03 | Inside the Algorithms | `/algorithms` | Coming Soon | Training dynamics: loss landscape, gradients, optimizers |
| 04 | Inside the Agent | `/agent` | Coming Soon | Agentic loops: perception, reasoning, tool use, action |

---

## Inside the Processing — Architecture

This is the active section. Layout is two-column, full-viewport:

**Left panel** (fixed ~420px, solid `--bg`, black):
1. Text input (design system prompt input style)
2. Tokenized input — tokens rendered as chips with IDs
3. Output — predicted next tokens with probability bars

**Right panel** (fills remaining width, wavy grid background visible):
- 12 `LayerCard` components stacked vertically, scrollable
- Each layer card shows in order: `LayerNorm 1` → `Multi-Head Attention` (12 heads) → `LayerNorm 2` → `MLP (FFN)`
- During processing: activations stream in from the backend, cells light up in acid green proportional to activation magnitude
- A "cursor" highlights the currently-computing layer

### WebSocket Message Protocol

**Client → Server:**
```json
{ "type": "run", "text": "The cat sat on the mat" }
```

**Server → Client (streamed):**
```json
{ "type": "tokens",   "data": [{"text": "The", "id": 464}, ...] }
{ "type": "layer",    "layer": 0, "component": "ln1",  "data": [...] }
{ "type": "layer",    "layer": 0, "component": "attn", "data": { "weights": [[...]], "heads": 12 } }
{ "type": "layer",    "layer": 0, "component": "ln2",  "data": [...] }
{ "type": "layer",    "layer": 0, "component": "mlp",  "data": [...] }
{ "type": "output",   "data": [{"text": "mat", "prob": 0.42}, ...] }
{ "type": "done" }
```

### nnsight Hooks (backend/model.py)

Use nnsight's `Tracer` context to intercept:
- `model.transformer.h[i].ln_1` — LayerNorm 1 output
- `model.transformer.h[i].attn` — attention weights + outputs  
- `model.transformer.h[i].ln_2` — LayerNorm 2 output
- `model.transformer.h[i].mlp` — MLP output

---

## Coding Conventions

- **No hard deletes** — soft deletes for any persistent data
- **No comments** unless the WHY is non-obvious
- **TypeScript strict mode** — no `any`
- **CSS Modules** for component styles, using design token CSS variables
- **No inline styles** except for dynamic values (e.g. activation magnitude as opacity)
- Server Components by default; use `'use client'` only for canvas, WebSocket, interactive state
- Python: type hints everywhere, async FastAPI handlers
- The `BgCanvas` component must be a client component with `useEffect` + `requestAnimationFrame`

---

## Running Locally

```bash
# Frontend
pnpm install
pnpm dev        # http://localhost:3000

# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

WebSocket endpoint: `ws://localhost:8000/ws`
