---
title: "feat: WebSocket client integration for processing page"
type: feat
status: active
date: 2026-04-22
---

# feat: WebSocket client integration for processing page

## Overview

Replace the mock-driven `setTimeout` animation chains in `frontend/app/processing/page.tsx` with a real WebSocket client that connects to `ws://localhost:8000/ws`. The mock data currently drives all animation timing and all visual content. After this change, the server drives content while the client retains full control over playback speed and step mode.

---

## Problem Statement

The processing page is fully functional visually, but every data value and timing event is synthetic. Three issues block shipping:

1. **No real data** — `INPUT_TOKENS`, `OUTPUT_SEQUENCES`, and `genLayerData` all return hardcoded or random values. The server already streams real GPT-2 activations (well, mocked for now, but the protocol is defined and the real nnsight hooks are stubbed).
2. **Speed control is client-side only** — the current `animateLayers` loop uses `speedRef` to pace `setTimeout` delays. This mechanism works but will need to survive the transition to server-pushed messages.
3. **Three backend contract mismatches** must be resolved before a single real message can be consumed correctly (see Contract Mismatches below).

---

## Proposed Solution

### Architecture

```
WebSocket message
      │
      ▼
  Raw queue (ref)           ← onmessage pushes here immediately
      │
      ▼
  Dequeue loop              ← reads speedRef.current each tick
  (layer msgs: speed-gated)
  (tokens/output/done: immediate)
      │
      ▼
  Typed handlers in page.tsx
  (onTokens, onLayerStart, onLayerComplete, onOutput, onDone)
      │
      ▼
  React state updates → canvas re-renders
```

A single hook — `useProcessingSocket` in `frontend/lib/websocket.ts` — owns the WebSocket, the raw queue, and the dequeue loop. The page supplies handler callbacks. Speed control is preserved by having the dequeue loop read `speedRef.current` on each invocation.

---

## Contract Mismatches — Full Resolution Table

These must be resolved before any real message can flow into the canvas.

| Field | Backend sends | LayerData expects | Resolution |
|---|---|---|---|
| `ln1` | `float[seqLen][768]` | `number` (scalar, [0,1]) | Reduce in hook: mean of row L2 norms, normalised by `sqrt(768)`. See helper `reduceLNMatrix` below. |
| `ln2` | `float[seqLen][768]` | `number` (scalar, [0,1]) | Same reduction as `ln1`. |
| `mlp` | `float[seqLen][768]` | `number[3072]` | **Fix backend mock** to send `np.abs(np.random.randn(3072)).clip(0,1).tolist()`. Real nnsight hook: `model.transformer.h[i].mlp.c_fc` output (3072-dim pre-GELU). Update `model.py` as part of this work. |
| `output[].prob` | `"prob": 0.42` | `Candidate.probability` | Remap in hook: `{ text, id, probability: c.prob }`. |
| `output[].id` | missing | `Candidate.id: number` | **Fix backend mock** to include token IDs. Add `id: vocab_id` to each candidate in `model.py`. Placeholder `id: 0` until real vocab lookup is wired. |

### `reduceLNMatrix` helper (lives in `websocket.ts`)

```typescript
function reduceLNMatrix(matrix: number[][]): number {
  if (matrix.length === 0) return 0
  const dim = matrix[0].length
  const mean = matrix.reduce((sum, row) => {
    const norm = Math.sqrt(row.reduce((s, v) => s + v * v, 0))
    return sum + norm
  }, 0) / matrix.length
  return Math.min(1, mean / Math.sqrt(dim))
}
```

This gives a scale-independent scalar in [0,1]: `sqrt(768) ≈ 27.7` is the expected L2 norm of a unit-variance 768-dim vector.

---

## Technical Approach

### 1. `useProcessingSocket` Hook — `frontend/lib/websocket.ts`

#### Public API

