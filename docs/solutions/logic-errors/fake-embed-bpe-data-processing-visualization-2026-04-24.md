---
title: "EmbeddingStrip and BPE merge stages used fake/seeded data during live sessions"
date: 2026-04-24
category: docs/solutions/logic-errors/
module: processing-visualization
problem_type: logic_error
component: frontend_stimulus
severity: high
symptoms:
  - "EmbeddingStrip showed seeded-random 768-dim vectors during a live run instead of real wte embeddings"
  - "BPE merge stages were computed client-side from a hardcoded character-by-character split, not GPT-2's actual merge rules"
  - "Merge animation played with fake stages that did not reflect real BPE merges (e.g. 'hello' split as ['h','e','l','l','o'])"
  - "EmbeddingStrip canvas appeared active with plausible-looking data while showing completely fabricated activations"
root_cause: logic_error
resolution_type: code_fix
tags:
  - mock-data
  - fake-data
  - embedding
  - bpe
  - websocket
  - processing-visualization
  - embedding-strip
  - merge-stages
---

# EmbeddingStrip and BPE merge stages used fake/seeded data during live sessions

## Problem

Two frontend components were presenting fake data as if it were real GPT-2 output during live sessions. The app's core premise — showing real model internals — was violated:

1. **`EmbeddingStrip`**: Generated a 768-dim embedding vector using `seededRng` (a deterministic PRNG seeded by token ID) instead of the actual `wte` embedding from the model.
2. **BPE merge stages**: A client-side `buildMergeStages` function split text character-by-character and made up merge sequences. GPT-2's actual BPE merge rules from `merges.txt` were never consulted.

This was left over from the pre-WebSocket phase when real data was unavailable, but was never replaced after WebSocket integration was wired up.

## Symptoms

- `EmbeddingStrip` rendered per-token in `InputPanel` — each canvas showed a waveform-style visualization that looked real but was seeded by `tokenId`. The same token always produced the same fake waveform.
- Merge animation in `EmbeddingStrip` played through plausible-looking BPE stages, but they were fabricated client-side (e.g. "hello" → ["h","e","l","l","o"] → ["he","l","l","o"] → ...) rather than using GPT-2's actual priority merge rules.
- An audit of all frontend components confirmed these were the only two live-run data paths using fake data; inactive/placeholder states are acceptable.

## What Didn't Work

- **Client-side `buildMergeStages`**: This function in `page.tsx` had no access to `merges.txt` and could not implement real BPE. Any client-side reimplementation would still be fake.
- **Accessing `GPT2Tokenizer.bpe_ranks` (fast tokenizer)**: The fast tokenizer's underlying `tokenizers.models.BPE` object does not expose `.merges` in the version used. `save_vocabulary` to a temp dir also failed (no `merges.txt` in fast tokenizer output, causing `StopIteration` in async context).
- **`slow.pat` and `slow.byte_encoder`**: Removed in newer transformers versions — accessing them raises `AttributeError`.

## Solution

### Backend: stream real `embed` and `merge_stage` frames

**`backend/model.py`** — two additions:

**1. Real BPE merge stages** via `cached_file("gpt2", "merges.txt")` (already on disk from model download):

```python
from transformers.utils import cached_file
import re

_GPT2_PAT = re.compile(r"""'s|'t|'re|'ve|'m|'ll|'d| ?\w+| ?\d+| ?[^\s\w\d]+|\s+(?!\S)|\s+""")

def _make_byte_maps():
    bs = (list(range(ord("!"), ord("~")+1))
          + list(range(ord("¡"), ord("¬")+1))
          + list(range(ord("®"), ord("ÿ")+1)))
    cs = bs[:]
    n = 0
    for b in range(256):
        if b not in bs:
            bs.append(b)
            cs.append(256 + n)
            n += 1
    enc = dict(zip(bs, [chr(c) for c in cs]))
    return enc, {v: k for k, v in enc.items()}

_BYTE_ENC, _BYTE_DEC = _make_byte_maps()
```

In `__init__`:
```python
merges_path = cached_file("gpt2", "merges.txt")
with open(merges_path) as fh:
    lines = [l.strip() for l in fh if l.strip() and not l.startswith("#")]
self._bpe_ranks: dict[tuple[str, str], int] = {
    tuple(line.split()): i for i, line in enumerate(lines)
}
```

In `run()` — stream merge stages before tokens:
```python
for stage in self._compute_bpe_stages(text):
    yield {"type": "merge_stage", "items": stage}
    await asyncio.sleep(0)
```

**2. Real `wte` embeddings** — stream one frame per token after nnsight trace:
```python
embed_mat = embed_saved[0].detach().numpy()  # [seq_len, 768]
for idx in range(token_count):
    vec = embed_mat[idx]
    max_abs = float(np.abs(vec).max()) + 1e-8
    yield {"type": "embed", "token_idx": idx, "data": (vec / max_abs).tolist()}
    await asyncio.sleep(0)
```

