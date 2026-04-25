---
title: "seqLen derived from word count causes residual strip chip mismatch; inactive strips show noisy dim chips"
date: 2026-04-22
category: docs/solutions/logic-errors/
module: processing-visualization
problem_type: logic_error
component: frontend_stimulus
severity: medium
symptoms:
  - "Residual strip chips rendered at the wrong count — proportional to the user's typed word count, not the actual token count"
  - "Typing 'hi' (1 word) produced 1 chip in every layer's RESIDUAL MID and RESIDUAL POST while the Input Tokens panel showed 6 tokens"
  - "The 6-word default prompt masked the bug by accident (6 words ≈ 6 tokens)"
  - "Inactive layers rendered a full set of dim low-opacity chips, making inactive visually indistinguishable from active"
  - "Canvas height did not adjust between active and inactive states, causing layout mismatches"
root_cause: logic_error
resolution_type: code_fix
tags:
  - canvas
  - mock-data
  - sequence-length
  - visualization
  - residual-strip
  - layer-canvas
  - gpt2
  - inactive-state
---

# seqLen derived from word count causes residual strip chip mismatch; inactive strips show noisy dim chips

## Problem

Two related visual defects in the GPT-2 processing page (`/processing`): residual strip chips were sized to the user's word count rather than the actual token count, causing chip counts to mismatch the Input Tokens panel; and inactive layer strips rendered a full set of dim chips instead of a clear "nothing has happened yet" placeholder.

## Symptoms

- Typing "hi" (1 word) produced 1 chip in every layer's RESIDUAL MID and RESIDUAL POST strips while the Input Tokens panel showed all 6 tokens — a visible contradiction.
- The mismatch scaled with word count: 3-word prompt → 3 chips, 6-word prompt → accidentally correct 6 chips (masking the bug for the default "The cat sat on the mat" prompt).
- Before activation, each layer's residual strips rendered the full set of dim, low-opacity token chips, making inactive layers look almost identical to active ones and defeating the staged animation.
- Canvas height was not adjusted for state — inactive canvases were sized as if they held a full chip grid.

## What Didn't Work