```typescript
interface ProcessingSocketHandlers {
  onTokens: (tokens: Token[]) => void
  onLayerStart: (layerIdx: number) => void
  onLayerComplete: (layerIdx: number, data: LayerData) => void
  onOutput: (candidates: Candidate[]) => void
  onDone: () => void
  onError?: (err: Event) => void
}

interface ProcessingSocketReturn {
  run: (text: string) => void
  cancel: () => void
  isConnected: boolean
}

export function useProcessingSocket(
  handlers: ProcessingSocketHandlers,
  speedRef: React.MutableRefObject<number>
): ProcessingSocketReturn
```

The hook accepts `speedRef` (not `speed`) so the dequeue loop always reads the live value without needing to be recreated on each speed change.

#### Internal Structure

```typescript
// Refs — not state, never trigger re-renders
const wsRef = useRef<WebSocket | null>(null)
const queueRef = useRef<ServerMessage[]>([])
const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
const partialLayersRef = useRef<Map<number, Partial<LayerData>>>(new Map())
const receivedComponentsRef = useRef<Map<number, Set<LayerComponent>>>(new Map())
const cancelledRef = useRef(false)

// State — only isConnected needs to drive re-renders
const [isConnected, setIsConnected] = useState(false)
```

#### Connection lifecycle

- **Mount**: `new WebSocket('ws://localhost:8000/ws')`, set `onopen`/`onmessage`/`onclose`/`onerror`
- **`onopen`**: set `isConnected = true`
- **`onmessage`**: `JSON.parse(e.data)` → push to `queueRef.current` → if timer not running, start `processNext()`
- **`onclose`/`onerror`**: set `isConnected = false`, call `handlers.onError` if provided
- **Unmount**: close WebSocket, clear timer

No auto-reconnect. The `streamLive` indicator in `RightPanelHeader` drops to `idle` when the connection closes — users see the state and can reload.

#### Message queue and speed-gated dequeue

```typescript
function processNext() {
  if (cancelledRef.current || queueRef.current.length === 0) {
    timerRef.current = null
    return
  }

  const msg = queueRef.current.shift()!
  dispatch(msg)  // processes the message, updates accumulated layer state

  // Layer messages get speed-gated delay; all other messages are immediate
  const delay = msg.type === 'layer' ? layerComponentDelay(speedRef.current) : 0
  timerRef.current = setTimeout(processNext, delay)
}
```

`layerComponentDelay(speed)` = `Math.round((1 - speed) * (2440 / 6) + 10)` — divides the per-layer delay by 6 (the number of components per layer), so a full layer takes approximately the same time as the current `layerDelay`. At speed=1: ~10ms/component; at speed=0: ~417ms/component (~2500ms/layer).

#### Layer accumulation

```typescript
const LAYER_COMPONENTS: LayerComponent[] = ['ln1', 'attn', 'attn_write', 'ln2', 'mlp', 'mlp_write']

function dispatch(msg: ServerMessage) {
  if (msg.type === 'layer') {
    const { layer: idx, component, data } = msg
    const partial = partialLayersRef.current.get(idx) ?? {}
    const received = receivedComponentsRef.current.get(idx) ?? new Set()

    // Announce layer start on first component
    if (received.size === 0) handlers.onLayerStart(idx)

    // Merge component into partial
    partialLayersRef.current.set(idx, mergeComponent(partial, component, data))
    received.add(component)
    receivedComponentsRef.current.set(idx, received)

    // Fire complete when all 6 arrive
    if (LAYER_COMPONENTS.every(c => received.has(c))) {
      handlers.onLayerComplete(idx, partialLayersRef.current.get(idx) as LayerData)
      partialLayersRef.current.delete(idx)
      receivedComponentsRef.current.delete(idx)
    }
  }
  // ... tokens, output, done handlers
}
```

`mergeComponent` applies the contract reductions (`reduceLNMatrix` for ln1/ln2, direct assignment for others).

#### `run(text)` method

```typescript
function run(text: string) {
  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
  cancelledRef.current = false
  queueRef.current = []  // drain any leftover messages from previous run
  partialLayersRef.current.clear()
  receivedComponentsRef.current.clear()
  wsRef.current.send(JSON.stringify({ type: 'run', text }))
}
```

