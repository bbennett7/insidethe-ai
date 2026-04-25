---
plan: docs/plans/2026-04-22-001-feat-websocket-client-integration-plan.md
phase: Phase 1 — Backend fixes + hook skeleton
status: pending
date: 2026-04-22
---

# Phase Brief: Phase 1 — Backend fixes + hook skeleton

## Goal

Fix the three contract mismatches in the backend, define the `ServerMessage` discriminated union type, and build the complete `useProcessingSocket` hook. By the end of this phase the hook exists, is instantiated in `page.tsx`, and its output is visible in `StreamView` — but the mock animation continues to run unchanged. This isolation makes the hook testable and verifiable before any mock code is removed.

## Context from the Plan

> **Phase 1 — Backend fixes + hook skeleton (no page wiring)**
>
> Files: `backend/model.py`, `frontend/lib/websocket.ts`
>
> 1. Fix `model.py`: mlp shape → 3072, add ids to output candidates
> 2. Create `frontend/lib/websocket.ts` with `useProcessingSocket` hook
>    - WebSocket connect/disconnect lifecycle
>    - Raw message queue
>    - Speed-gated dequeue loop
>    - Layer component accumulation + all reductions
>    - All typed handler callbacks
> 3. Verify hook in isolation: connect to backend, confirm all messages arrive correctly via `StreamView`
>
> **Deliverable:** Hook wired to page for `StreamView` only, not yet replacing mock animation.

---

## Branch Strategy

Single branch — Phase 1 touches two layers (backend + frontend hook), but neither change is independently reviewable without the other. The backend fix must land before the hook can be verified.

| Branch | Scope | Merges into |
|--------|-------|-------------|
| `feat/websocket-client-phase-1` | Backend contract fixes, `ServerMessage` types, `useProcessingSocket` hook, minimal page wiring for StreamView smoke test | `processing` |

---

## Step-by-Step Approach

### Step 1 — Fix `backend/model.py`: mlp shape

**File:** `backend/model.py`, lines 78–86

Change the `mlp` mock from `[seqLen][768]` to a flat `[3072]` array of non-negative values, matching what the canvas expects (`LayerData.mlp: number[]` length 3072, described as "Post-GELU MLP hidden activations — sparse due to GELU zeroing negatives").

```python
# Before (line 79):
mlp_data = np.random.randn(seq_len, self.D_MODEL).tolist()
yield json.dumps({
    "type": "layer",
    "layer": layer_idx,
    "component": "mlp",
    "data": mlp_data,
})

# After:
# TODO: hook model.transformer.h[layer_idx].mlp.c_fc output (3072-dim pre-GELU hidden layer)
mlp_hidden = np.abs(np.random.randn(3072)).clip(0, 1).tolist()
yield json.dumps({
    "type": "layer",
    "layer": layer_idx,
    "component": "mlp",
    "data": mlp_hidden,
})
```

**Verify:** Run the backend (`uvicorn main:app --reload --port 8000`) and send a test message via wscat or the browser console. Confirm the `mlp` component in a layer message has `data.length === 3072` and all values are in `[0, 1]`.

---

### Step 2 — Fix `backend/model.py`: output candidate `id` field

**File:** `backend/model.py`, lines 99–106

Add placeholder `id` values to the output candidates. The `Candidate` type requires `id: number`. Real vocab IDs are wired when the tokenizer is integrated; for now use approximations that won't cause rendering errors.

```python
# Before (lines 100–105):
output_data = [
    {"text": "mat",   "prob": 0.42},
    {"text": "floor", "prob": 0.18},
    {"text": "chair", "prob": 0.09},
    {"text": "bed",   "prob": 0.07},
]

# After:
# TODO: replace with real softmax over vocabulary logits; IDs from real tokenizer
output_data = [
    {"text": "mat",   "id": 2603, "prob": 0.42},
    {"text": "floor", "id": 6816, "prob": 0.18},
    {"text": "chair", "id": 5118, "prob": 0.09},
    {"text": "bed",   "id": 3996, "prob": 0.07},
]
```

**Verify:** Same wscat/console test as Step 1 — confirm `output` message candidates each have an `id` field.

---

### Step 3 — Add `ServerMessage` discriminated union to `processingTypes.ts`

**File:** `frontend/lib/processingTypes.ts`

Add the following after the existing `StreamFrame` interface (around line 44, before `LayerData`). This gives the hook a typed representation of every message the server sends.