### Frontend: wire real data, remove fake generators

**`frontend/lib/processingTypes.ts`** — add new message types to `ServerMessage`:
```typescript
export type ServerMessage =
  | ...
  | { type: 'merge_stage'; items: MergeItem[] }
  | { type: 'embed'; token_idx: number; data: number[] }
  | ...
```

**`frontend/hooks/useProcessingSocket.ts`** — add handlers and dispatch cases:
```typescript
export interface ProcessingSocketHandlers {
  onMergeStage: (items: MergeItem[]) => void
  onEmbed: (tokenIdx: number, vector: number[]) => void
  // ...
}
// dispatch handles type 'merge_stage' and 'embed' with 0ms delay
```

**`frontend/components/processing/EmbeddingStrip.tsx`** — remove seededRng, accept real vector:
```typescript
// BEFORE (fake):
import { seededRng } from '@/mocks/rng'
const genEmbedVector = (tokenId: number) => {
  const rng = seededRng(tokenId * 1000)
  return Float32Array.from({ length: 768 }, rng)
}
// AFTER (real):
interface EmbeddingStripProps {
  vector: number[] | null  // null = not yet received from backend
}
// All hooks run unconditionally; null guard only at render return
useEffect(() => {
  if (!vector) return
  vectorRef.current = Float32Array.from(vector)
  draw()
}, [vector, draw])
if (!vector) return null
```

**`frontend/app/processing/page.tsx`** — accumulate real stages, trigger animation from `onTokens`:
```typescript
// Removed: buildMergeStages function, local MergeItem definition
// Added:
onMergeStage: (items: MergeItem[]) => {
  if (tokenGenRef.current === 0) {
    mergeStagesRef.current = [...mergeStagesRef.current, items]
    setMergeStages((prev) => [...prev, items])
  }
},
onTokens: (tokens: Token[]) => {
  if (tokenGenRef.current === 0) {
    setInputTokens(tokens)
    startMergeAnimationRef.current()  // all stages buffered by now (0ms queue)
  }
  seqLenRef.current = tokens.length
},
onEmbed: (tokenIdx: number, vector: number[]) => {
  if (tokenGenRef.current === 0) {
    setEmbedVectors((prev) => ({ ...prev, [tokenIdx]: vector }))
  }
},
```

`resetAll` must clear both state and ref:
```typescript
setMergeStages([])
mergeStagesRef.current = []
setEmbedVectors({})
```

**`frontend/lib/rng.ts`** — deleted (zero callers after EmbeddingStrip fix)

### Key architectural insight: `onTokens` as the animation trigger

`merge_stage` frames are enqueued at 0ms delay, same as `tokens`. Since they always arrive before `tokens` in WebSocket frame order, `onTokens` firing guarantees all stages are already buffered in `mergeStagesRef`. Using `startMergeAnimationRef` (a stable ref populated after `startMergeAnimation` is defined) allows the socket handler (defined first in render order) to call the animation function without stale closure issues.

## Why This Works

- `cached_file("gpt2", "merges.txt")` loads the file already on disk from HuggingFace cache — no network request, no dependency on tokenizer object internals. The merge priority table is the ground truth for GPT-2 BPE.
- `_make_byte_maps()` is a pure mathematical function (GPT-2's `bytes_to_unicode()` reimplemented directly) — it has no library dependency and is version-safe.
- `wte.output.save()` inside the nnsight trace context captures the real token embeddings from GPT-2's embedding lookup layer, normalized per-token to [-1, 1].
- The `if (!vector) return null` guard in `EmbeddingStrip` ensures the component is invisible until real data arrives — no placeholder waveform is ever shown during a run.

## Prevention

1. **Policy: no fake data during a run.** Once a WebSocket connection exists and a run has started, every value shown to the user must come from the backend. Inactive/placeholder states before a run are acceptable. This rule is now documented in `AGENTS.md`.

2. **Audit after adding new data sources.** When WebSocket integration adds a new frame type, immediately check all frontend components that displayed placeholder data for that type and wire the real data.

3. **`seededRng` / deterministic PRNGs have no place in live visualization code.** If a PRNG is needed, it belongs only in design mocks or test fixtures — never in components that render during a session.

4. **Avoid client-side reimplementation of model internals.** BPE merge stages, embeddings, and attention weights must come from the backend. Any client-side version (however accurate) is technically fake and defeats the purpose of the app.

## Related Issues

- Prior mock data incident: `docs/solutions/logic-errors/seq-len-mock-data-mismatch-residual-strip-2026-04-22.md` — seqLen was derived from word count rather than the real token count; `INPUT_TOKENS` was a hardcoded mock array.
- Promoted to Required Reading: `docs/solutions/patterns/critical-patterns.md` — Pattern #1: No Fake Data During a Live Run.