Uses a `generationRef` to fence out messages from previous runs. `run()` increments the generation counter; `processNext` checks the counter matches before dispatching. This handles the race where old messages from a previous run are still in-flight when a new run starts — they are silently discarded.

```typescript
const generationRef = useRef(0)

function run(text: string) {
  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
  generationRef.current += 1
  const generation = generationRef.current
  cancelledRef.current = false
  queueRef.current = []
  partialLayersRef.current.clear()
  receivedComponentsRef.current.clear()
  wsRef.current.send(JSON.stringify({ type: 'run', text }))
}
```

Each queued message is tagged with the generation at enqueue time:
```typescript
// onmessage
queueRef.current.push({ ...parsed, _gen: generationRef.current })

// processNext
const msg = queueRef.current.shift()!
if (msg._gen !== generationRef.current) { scheduleNext(0); return }  // stale, skip
```

#### `cancel()` method

```typescript
function cancel() {
  cancelledRef.current = true
  queueRef.current = []
  if (timerRef.current) {
    clearTimeout(timerRef.current)
    timerRef.current = null
  }
}
```

Does not close the WebSocket — connection stays open for the next run.

#### Speed change mid-queue

When `speedRef` changes while the dequeue loop is running, the already-scheduled `setTimeout` has the old delay baked in. To make the new speed take effect immediately, the hook exposes an `onSpeedChange` signal:

```typescript
// Called from handleSpeedChange in page.tsx after updating speedRef
function notifySpeedChange() {
  if (timerRef.current !== null) {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(processNext, layerComponentDelay(speedRef.current))
  }
}
```

This cancels the pending timer and reschedules with the fresh delay. The hook's return type gains `notifySpeedChange`. `handleSpeedChange` in page.tsx calls it after updating `speedRef`.

---

### 2. `page.tsx` Refactor

#### What gets removed

| Mock import | Used for | Replaced by |
|---|---|---|
| `OUTPUT_SEQUENCES` | Fake output token candidates | `onOutput(candidates)` from server |
| `INPUT_TOKENS` | Hardcoded input tokens + seq length | `onTokens(tokens)` from server |
| `genLayerData` (inside animateLayers) | Refresh layer data after each decode pass | `onLayerComplete` with real data |
| `animateLayers` (entire function) | Layer cursor sweep + output generation | `onLayerStart` / `onLayerComplete` / `onDone` handlers |

#### What stays (mock data kept as decorative)

| Mock import | Used for | Reason to keep |
|---|---|---|
| `MERGE_STAGES` | BPE tokenization animation | Backend doesn't stream merge steps; educational value justifies it |
| `genLayerData` (for `INITIAL_LAYER_DATA` only) | Initial placeholder canvas state | Provides sensible dim placeholder until real data arrives |

#### New handlers wired to the hook

```typescript
// onTokens: real tokens from server replace hardcoded INPUT_TOKENS
onTokens: (tokens) => {
  setInputTokens(tokens)
  seqLenRef.current = tokens.length
  setProcessState('embedding')
  // embedding animation plays for a fixed visual beat, then computing starts
  animTimeoutRef.current = setTimeout(
    () => {
      setProcessState('computing')
      streamCountRef.current += 1
      appendStreamFrame({ type: 'computing', seq_len: tokens.length })
    },
    stageDelay(speedRef.current) + tokens.length * 55 + 200
  )
}

// onLayerStart: advance cursor
onLayerStart: (layerIdx) => {
  setLayerStates(prev => {
    const next = [...prev]
    if (layerIdx > 0) next[layerIdx - 1] = 'done'
    next[layerIdx] = 'processing'
    for (let i = layerIdx + 1; i < NUM_LAYERS; i++) next[i] = 'inactive'
    return next
  })
}

// onLayerComplete: real activations replace genLayerData
onLayerComplete: (layerIdx, data) => {
  setLayerData(prev => {
    const next = [...prev]
    next[layerIdx] = data
    return next
  })
}

// onOutput: real candidates from server replace OUTPUT_SEQUENCES
onOutput: (candidates) => {
  const top = candidates[0]
  const newToken: OutputToken = { text: top.text, id: top.id, candidates }
  setOutputTokens(prev => [...prev, newToken])
  tokenGenRef.current += 1
  setTokenGenCount(tokenGenRef.current)
  appendStreamFrame({ type: 'token', text: top.text, id: top.id, p: top.probability })
}

// onDone: one forward pass complete — loop or pause
onDone: () => {
  setLayerStates(Array(NUM_LAYERS).fill('done'))
  const nextT = seqLenRef.current + 1
  seqLenRef.current = nextT

  if (isStepModeRef.current) {
    setAwaitingStep(true)
    awaitingStepRef.current = true
  } else {
    // Queue next decode pass after a visual beat
    const d = layerDelay(speedRef.current)
    animTimeoutRef.current = setTimeout(() => {
      triggerNextPass()
    }, d * 2 + 400)
  }
}
```

