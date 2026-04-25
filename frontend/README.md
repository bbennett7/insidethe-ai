# insidethe.ai — Frontend

Next.js app that visualizes what happens inside AI models in real time. Connects to the backend via WebSocket and animates token processing, layer activations, and next-token predictions as they stream in.

## Stack

- **Next.js 14** — App Router, React Server Components where applicable
- **TypeScript** — strict mode
- **CSS Modules** — scoped styles, no utility framework
- **Biome** — linting and formatting

## Running locally

```bash
cd frontend
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The processing experience at `/processing` requires the backend to be running — see `backend/README.md`.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8080/ws` | WebSocket URL for the backend |

Copy `.env.local.example` to `.env.local` to configure locally.

## Structure

```
frontend/
├── app/
│   ├── page.tsx              ← landing page
│   ├── processing/           ← Inside the Processing experience
│   │   ├── page.tsx          ← main orchestrator — WebSocket, all state
│   │   └── page.module.css
│   ├── agent/                ← Inside the Agent (coming soon)
│   ├── memory/               ← Inside the Memory (coming soon)
│   └── layout.tsx
├── components/
│   ├── processing/           ← all processing-specific components
│   │   ├── InputPanel        ← left panel: prompt input, token display, output chips
│   │   ├── LayerCard         ← per-layer card wrapper
│   │   ├── LayerCanvas       ← canvas-based layer visualization (attention, MLP, residual)
│   │   ├── EmbeddingStrip    ← canvas strip showing token embedding vector
│   │   ├── ResponseView      ← right panel stream tab: API request/response inspector
│   │   ├── RightPanelHeader  ← model info, zoom, view toggle
│   │   └── TokenChip         ← individual token pill
│   ├── Nav                   ← shared navigation bar
│   ├── ScrollArea            ← reusable scroll container
│   └── BackgroundCanvas      ← gravitational lensing grid background
├── hooks/
│   ├── useProcessingSocket   ← WebSocket connection, message queue, speed-controlled playback
│   └── useZoom               ← zoom in/out for the layer canvas
└── lib/
    ├── processingTypes.ts    ← all TypeScript types for the WebSocket wire protocol
    ├── ThemeContext.tsx       ← light/dark mode context
    └── canvasTheme.ts        ← shared color constants for canvas components
```

## Key design decisions

**Canvas for layer visualizations** — attention matrices and residual strips are drawn on `<canvas>` rather than DOM elements. At 12 layers × 12 heads × seq² attention weights, DOM rendering would be too slow. Canvas gives us direct control over drawing, DPR scaling, and animation.

**WebSocket message queue with speed-controlled playback** — `useProcessingSocket` doesn't dispatch incoming frames immediately. It queues them and drains at a speed set by the user (0–1 slider). At max speed all delays are 0; at slow speed each layer component frame is spaced ~400ms apart. This lets visitors see each step clearly without the backend having to slow down.

**CSS Modules + design tokens** — all colors, spacing, and typography come from CSS custom properties defined in `styles/globals.css`. No Tailwind or component library — the design system is hand-built to match the visual language in `mocks/`.
