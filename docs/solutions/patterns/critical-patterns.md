# insidethe.ai — Critical Patterns (Required Reading)

Patterns in this file are **required reading before touching visualization components**. Each represents a mistake that was made (or nearly made) on this project and carries a hard rule that must be followed in all future work.

---

## 1. No Fake Data During a Live Run (ALWAYS REQUIRED)

### ❌ WRONG (violates the app's core premise — users see fabricated activations presented as real GPT-2 output)

```typescript
// Generating embedding vectors client-side with a PRNG seeded by token ID
import { seededRng } from '@/mocks/rng'
const genEmbedVector = (tokenId: number) => {
  const rng = seededRng(tokenId * 1000)
  return Float32Array.from({ length: 768 }, rng)
}

// Building BPE merge stages client-side from a character-split heuristic
function buildMergeStages(text: string): MergeItem[][] {
  const chars = text.split('')
  // ... fake merge logic, no access to GPT-2's actual merges.txt ...
}
```

### ✅ CORRECT

```typescript
// EmbeddingStrip receives real wte embeddings streamed from the backend
interface EmbeddingStripProps {
  vector: number[] | null  // null until backend sends the embed frame
}
// Show nothing until real data arrives — never substitute a fake waveform
if (!vector) return null

// page.tsx: accumulate real merge_stage frames from the WebSocket
onMergeStage: (items: MergeItem[]) => {
  mergeStagesRef.current = [...mergeStagesRef.current, items]
  setMergeStages((prev) => [...prev, items])
},

// Trigger animation only once all real stages are buffered (guaranteed by onTokens firing after them)
onTokens: (tokens: Token[]) => {
  setInputTokens(tokens)
  startMergeAnimationRef.current()
},
```

```python
# backend/model.py: stream real wte embeddings and real BPE stages
embed_mat = embed_saved[0].detach().numpy()  # real [seq_len, 768] from wte
for idx in range(token_count):
    vec = embed_mat[idx]
    max_abs = float(np.abs(vec).max()) + 1e-8
    yield {"type": "embed", "token_idx": idx, "data": (vec / max_abs).tolist()}

# Real BPE stages from GPT-2's actual merges.txt (already cached on disk)
for stage in self._compute_bpe_stages(text):
    yield {"type": "merge_stage", "items": stage}
```

**Why:** insidethe.ai's entire premise is showing real GPT-2 internals. Fake-but-stable data (seeded PRNGs, hardcoded arrays, client-side reimplementations) violates this at the product level and is indistinguishable from real data to the user. This rule has been violated twice — once with `seqLen` derived from word count, once with `seededRng` in EmbeddingStrip and client-side BPE stages.

**Placement/Context:** Applies to every component that renders during a live session (after the user submits a prompt and the WebSocket is running). Does NOT apply to inactive/placeholder states before a run starts — showing a placeholder shape is acceptable when no data exists yet.

**Scope of acceptable placeholder data:**
- ✅ Inactive layer cards showing `?? 6` chip count before any run
- ✅ `EmbeddingStrip` returning `null` (renders nothing) before an embed frame arrives
- ✅ `PreviewProcessCanvas` on the landing page — explicitly decorative, not a live visualization
- ❌ Any PRNG, hardcoded array, or client-side approximation used during an active session

**Documented in:** `docs/solutions/logic-errors/fake-embed-bpe-data-processing-visualization-2026-04-24.md`

**Prior incident:** `docs/solutions/logic-errors/seq-len-mock-data-mismatch-residual-strip-2026-04-22.md`

---