```typescript
export type LayerComponent = 'ln1' | 'attn' | 'attn_write' | 'ln2' | 'mlp' | 'mlp_write'

// Raw shapes from the wire — each LayerComponent has a different data shape
type RawAttnData = { weights: number[][][]; heads: number }
type RawLNData = number[][]        // [seqLen][d_model] — reduced to scalar in hook
type RawMlpData = number[]         // [3072] after Step 1 fix
type RawWriteData = number[]       // [seqLen]

type RawLayerData =
  | { component: 'ln1';        data: RawLNData }
  | { component: 'ln2';        data: RawLNData }
  | { component: 'attn';       data: RawAttnData }
  | { component: 'attn_write'; data: RawWriteData }
  | { component: 'mlp';        data: RawMlpData }
  | { component: 'mlp_write';  data: RawWriteData }

// Raw output candidate shape from the wire (note: 'prob' not 'probability')
export interface RawCandidate {
  text: string
  id: number
  prob: number
}

export type ServerMessage =
  | { type: 'tokens';  data: Token[] }
  | ({ type: 'layer';  layer: number } & RawLayerData)
  | { type: 'output';  data: RawCandidate[] }
  | { type: 'done' }
```

**Verify:** `pnpm tsc --noEmit` in `frontend/` passes with no new errors.

---

### Step 4 — Create `frontend/hooks/useProcessingSocket.ts`

**New file.** Hooks live in `frontend/hooks/` (following `useZoom.ts` at `frontend/hooks/useZoom.ts`). Import path in page.tsx will be `@/hooks/useProcessingSocket`.

> Note: AGENTS.md lists this as `lib/websocket.ts`, but the actual hook convention in this codebase is `hooks/`. Follow the codebase.

#### 4a — File scaffold and types

```typescript
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  Candidate,
  LayerComponent,
  LayerData,
  RawCandidate,
  ServerMessage,
  Token,
} from '@/lib/processingTypes'

const LAYER_COMPONENTS: LayerComponent[] = [
  'ln1', 'attn', 'attn_write', 'ln2', 'mlp', 'mlp_write',
]
const WS_URL = 'ws://localhost:8000/ws'

export interface ProcessingSocketHandlers {
  onTokens: (tokens: Token[]) => void
  onLayerStart: (layerIdx: number) => void
  onLayerComplete: (layerIdx: number, data: LayerData) => void
  onOutput: (candidates: Candidate[]) => void
  onDone: () => void
  onRawMessage?: (msg: ServerMessage) => void  // for StreamView smoke test
  onError?: (err: Event) => void
}

export interface ProcessingSocketReturn {
  run: (text: string) => void
  cancel: () => void
  notifySpeedChange: () => void
  isConnected: boolean
}
```

#### 4b — `reduceLNMatrix` and `mergeComponent` helpers

These are pure functions — defined outside the hook, not exported.

```typescript
function reduceLNMatrix(matrix: number[][]): number {
  if (matrix.length === 0) return 0
  const dim = matrix[0].length
  const mean =
    matrix.reduce((sum, row) => {
      const norm = Math.sqrt(row.reduce((s, v) => s + v * v, 0))
      return sum + norm
    }, 0) / matrix.length
  return Math.min(1, mean / Math.sqrt(dim))
}

function layerComponentDelay(speed: number): number {
  // Divides the per-layer budget (~2440ms at speed=0) across 6 components
  return Math.round((1 - speed) * (2440 / 6) + 10)
}

function mergeComponent(
  partial: Partial<LayerData>,
  msg: Extract<ServerMessage, { type: 'layer' }>
): Partial<LayerData> {
  switch (msg.component) {
    case 'ln1':
      return { ...partial, ln1: reduceLNMatrix(msg.data as number[][]) }
    case 'ln2':
      return { ...partial, ln2: reduceLNMatrix(msg.data as number[][]) }
    case 'attn': {
      const d = msg.data as { weights: number[][][]; heads: number }
      return { ...partial, attn: d.weights }
    }
    case 'attn_write':
      return { ...partial, attn_write: msg.data as number[] }
    case 'mlp':
      return { ...partial, mlp: msg.data as number[] }
    case 'mlp_write':
      return { ...partial, mlp_write: msg.data as number[] }
  }
}

function remapCandidates(raw: RawCandidate[]): Candidate[] {
  return raw.map(c => ({ text: c.text, id: c.id, probability: c.prob }))
}
```

#### 4c — Hook body: refs and state

```typescript
export function useProcessingSocket(
  handlers: ProcessingSocketHandlers,
  speedRef: React.MutableRefObject<number>
): ProcessingSocketReturn {
  const wsRef = useRef<WebSocket | null>(null)
  // Tagged queue: each entry carries the generation that enqueued it
  const queueRef = useRef<Array<ServerMessage & { _gen: number }>>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const partialLayersRef = useRef<Map<number, Partial<LayerData>>>(new Map())
  const receivedRef = useRef<Map<number, Set<LayerComponent>>>(new Map())
  const generationRef = useRef(0)
  const cancelledRef = useRef(false)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers  // keep stable ref so processNext never captures stale callbacks

  const [isConnected, setIsConnected] = useState(false)
```