#### Multi-token decode loop

`triggerNextPass()` constructs the next prompt by joining all tokens so far:

```typescript
const triggerNextPass = useCallback(() => {
  const allTokens = [
    ...inputTokensRef.current.map(t => t.text),
    ...outputTokensRef.current.map(t => t.text),
  ]
  setProcessState('computing')
  setLayerStates(Array(NUM_LAYERS).fill('inactive'))
  socket.run(allTokens.join(' '))
}, [socket])
```

`inputTokensRef` and `outputTokensRef` are ref mirrors of the corresponding state, following the same dual-write pattern as `speedRef`.

`handleStepNext` calls `triggerNextPass()` after clearing `awaitingStep`.

#### Removal of `updateLayerData` stub

The existing stub (lines 87–97, currently suppressed with `void updateLayerData`) is replaced by the inline `setLayerData` update in `onLayerComplete`. Delete the stub.

---

### 3. Backend Fixes — `backend/model.py`

Two changes needed as part of this work:

**Fix 1: `mlp` mock shape** (line 80–86)
```python
# Before
mlp_data = np.random.randn(seq_len, self.D_MODEL).tolist()
yield json.dumps({"type": "layer", "layer": layer_idx, "component": "mlp", "data": mlp_data})

# After — 3072-dim post-GELU hidden activations (always positive after GELU)
mlp_hidden = np.abs(np.random.randn(3072)).clip(0, 1).tolist()
yield json.dumps({"type": "layer", "layer": layer_idx, "component": "mlp", "data": mlp_hidden})
```

**Fix 2: `output` missing `id`** (line 100–106)
```python
# Before
output_data = [
    {"text": "mat",   "prob": 0.42},
    ...
]

# After — add placeholder IDs (real vocab IDs wired when tokenizer is integrated)
output_data = [
    {"text": "mat",   "id": 8116, "prob": 0.42},
    {"text": "floor", "id": 12floor_id, "prob": 0.18},
    ...
]
```

**Correct nnsight hook for mlp (for reference when real model is wired):**
Hook `model.transformer.h[i].mlp.act` or the output of `c_fc` (the 3072-dim intermediate layer before GELU), not the final MLP output. The final output is 768-dim.

---

## Speed Control — Deep Analysis

### Why the current approach survives

The mock's `animateLayers` reads `speedRef.current` inside each `setTimeout` callback — this is exactly why a ref (not state) was used. The same pattern is preserved in the dequeue loop: `processNext()` reads `speedRef.current` on each invocation, so changing the slider mid-run takes effect on the very next scheduled tick with zero extra wiring.

### Speed slider during live runs

