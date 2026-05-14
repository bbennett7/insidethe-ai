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
├── todos/                  ← issue tracking (numbered, prioritized, YAML frontmatter)
├── docs/
│   ├── plans/              ← implementation plans
│   └── solutions/          ← documented solutions organized by category with YAML frontmatter (module, tags, problem_type)
├── frontend/               ← Next.js app
│   ├── app/                ← App Router pages
│   │   ├── layout.tsx      ← shared layout: nav + bg canvas
│   │   ├── page.tsx        ← landing page (portals)
│   │   ├── processing/
│   │   │   └── page.tsx    ← Inside the Processing (active)
│   │   └── transformer/
│   │       └── page.tsx    ← Inside the Transformer (coming soon)
│   ├── components/
│   │   ├── Wordmark.tsx          ← token-row wordmark component
│   │   ├── BackgroundCanvas.tsx  ← gravitational lensing grid canvas
│   │   ├── Nav.tsx               ← top nav bar
│   │   └── processing/
│   │       ├── InputPanel.tsx
│   │       ├── LayerCard.tsx
│   │       └── ...
│   ├── hooks/
│   │   └── useProcessingSocket.ts  ← WebSocket client hook
│   ├── lib/
│   │   ├── processingTypes.ts    ← shared TypeScript types
│   │   └── canvasTheme.ts        ← canvas color/theme utilities
│   ├── styles/
│   │   └── tokens.css            ← design system CSS variables (extracted from style system)
│   ├── mocks/              ← HTML design mocks (source of truth for UI)
│   │   ├── insidethe-ai-style-system.html
│   │   ├── landing-mock-01.html  ← finalized landing page design
│   │   └── ...
│   └── public/
└── backend/
    ├── main.py             ← FastAPI app entry point
    ├── routers/
    │   └── processing.py   ← WebSocket route handler
    ├── experiences/
    │   └── processing/
    │       ├── runner.py   ← nnsight GPT-2 wrapper + forward pass hooks
    │       └── streamer.py ← streams layer activations over WebSocket
    └── requirements.txt
```

---

## Design System

Always refer to `frontend/mocks/insidethe-ai-style-system.html` for the source of truth. The full token set is in `frontend/styles/tokens.css` — it includes light mode overrides (`html.light`) with different values for `--bg`, `--acid`, and all surface/ink tokens. Key tokens:

```css
/* Surfaces */
--bg:           #0a0a0a   /* page background */
--surface-1:    #111111   /* cards, panels */
--surface-2:    #1a1a1a
--surface-3:    #222222

/* Ink */
--ink:          #f5f5f0   /* primary text */
--ink-muted:    #888888
--ink-quiet:    #555555

/* Accent */
--acid:         #c4ff3d   /* THE brand color — use sparingly */

/* Semantic / data visualization */
--warm:         #ff6b3d   /* high-activation heatmap */
--cool:         #3da9ff   /* low-activation heatmap */
--positive:     #7dd87d
--negative:     #ff5e6c

/* Type */
--font-display: 'Fraunces'      /* headlines */
--font-body:    'Newsreader'    /* body / italic labels */
--font-mono:    'JetBrains Mono' /* code, data, wordmark */
```

**Wordmark** — always rendered as four token chips with IDs floating above:
- `in` (2294) · `side` (3349) · `the` (1820) · `.ai` (13, acid accent)

**Background** — every page uses the gravitational lensing grid canvas (`BackgroundCanvas.tsx`). The grid is a warped Cartesian grid bent toward a central void. See `frontend/mocks/landing-mock-01.html` JS for the exact algorithm.

**Header** — every page has the same fixed nav: wordmark left, status indicator right, solid `--bg` background, 1px bottom border.

---

## Entrance Points

| # | Name | Route | Status | Description |
|---|---|---|---|---|
| 01 | Inside the Processing | `/processing` | **Active** | Full forward pass visualization. Input → tokens → 12 layers → output |
| 02 | Inside the Transformer | `/transformer` | Coming Soon | Transformer architecture deep-dive |

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

**Server → Client (streamed in order):**
```json
{ "type": "hello",       "protocol_version": 1, "model": "gpt2", "num_layers": 12, "components_per_layer": ["ln1","attn","attn_write","ln2","mlp","mlp_write"] }

// One frame per real BPE merge stage (computed from GPT-2's actual merge rules via slow tokenizer):
{ "type": "merge_stage", "items": [{"t": "T", "sp": false, "m": false}, {"t": "h", "sp": false, "m": false}, ...] }
{ "type": "merge_stage", "items": [{"t": "Th", "sp": false, "m": true}, {"t": "e", "sp": false, "m": false}, ...] }
...
{ "type": "tokens",      "data": [{"text": "The", "id": 464}, ...] }