> `handlersRef` is the dual-write pattern applied to the handlers object — the `processNext` loop references `handlersRef.current` so it always calls the latest callbacks without needing to be recreated.

#### 4d — `dispatch` function

```typescript
  function dispatch(msg: ServerMessage) {
    handlersRef.current.onRawMessage?.(msg)

    if (msg.type === 'tokens') {
      handlersRef.current.onTokens(msg.data)
      return
    }

    if (msg.type === 'layer') {
      const idx = msg.layer
      if (!partialLayersRef.current.has(idx)) {
        // Guard: ignore late/duplicate messages for already-completed layers
        // (can't happen with current sequential backend, but defensive)
        const received = receivedRef.current.get(idx)
        if (received && LAYER_COMPONENTS.every(c => received.has(c))) return
      }
      const partial = partialLayersRef.current.get(idx) ?? {}
      const received = receivedRef.current.get(idx) ?? new Set<LayerComponent>()

      if (received.size === 0) handlersRef.current.onLayerStart(idx)

      const next = mergeComponent(partial, msg)
      partialLayersRef.current.set(idx, next)
      received.add(msg.component)
      receivedRef.current.set(idx, received)

      if (LAYER_COMPONENTS.every(c => received.has(c))) {
        handlersRef.current.onLayerComplete(idx, next as LayerData)
        partialLayersRef.current.delete(idx)
        receivedRef.current.delete(idx)
      }
      return
    }

    if (msg.type === 'output') {
      handlersRef.current.onOutput(remapCandidates(msg.data))
      return
    }

    if (msg.type === 'done') {
      handlersRef.current.onDone()
    }
  }
```

#### 4e — `processNext` dequeue loop

```typescript
  const processNext = useCallback(() => {
    if (cancelledRef.current || queueRef.current.length === 0) {
      timerRef.current = null
      return
    }

    const entry = queueRef.current.shift()!
    if (entry._gen !== generationRef.current) {
      // Stale message from a previous run — skip, keep draining
      timerRef.current = setTimeout(processNext, 0)
      return
    }

    dispatch(entry)

    const delay = entry.type === 'layer' ? layerComponentDelay(speedRef.current) : 0
    timerRef.current = setTimeout(processNext, delay)
  }, [])  // empty deps — reads everything through refs
```

#### 4f — `run`, `cancel`, `notifySpeedChange`

```typescript
  const run = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    generationRef.current += 1
    cancelledRef.current = false
    queueRef.current = []
    partialLayersRef.current.clear()
    receivedRef.current.clear()
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    wsRef.current.send(JSON.stringify({ type: 'run', text }))
  }, [])

  const cancel = useCallback(() => {
    cancelledRef.current = true
    queueRef.current = []
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const notifySpeedChange = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(processNext, layerComponentDelay(speedRef.current))
    }
  }, [processNext])
```

#### 4g — `useEffect` for WebSocket lifecycle

```typescript
  useEffect(() => {
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => setIsConnected(true)

    ws.onmessage = (e: MessageEvent) => {
      let parsed: ServerMessage
      try {
        parsed = JSON.parse(e.data as string) as ServerMessage
      } catch {
        return  // malformed — skip silently
      }
      queueRef.current.push({ ...parsed, _gen: generationRef.current })
      if (timerRef.current === null && !cancelledRef.current) {
        timerRef.current = setTimeout(processNext, 0)
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
    }

    ws.onerror = (e) => {
      setIsConnected(false)
      handlersRef.current.onError?.(e)
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      ws.close()
    }
  }, [processNext])

  return { run, cancel, notifySpeedChange, isConnected }
}
```

**Verify:** `pnpm tsc --noEmit` passes. No `any` types. The hook compiles cleanly in isolation.

---

### Step 5 — Minimal page.tsx wiring for smoke test

**File:** `frontend/app/processing/page.tsx`

Add `useProcessingSocket` call with handlers that **only** populate `streamFrames` and update `streamLive`. The mock animation (`animateLayers`, `startRun`, etc.) continues to run entirely unchanged.

```typescript
// Add import at top
import { useProcessingSocket } from '@/hooks/useProcessingSocket'

// Inside ProcessPage(), after the existing state/ref declarations:
const socket = useProcessingSocket(
  {
    onTokens: () => {},          // no-op — mock still handles tokens
    onLayerStart: () => {},      // no-op — animateLayers still handles cursor
    onLayerComplete: () => {},   // no-op — genLayerData still provides data
    onOutput: () => {},          // no-op — OUTPUT_SEQUENCES still cycles
    onDone: () => {},            // no-op — animateLayers terminal case still fires
    onRawMessage: (msg) => {
      // Only purpose: show real server messages in StreamView
      streamCountRef.current += 1
      setStreamFrames(prev => [
        ...prev,
        {
          num: streamCountRef.current,
          ms: Date.now() - streamStartRef.current,
          payload: msg as Record<string, unknown>,
        },
      ])
    },
    onError: () => setStreamLive(false),
  },
  speedRef
)

// Update handleRun to also call socket.run() after starting mock animation:
// (Add after the existing `startRun(promptText)` call inside requestAnimationFrame)
socket.run(promptText)

// Update streamLive to also reflect socket connection:
// Replace the hardcoded setStreamLive(true) with:
setStreamLive(socket.isConnected)
```