With real WebSocket data:
- Backend sends messages at ~40ms intervals (`asyncio.sleep(0.04)` per component)
- At `speed=1.0`, `layerComponentDelay ≈ 10ms` — messages arrive faster than the backend sends them, so the queue depth stays near 0 (playback is real-time)
- At `speed=0.5`, `layerComponentDelay ≈ 207ms/component` — messages queue up on the client while playback slows to user-controlled pace
- At `speed=0.01` (minimum), `layerComponentDelay ≈ 413ms/component` — very slow playback; queue builds but memory cost is negligible (72 messages max per 12-layer pass)

The queue depth is bounded: a single forward pass produces at most `12 × 6 + 3 = 75` messages (`tokens` + `output` + `done`). Even at minimum speed this is trivial.

### Slider disabled during tokenizing/embedding phases

The tokenizing BPE animation and embedding beat still use `stageDelay` + `setTimeout` (same as before). Speed control during these phases is unchanged.

---

## Step Mode — Deep Analysis

Step mode pauses between complete decode passes (one full 12-layer forward pass = one output token). The mechanism is:

1. `onDone` fires → check `isStepModeRef.current`
2. If true: set `awaitingStep = true`, do NOT schedule next pass
3. User presses "Next token →" → `handleStepNext` → clear `awaitingStep`, call `triggerNextPass()`
4. `triggerNextPass` calls `socket.run(accumulatedText)`
5. New messages arrive, queue up, dequeue loop starts

**Edge case: Cancel while awaiting step**
- `handleCancel` must explicitly reset both `awaitingStep` state AND `awaitingStepRef.current = false`
- Without this, the "Next token →" button remains visible after cancel, and `handleStepNext` would call `triggerNextPass()` on a cancelled run
- `handleCancel` also calls `socket.cancel()` (drains queue) and sets `processState` to `done`

**Edge case: Toggle step mode mid-run**
- The mode toggle is disabled during active runs (`disabled={state !== 'idle' && state !== 'done'}`)
- No mid-run mode change is possible from the UI — no guard needed

---

## Connection Lifecycle

### Startup
Hook mounts → WebSocket connects → `isConnected = true` → stream status shows `idle`.

### Normal run
`handleRun` → `resetAll()` → `socket.run(text)` → messages arrive → processed per above.

### Re-run while queue has messages (user hits "Run" again)
`handleRun` calls `resetAll()` which calls `socket.cancel()` (drains queue, sets `cancelledRef = true`). Then immediately calls `socket.run(newText)` which resets `cancelledRef = false`, clears partials, and sends the new run message. Any queued messages from the old run are already dropped.

### Connection drop during run
`onclose` fires → `isConnected = false` → `streamLive = false` → stream status shows `idle`. The page is left in whatever state it was in (layer N processing). UI shows the last rendered state. User must reload to reconnect.

**No auto-reconnect** — for an educational single-page tool, simplicity wins over resilience.

### Backend stall / no `done` received
No automatic timeout is implemented in Phase 1. The "Cancel ×" button handles this by calling `socket.cancel()` and setting state to `done`. A timeout can be added in a follow-up if needed.

---

## Partial Canvas State — What the User Sees

When a run begins, all 12 layers reset to `INITIAL_LAYER_DATA` (generated by `genLayerData`, which produces visually meaningful placeholder values). As real data arrives layer by layer, each card "snaps" to real data after all 6 of its components accumulate. The effect is:

- Layers 0–N: real activation data (snapped in as the pass progresses)
- Layers N+1–11: dim placeholder state from `INITIAL_LAYER_DATA`

This is intentional: the canvas always has a valid complete `LayerData` object. No partial renders with mismatched field shapes. The `layerState` cursor (`inactive` / `processing` / `done`) remains the primary visual signal of progress.

---

## Out of Order Messages

The WebSocket protocol guarantees ordering within a single TCP connection. Since the backend yields messages sequentially (no async concurrency within a single `run()` invocation), out-of-order arrival is not possible in practice. No defensive re-ordering is implemented.

If a component arrives for a layer that already completed (e.g., a duplicate message), the `receivedComponentsRef` Set already contains it — `every(c => received.has(c))` will still be true, but the `partialLayersRef` entry will have been deleted. A guard check handles this:

```typescript
if (!partialLayersRef.current.has(idx)) return  // already completed, ignore
```

---

## System-Wide Impact

### Interaction graph
`socket.run(text)` → WebSocket `send` → backend yields messages → `onmessage` → raw queue → `processNext` timer → typed handlers → `setLayerStates` / `setLayerData` / `setOutputTokens` → React re-renders → `LayerCanvas` `useEffect` → canvas redraws.

### Error propagation
`JSON.parse` errors in `onmessage` are caught and logged; malformed messages are skipped. Unknown `type` values are silently ignored. `onError` is optional — if not provided, WebSocket errors log to console only.

### State lifecycle risks
If `cancel()` is called between `onLayerStart` and `onLayerComplete` for layer N, the partial accumulation refs are cleared. The layer state cursor may be stuck on `processing` for layer N. `resetAll()` (called by `handleCancel`) resets all `layerStates` to `inactive`, resolving this.

**Mixed mock/real layerData between decode passes**: between `triggerNextPass()` firing and the first `onLayerComplete` callback, layers 0–N hold stale activation data from the previous pass while N+1–11 hold `INITIAL_LAYER_DATA` placeholder values. This mixed state persists for however long the first few layers take. Mitigation: `triggerNextPass()` must call `setLayerData(INITIAL_LAYER_DATA)` before calling `socket.run()`, so all layers reset to a consistent placeholder state before new data arrives.

**Step mode + cancel dirty state**: `handleCancel` must reset `awaitingStepRef.current = false` and call `setAwaitingStep(false)`. Without this, the "Next token →" button survives a cancel and can trigger a new decode pass on a cancelled run.

### Canvas height recompute
`LayerCanvas` already recalculates `computeCanvasH(T, active)` on every `data` change via the `useEffect` at line 329. When `onLayerComplete` fires with a new seqLen, the canvas resizes automatically. No additional wiring needed.

### `streamFrames` log
The page continues building `streamFrames` manually in each handler callback (same pattern as today). The `StreamView` component shows a human-readable log of what the server sent, timestamped relative to `streamStartRef`.

---

## Implementation Phases

### Phase 1 — Backend fixes + hook skeleton (no page wiring)

**Files:** `backend/model.py`, `frontend/lib/websocket.ts`

1. Fix `model.py`: mlp shape → 3072, add ids to output candidates
2. Create `frontend/lib/websocket.ts` with `useProcessingSocket` hook
   - WebSocket connect/disconnect lifecycle
   - Raw message queue
   - Speed-gated dequeue loop
   - Layer component accumulation + all reductions
   - All typed handler callbacks
3. Verify hook in isolation: connect to backend, confirm all messages arrive correctly via `StreamView`

**Deliverable:** Hook wired to page for `StreamView` only (`onStreamFrame` callback populates frames log), not yet replacing mock animation.

### Phase 2 — Page wiring (replace mock animation)

**Files:** `frontend/app/processing/page.tsx`

1. Add `useProcessingSocket` call
2. Wire `onTokens`, `onLayerStart`, `onLayerComplete`, `onOutput`, `onDone`
3. Remove `animateLayers` and `OUTPUT_SEQUENCES` usage
4. Wire `triggerNextPass` for multi-token decode loop
5. Wire step mode + cancel to `socket.cancel()`
6. Remove `INPUT_TOKENS` as source of truth (keep `MERGE_STAGES`)
7. Keep `genLayerData` for `INITIAL_LAYER_DATA` only

### Phase 3 — Cleanup + edge case hardening

1. Remove `updateLayerData` stub
2. Add guard for duplicate/late layer component messages
3. Add `inputTokensRef` / `outputTokensRef` dual-write
4. Verify speed slider mid-run: queue builds correctly at low speed
5. Verify cancel while awaiting step
6. Verify re-run while previous run still queued

---

## Acceptance Criteria

### Functional