// One embed frame per input token (real wte embeddings, normalized to [-1, 1]):
{ "type": "embed", "token_idx": 0, "data": [float×768] }
{ "type": "embed", "token_idx": 1, "data": [float×768] }
...

// Per layer (repeated ×12), six component frames each:
{ "type": "layer", "layer": 0, "component": "ln1",       "data": 0.42 }
{ "type": "layer", "layer": 0, "component": "attn",      "data": { "weights": [[[...12×seq×seq...]]], "heads": 12 } }
{ "type": "layer", "layer": 0, "component": "attn_write","data": [float×seq] }
{ "type": "layer", "layer": 0, "component": "ln2",       "data": 0.38 }
{ "type": "layer", "layer": 0, "component": "mlp",       "data": [float×3072] }
{ "type": "layer", "layer": 0, "component": "mlp_write", "data": [float×seq] }

{ "type": "output", "data": [{"text": "mat", "id": 2087, "prob": 0.42}, ...] }  // top-10 candidates
{ "type": "done" }

// On error:
{ "type": "error", "message": "..." }
```

**Payload shapes:**
| Frame / Component | Shape | Description |
|-----------|-------|-------------|
| `merge_stage` | `{ t, sp?, m? }[]` | One item per visible glyph. `t`=text, `sp`=space separator, `m`=just merged this step |
| `embed` | `float[768]` | Real token embedding from `wte`, each vector normalized to [-1, 1] by its own max abs value |
| `ln1` | `float` | Mean activation norm from LayerNorm 1, normalized to [0, 1] |
| `attn` | `float[heads][seq][seq]` | Attention weight matrix per head, rounded to 4 decimal places |
| `attn_write` | `float[seq]` | L2 norm of attention output per token, normalized to [0.05, 1] |
| `ln2` | `float` | Mean activation norm from LayerNorm 2, normalized to [0, 1] |
| `mlp` | `float[3072]` | Post-GELU MLP activations (last token), abs magnitude normalized to [0, 1] |
| `mlp_write` | `float[seq]` | L2 norm of MLP output per token, normalized to [0.05, 1] |

### BPE Stages (backend/experiences/processing/runner.py)

Real merge stages are computed using `GPT2Tokenizer` (slow tokenizer) before the nnsight trace. The slow tokenizer exposes `bpe_ranks` (merge priority table) and `byte_encoder`/`byte_decoder` (byte↔unicode mapping). Stages are computed word-by-word using GPT-2's actual `pat` regex for pre-tokenization and the real BPE algorithm.

### nnsight Hooks (backend/experiences/processing/runner.py)

Use nnsight's `Tracer` context to intercept:
- `model.transformer.wte` — token embedding lookup (input to the transformer)
- `model.transformer.h[i].ln_1` — LayerNorm 1 output
- `model.transformer.h[i].attn` — attention weights `[1,heads,seq,seq]` + hidden output `[1,seq,768]`
- `model.transformer.h[i].ln_2` — LayerNorm 2 output
- `model.transformer.h[i].mlp.act` — post-GELU activations `[1,seq,3072]`
- `model.transformer.h[i].mlp` — MLP block output `[1,seq,768]`

---

## Coding Conventions

- **No fake or mocked data** — every value shown to the user must come from the backend, either from the model's forward pass or nnsight hooks. Seeded RNGs, hardcoded arrays, and placeholder values are not acceptable substitutes for real activations, even for "visual" or "decorative" purposes.
- **No hard deletes** — soft deletes for any persistent data
- **No comments** unless the WHY is non-obvious
- **TypeScript strict mode** — no `any`
- **CSS Modules** for component styles, using design token CSS variables
- **No inline styles** except for dynamic values (e.g. activation magnitude as opacity)
- Server Components by default; use `'use client'` only for canvas, WebSocket, interactive state
- Python: type hints everywhere, async FastAPI handlers
- The `BackgroundCanvas` component must be a client component with `useEffect` + `requestAnimationFrame`

---

## Git Workflow

Always use the `/commit-review` skill when committing — never commit directly to `develop` or `main`. The flow is:

1. Do all work on a `type/description` feature branch (e.g. `fix/canvas-dpr`, `feat/processing-page`)
2. Run `/commit-review` to stage and commit interactively
3. Open a PR from the feature branch → **`develop`** (always `develop`, never `main` or `init`)

**Merge strategy:**
- Feature branch → `develop`: use **Squash and merge** (condenses WIP commits into one)
- `develop` → `main`: use **Create a merge commit** (preserves history, prevents squash divergence conflicts)

Branch names must follow `type/description`. Never create bare branches or commit directly to integration branches.

---

## Running Locally

```bash
# Frontend
pnpm install
pnpm dev        # http://localhost:3000

# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
```

WebSocket endpoint: `ws://localhost:8080/ws`
