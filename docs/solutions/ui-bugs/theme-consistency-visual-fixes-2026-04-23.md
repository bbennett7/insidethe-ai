---
title: "Heatmap flash, theme label, code box contrast, MLP brightness, and placeholder font fixes"
category: ui-bugs
date: 2026-04-23
tags: [css-modules, theme, dark-mode, light-mode, canvas, animation-state, alpha, font-consistency, react-state, visual-feedback]
components: [app/processing/page.tsx, components/processing/StreamView.tsx, components/processing/LayerCanvas.tsx, components/Nav.tsx]
problem_type: ui_improvement
severity: medium
status: solved
---

# Theme Consistency and Visual Feedback Fixes

A cluster of visual consistency and perceptual feedback issues surfaced on the insidethe.ai processing page after initial component integration. Three categories of root cause appear: state resets that outrun rendering (heatmap flash), inverted or mismatched label semantics (theme toggle label, placeholder font), and per-theme contrast failures where color values that worked in one theme were illegible or imperceptible in the other (code box darkness, MLP neuron alpha). None were logic errors in the strict sense — all were UI contract violations that only manifested under specific runtime conditions (mid-animation, theme switch, or low-activation inference passes).

---

## Fix 1: Heatmap blank flash between decode passes

### Symptom

Between decode passes, the layer heatmap canvas blanked out for one visible frame, then refilled. The flash was most noticeable in heatmap mode with short inter-pass delays.

### Root Cause

In `app/processing/page.tsx`, both the inter-pass `setTimeout` callback and `handleStepNext` called `setLayerStates(Array(NUM_LAYERS).fill('inactive'))` and `setLayerData(Array.from({length: NUM_LAYERS}, () => ({...EMPTY_LAYER_DATA})))` before the new pass started. This caused a single render frame where all layers showed inactive/empty — one frame before the new pass's `onLayerStart` messages arrived to fill them back in.

### Solution

Remove both reset calls entirely. Layers stay in `'done'` state from the previous pass. The `onLayerStart` WebSocket handler already resets subsequent layers correctly as the new pass arrives:

```typescript
onLayerStart: (idx: number) => {
  setLayerStates((prev) => {
    const next = [...prev]
    if (idx > 0) next[idx - 1] = 'done'
    next[idx] = 'processing'
    for (let i = idx + 1; i < NUM_LAYERS; i++) next[i] = 'inactive'
    return next
  })
},
```

**Before (inter-pass timeout):**
```typescript
nextPassTimeoutRef.current = setTimeout(() => {
  if (cancelledRef.current) { setProcessState('done'); return }
  setLayerStates(Array(NUM_LAYERS).fill('inactive'))           // ← removed
  setLayerData(Array.from({length: NUM_LAYERS}, () => ({...EMPTY_LAYER_DATA})))  // ← removed
  setProcessState('computing')
  setStreamLive(true)
  socketRunRef.current(currentSequenceRef.current)
}, d)
```

**After:** same block without the two reset lines. Same removal applied in `handleStepNext`.

**Key insight:** Never reset visual state to empty/inactive before the replacement data is in hand. The `onLayerStart` handler already manages the layer state cursor — pre-clearing was redundant and caused the flash.

---

## Fix 2: Theme toggle label shows target, not current mode

### Symptom

The theme toggle button displayed "dark" while the UI was already in dark mode — the label described the action ("switch to dark") rather than the active state ("currently dark").

### Root Cause

In `components/Nav.tsx`, the ternary was inverted:

```tsx
// Wrong — shows target mode
<button onClick={toggleTheme}>{isDark ? 'light' : 'dark'}</button>
```