- [ ] Submitting a prompt connects to `ws://localhost:8000/ws` and sends `{"type": "run", "text": "..."}`
- [ ] Real tokens from server appear in the Input Tokens section (replacing hardcoded `INPUT_TOKENS`)
- [ ] Layer cards light up sequentially as `layer` messages arrive, 0 → 11
- [ ] Each layer canvas renders real activation data (attention heatmap, MLP grid, residual strips)
- [ ] Real output token candidates appear in the Output Tokens section with correct probabilities
- [ ] Multi-token decode loop: additional decode passes fire automatically after each `done` message
- [ ] BPE merge animation still plays decoratively during tokenizing phase
- [ ] Speed slider correctly paces the layer highlight sweep at all speeds (0.01–1.0)
- [ ] Step mode: run pauses after each output token, "Next token →" triggers next pass
- [ ] Cancel stops the dequeue loop and resets state to `done`
- [ ] `streamLive` indicator shows `live` during a run, `idle` when connected but not running
- [ ] Connection drop sets status to `idle`; page remains usable showing last state

### Non-functional

- [ ] No TypeScript `any` — all server message shapes typed via discriminated union
- [ ] Queue depth stays bounded (≤75 messages per pass at any speed)
- [ ] No memory leaks: WebSocket closed and timers cleared on component unmount
- [ ] `useProcessingSocket` has no side effects outside its returned methods

---

## Risks & Open Questions

| Risk | Severity | Mitigation |
|---|---|---|
| Real nnsight hooks not yet implemented (`model.py` is all TODOs) | Low — backend mock is sufficient for client dev | Work against mock; flag correct hook targets in comments |
| `mlp` field shape change may require `LayerCanvas` update when real model wires | Medium | Plan documents the correct hook (`c_fc` output). Canvas change is isolated to `drawNeuronGrid`. |
| Accumulated text join (space-separated) for multi-token prompts | Medium | GPT-2's real tokenizer handles subword tokens, not just spaces. For now, the mock tokenizer splits by space, so this works. Will need revisiting when real tokenizer is wired. |
| No stop condition for decode loop | Low | Add `MAX_OUTPUT_TOKENS = 20` constant; `onDone` handler checks `tokenGenRef.current < MAX_OUTPUT_TOKENS` before triggering next pass |
| `output[].prob` field mismatch causes silent `NaN` in probability bars | High | Must remap `prob → probability` in hook before calling `onOutput`. If missed: `Math.round((undefined / maxProb) * 100)` produces `NaN` as a CSS `width`, silently breaking all tooltip bars without a thrown error. |
| `output[].id` missing causes blank token ID chips | Medium | Backend fix required (Phase 1). Interim: `id: 0` placeholder. |
| Speed timer already scheduled when slider moves | Low | `notifySpeedChange()` cancels + reschedules the pending timer. Without this, rapid slider moves can queue multiple near-simultaneous `processNext` firings. |
| `streamCountRef` non-contiguous after cancel+re-run | Low | Cosmetic only — `StreamView` frame numbers skip. `resetAll()` resets `streamCountRef.current = 0`, which already handles this. |

---

## Files Modified

| File | Change |
|---|---|
| `frontend/lib/websocket.ts` | **NEW** — `useProcessingSocket` hook |
| `frontend/app/processing/page.tsx` | **MODIFY** — wire hook, remove animateLayers, remove OUTPUT_SEQUENCES |
| `frontend/lib/processingTypes.ts` | **MODIFY** — add `ServerMessage` discriminated union type |
| `backend/model.py` | **MODIFY** — fix mlp shape, add ids to output candidates |

---

## Sources & References

- `frontend/app/processing/page.tsx` — full mock animation logic
- `frontend/lib/processingTypes.ts` — LayerData, Token, Candidate types
- `frontend/components/processing/LayerCanvas.tsx` — canvas rendering, computeCanvasH
- `backend/model.py` — WebSocket message shapes and mock data
- `backend/main.py` — persistent WebSocket connection loop
- `AGENTS.md` lines 119–135 — canonical protocol spec
- `frontend/lib/useZoom.ts` — existing hook pattern to follow