> This wiring is **intentionally redundant** — both mock and real runs fire simultaneously. The mock animation drives the UI; the socket just populates the stream log with real backend messages. Phase 2 removes the mock and promotes the socket handlers to drive everything.

**Verify:**
1. Start the backend: `cd backend && uvicorn main:app --reload --port 8000`
2. Start the frontend: `cd frontend && pnpm dev`
3. Submit a prompt
4. Switch to the "Response" tab in the right panel
5. Confirm stream frames appear with real backend message shapes (layer, tokens, output, done)
6. Confirm frame timestamps are realistic (not all 0ms)
7. The left panel animation and layer cards still work as before (mock path unchanged)

---

## Unknowns

| Unknown | Why it matters | How to resolve |
|---------|----------------|----------------|
| `streamLive` should reflect socket connection state, not mock state | Currently hardcoded to `true` in `handleRun` | Use `socket.isConnected` — but `isConnected` is React state and the hook is called at component level, so it's always available. Verify the `streamLive` indicator responds to backend up/down. |
| `RawLayerData` type narrowing with `msg.component` discriminant | TypeScript must narrow `msg.data` type from the discriminated union in `mergeComponent` | The type cast (`msg.data as number[][]`) is acceptable given the wire is trusted. Verify `tsc --noEmit` passes without `any`. |
| `processNext` as `useCallback(fn, [])` — stale closure risk | The function body references `speedRef`, `cancelledRef`, `queueRef` etc. — all refs, so no staleness. But `dispatch` calls `handlersRef.current`. | Confirmed: all mutable values accessed through refs. `useCallback(fn, [])` is correct here, same pattern as `animateLayers` in page.tsx. |

---

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| `backend/model.py` | Modified | `mlp` mock sends `[3072]` floats; output candidates include `id` |
| `frontend/lib/processingTypes.ts` | Modified | `LayerComponent`, `RawCandidate`, `ServerMessage` union added |
| `frontend/hooks/useProcessingSocket.ts` | New file | Complete `useProcessingSocket` hook |
| `frontend/app/processing/page.tsx` | Modified | Hook instantiated; `onRawMessage` populates `streamFrames`; `socket.run()` called in `handleRun` |

---

## Done Criteria

The phase is complete when **all** of the following are true:

- [ ] `pnpm tsc --noEmit` in `frontend/` passes with zero errors
- [ ] Backend `mlp` message has `data.length === 3072` (verified via browser DevTools WebSocket inspector or wscat)
- [ ] Backend `output` candidates each include an `id` field (same verification)
- [ ] StreamView ("Response" tab) shows real server messages when a prompt is submitted — `tokens`, 72 `layer` messages, `output`, `done` — all timestamped correctly
- [ ] The layer animation, input tokens, and output tokens in the UI are **unchanged** from before (mock path untouched)
- [ ] `streamLive` indicator shows `live` during a run and `idle` when the backend is unreachable
- [ ] No TypeScript `any` introduced in the new hook file

---

## What This Phase Does NOT Include

- Removing `animateLayers`, `OUTPUT_SEQUENCES`, `INPUT_TOKENS`, or any mock data — that is Phase 2
- Wiring `onLayerStart`, `onLayerComplete`, `onTokens`, `onOutput`, `onDone` to drive React state — that is Phase 2
- Multi-token decode loop via `triggerNextPass` — Phase 2
- Step mode integration with the hook — Phase 2
- `inputTokensRef` / `outputTokensRef` dual-write refs — Phase 3
- Edge case hardening (cancel-while-step, speed-mid-queue verification) — Phase 3

---

## Handoff to Next Phase

Phase 2 depends on this phase delivering:

- `useProcessingSocket` at `@/hooks/useProcessingSocket` with the exact API signature defined in Step 4a — Phase 2 will replace all the no-op handlers with real state updates
- `ServerMessage` type exported from `@/lib/processingTypes` — Phase 2 handlers type-check against it
- Backend sending correct shapes (Steps 1–2) — Phase 2 `onLayerComplete` relies on `mlp` being `[3072]` and `onOutput` relies on candidates having `id`
- The smoke-test wiring in page.tsx — Phase 2 replaces the no-op handlers in the same hook call site