- **Word count as a proxy (session history)**: An earlier fix (Todo #008, `seqLen-hardcoded`) derived `T` from `text.split(' ').length` and was marked resolved. It worked accidentally because the default prompt "The cat sat on the mat" has 6 words matching the 6-token `INPUT_TOKENS` mock array. Any other prompt broke the invariant. The intent — dynamic T for autoregressive decode — was correct, but the implementation had no real tokenizer to back it up.

## Solution

### Fix 1 — Resolve seqLen from the WebSocket token response, not user word count

The underlying fix is that `seqLenRef` is now populated with the real token count from the backend as soon as tokens arrive, overriding the word-count estimate:

```ts
// frontend/app/processing/page.tsx — onTokens callback from useProcessingSocket
onTokens: (tokens: Token[]) => {
  if (tokenGenRef.current === 0) setInputTokens(tokens)
  seqLenRef.current = tokens.length  // real token count from tokenizer, not word count
},
```

The initial estimate in `handleRun` (`seqLenRef.current = promptText.split(/\s+/).filter(Boolean).length || 1`) is still set as a temporary sizing hint, but it is immediately overwritten by `tokens.length` when the first `onTokens` message arrives. This means `LayerCanvas` data is always generated with the correct sequence length.

For each generated decode token, `seqLenRef.current += 1` increments the count so chips grow correctly as output tokens accumulate.

### Fix 2 — Single placeholder bar for inactive residual strips

**`frontend/components/processing/LayerCanvas.tsx`:**

```ts
// Constants
const RESID_CHIP_H = 18
const RESID_STRIP_PAD = 4
const RESID_PLACEHOLDER_H = RESID_CHIP_H + RESID_STRIP_PAD * 2  // 26px
const RESID_CHAR_W = 3.9    // monospace char width approximation for JetBrains Mono at 6.5px
const RESID_PAD_X = 5
const RESID_CHIP_MIN_W = 14

// Variable-width chip sizing using measureText approximation
function approxChipW(label: string): number {
  return Math.max(RESID_CHIP_MIN_W, Math.round(label.length * RESID_CHAR_W + RESID_PAD_X * 2))
}

// computeResidH takes the tokens array (not a raw count) to do accurate layout
function computeResidH(tokens: string[], isActive = false): number {
  if (!isActive || !Array.isArray(tokens) || tokens.length === 0) return RESID_PLACEHOLDER_H
  const availW = CONTENT_W - RESID_STRIP_PAD * 2
  let x = 0, rows = 1
  for (const label of tokens) {
    const cw = approxChipW(label)
    if (x > 0 && x + RESID_CHIP_GAP + cw > availW) { rows++; x = cw }
    else { x = x === 0 ? cw : x + RESID_CHIP_GAP + cw }
  }
  return Math.max(RESID_PLACEHOLDER_H, RESID_STRIP_PAD * 2 + rows * RESID_CHIP_H + (rows - 1) * RESID_CHIP_GAP)
}

function computeCanvasH(tokens: string[], isActive = false): number {
  const residH = computeResidH(tokens, isActive)
  // ... same formula using residH for both RESIDUAL MID and RESIDUAL POST
}
```

**`drawWriteStrip` — inactive path draws a placeholder sized to the eventual active layout:**

```ts
function drawWriteStrip(writes: number[]) {
  if (!isActive || writes.length === 0) {
    // Use the active layout height if tokens are known, so the strip never
    // visually shrinks between passes as the sequence grows.
    let bh = RESID_PLACEHOLDER_H * s
    if (tokens.length > 0) {
      c.font = `${Math.round(6.5 * s)}px "JetBrains Mono", monospace`
      let cx = 0, rows = 1
      for (const label of tokens) {
        const chipW = Math.max(minW, Math.round(c.measureText(label).width + padX * 2))
        if (cx > 0 && cx + gap + chipW > availCW) { rows++; cx = chipW }
        else { cx = cx === 0 ? chipW : cx + gap + chipW }
      }
      bh = Math.max(RESID_PLACEHOLDER_H * s, sp * 2 + rows * rh + (rows - 1) * gap)
    }
    c.fillStyle = 'rgba(255,255,255,0.06)'
    c.fillRect(pad, y, cw, bh)
    y += bh + SEC_GAP * s
    return
  }
  // ... active chip drawing with two-pass layout (measure then draw)
}
```

The key invariant: the inactive placeholder is sized to match the *eventual* active layout, so the strip never visually shrinks between forward passes as tokens accumulate.

## Why This Works

**Fix 1:** The WebSocket `onTokens` handler is the correct authority on sequence length — it reflects what the real tokenizer produced, not a word-count approximation. By updating `seqLenRef` there, all downstream canvas data generation (`genLayerData(i, seqLenRef.current)`) and chip rendering is kept consistent with the actual token count shown in the Input Tokens panel.

**Fix 2:** A single full-width bar is unambiguous: it reads as a placeholder, not data. Using `approxChipW` (rather than a fixed `CHIPS_PER_ROW` constant) in the inactive pre-measurement step ensures the placeholder height matches what the active chips will actually occupy, eliminating layout jumps when a layer transitions from inactive to processing.

## Prevention

1. **seqLen has one authoritative source per phase.** In the mock-only phase, use `INPUT_TOKENS.length`. Once WebSocket integration is live, use the token count from `onTokens`. Never derive it from user input text — word count and token count diverge for any non-default prompt.

2. **State-dependent layout must flow through height computation.** When a component's visual state changes its layout dimensions (inactive bar vs. active chip grid), the height calculation function must receive that state as a parameter (`isActive`). Canvas sizing and draw calls that disagree produce layout flashes or clipping.

3. **Default prompt equality masks length bugs.** The 6-word default "The cat sat on the mat" accidentally matched `INPUT_TOKENS.length = 6`, hiding the mismatch from casual testing. When using mock or fixed-length data, explicitly test with prompts shorter and longer than the array to surface length-sensitive bugs early.

4. **Prefer `tokens: string[]` over `T: number` in canvas functions.** Passing the actual token array (rather than a derived count) lets canvas functions use `measureText` for accurate chip sizing and forces callers to supply real token data. A raw integer count can silently drift from what's displayed; the array cannot.

## Related Issues

- WebSocket integration: `docs/plans/2026-04-22-001-feat-websocket-client-integration-plan.md`
- Todo #011b: mock data (`INPUT_TOKENS`, `MERGE_STAGES`, `OUTPUT_SEQUENCES`) intentionally in the production code path pending WebSocket integration