When `isDark` is `true`, we are in dark mode. The label should say `'dark'` (current state), not `'light'` (where we'd go).

### Solution

```tsx
// Correct — shows current mode
<button onClick={toggleTheme}>{isDark ? 'dark' : 'light'}</button>
```

**Key insight:** Toggle button labels describe *current state*, not target state. Inverted conditionals here are easy to write and invisible until you switch themes and read the label.

---

## Fix 3: Light mode code boxes always dark

### Symptom

In light mode, the Request and Response panes in StreamView showed a near-transparent background, making acid-green and white terminal text illegible.

### Root Cause

`StreamView.module.css` `.codeBox` had `background: rgba(14, 18, 12, 0.45)`. In light mode the global theme cascade overrode this to a near-transparent surface, but all the text colours (syntax highlighting, data prefixes, stream annotations) assumed a dark background.

Code boxes display terminal-style output and are intentionally always dark regardless of page theme.

### Solution

Force the charcoal background in light mode with a `:global(html.light)` override, and override all text colours inside code boxes to their white-on-dark variants:

```css
.codeBox {
  flex: 1;
  min-height: 0;
  background: rgba(14, 18, 12, 0.45);
  border: 1px solid var(--line);
  border-radius: 6px;
}

/* Code boxes are always dark — only the data area, not the surrounding block */
:global(html.light) .codeBox {
  background: rgba(14, 18, 12, 0.78);
  border-color: rgba(255, 255, 255, 0.08);
}

:global(html.light) .dataPrefix    { color: rgba(255, 255, 255, 0.22); }
:global(html.light) .streamComment { color: rgba(255, 255, 255, 0.18); }
:global(html.light) .waiting       { color: rgba(255, 255, 255, 0.3); }
:global(html.light) .placeholder   { color: rgba(255, 255, 255, 0.3); }
```

**Critical gotcha — CSS cascade ordering:** Any stale black-text overrides earlier in the file (e.g. `color: rgba(0,0,0,0.18)` for `.streamComment` in light mode) must be deleted. Because CSS cascade order determines the winner for equal-specificity rules, a black override placed *after* the white override silently wins and makes text invisible against the dark background. Resolution: delete the stale rules, keep only the white-on-dark overrides.

**Key insight:** Code/terminal panels are a separate theming domain. Their background and text colours are invariant with respect to the app's light/dark theme — never inherit from generic `--surface` tokens.

---

## Fix 4: MLP neuron brightness (sqrt curve)

### Symptom

Active MLP neurons were visually indistinguishable from inactive ones. The heatmap appeared nearly blank even when the model was running.

### Root Cause

In `LayerCanvas.tsx`, active neurons used `rgba(${acidActive}, ${0.06 + act * 0.88})` with a threshold of `act < 0.02`. GELU activations are sparse — most neurons are at 0 — but the active ones cluster at very low values (0.02–0.1). With a base alpha of 0.06 and a linear scale, these low activations produced an alpha of ~0.09–0.15, nearly matching the visual weight of inactive neurons.

### Solution

Raise the base alpha to 0.22, apply a sqrt brightness curve, and lower the threshold to 0.01:

```typescript
// Before
act < 0.02
  ? mlpOff
  : `rgba(${acidActive},${0.06 + act * 0.88})`

// After
act < 0.01
  ? mlpOff
  : `rgba(${acidActive},${(0.22 + Math.pow(act, 0.5) * 0.72).toFixed(3)})`
```

**Perceptual impact:** An activation of 0.04 (2% of the 0–1 range) maps to:
- Old linear: `0.06 + 0.04 * 0.88 = 0.095` alpha
- New sqrt: `0.22 + sqrt(0.04) * 0.72 = 0.364` alpha (~4× brighter)

**Key insight:** Whenever data is sparse or heavy-tailed (GELU activations, softmax weights, probability distributions), default to a perceptual or sqrt scale rather than linear. The interesting signal is concentrated at the low end of the range — linear scale compresses exactly where you need resolution.

---

## Fix 5: Placeholder font mismatch

### Symptom

The "run a prompt to see the API response" placeholder text in the Request pane rendered in a serif body font at 11px, while the adjacent "waiting…" text in the Response pane used a monospace font at 10px. The two empty-state messages looked inconsistent when viewed side by side.

### Root Cause

`.placeholder` (Request pane empty state) was defined with `font-body` at 11px and `font-weight: 300`. `.waiting` (Response pane empty state) used `font-mono` at 10px. Both live inside `.codeBox` panels — they're semantically equivalent but were styled independently.

### Solution

Align `.placeholder` to match `.waiting` exactly:

```css
/* Before */
.placeholder {
  display: block;
  padding: 12px 14px;
  font-family: var(--font-body);   /* wrong */
  font-style: italic;
  color: var(--ink-quiet);
  font-size: 11px;                 /* wrong */
  font-weight: 300;                /* unnecessary */
}

/* After */
.placeholder {
  display: block;
  padding: 12px 14px;
  font-family: var(--font-mono);
  font-style: italic;
  color: var(--ink-quiet);
  font-size: 10px;
}
```

**Key insight:** Empty-state elements in adjacent panels that share the same visual context (both inside `.codeBox`) must use identical typography. When empty-state classes drift, they create a visual discontinuity that feels like a bug even when the panels contain the correct data.

---

## Prevention

### Fix 1 — "Optimistic clear" before confirmed replacement

Never reset visual state to empty/inactive before replacement data is confirmed ready. The correct order is: fetch → populate → (optionally) clear old. A state-setter that resets to empty/inactive and is *not* colocated with the corresponding data-setter in the same callback is a smell.

**Detection signal:**
```
grep -n "setLayerStates\|setLayerData\|setState" page.tsx | grep -i "inactive\|empty\|fill"
```
Flag any reset call that appears before a socket/async call in the same logical block.

### Fix 2 — Inverted theme/state conditionals

When labeling a toggle, the truthy branch of `isDark` should describe the *dark* state. A comment next to every theme ternary clarifying which branch is "current" and which is "target" prevents future inversions.

**Detection signal:**
```
grep -n "isDark ? 'light'\|isDark ? \"light\"" src/
```
Any match is the smell — if `isDark` is true, the label should resolve to `'dark'`.

### Fix 3 — Terminal panels inherit wrong theme tokens

Code/terminal panels must opt out of the global theme cascade. Use a scoped dark background token rather than inheriting from generic `--surface`.

**Detection signal:**
```
grep -rn "var(--surface\|var(--background" src/components/ | grep -i "code\|box\|pre\|terminal\|mono"
```
Smell: a code panel using a theme-switchable surface token.

**CSS cascade ordering risk:** When adding `light` mode overrides for multiple classes, scan the file for any existing color rule on the same class. A later rule at equal specificity wins silently.

### Fix 4 — Linear scale for sparse/heavy-tailed data

Default to sqrt or log scale when mapping sparse activations to visual properties. Document the chosen curve with a comment explaining the data distribution.

**Detection signal:**
```
grep -n "alpha\|opacity" src/ -r | grep -v "Math\.\(pow\|sqrt\|log\)"
```
Any direct linear multiply from an activation value to alpha/opacity without a curve function is the smell.

### Fix 5 — Empty-state typography drift

Adjacent empty-state elements in the same component must reference the same typography class or token. Never style empty states ad hoc with inline font declarations.

**Detection signal:**
```
grep -n "font-family" StreamView.module.css
```
Two different `font-family` values in the same file on classes that share `.empty`, `.placeholder`, `.waiting`, or `.no-data` in their name is the smell.

---

## Broader Patterns

### "Optimistic clear" anti-pattern (Fix 1)
Any time code reads "clear → fetch → populate," ask whether the clear is necessary. In most React + WebSocket flows, the server drives state transitions — pre-clearing is unnecessary and causes flash artifacts.

### Inverted conditionals on display state (Fixes 2, 4, partially 3)
Three of five fixes involved values that were backwards relative to user perception. Code review should require that every `isDark`, `isActive`, or `activation → visual` expression carries a brief comment stating what the truthy and falsy branches produce in human-visible terms.

---

## Related

- `docs/solutions/ui-patterns/scroll-animation-ui-patterns.md` — Pattern 2 (DOM structure invariants across animation phases) and Pattern 4 (speed floor accumulation) are from the same session; together these documents cover the full set of UI bugs fixed on 2026-04-23
- `docs/solutions/logic-errors/seq-len-mock-data-mismatch-residual-strip-2026-04-22.md` — documents `lastActiveDataRef` for preserving canvas data between decode passes; Fix 1 above extends that same principle to layer state resets
