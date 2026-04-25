---
title: "Scroll, animation phase consistency, and shared UI component patterns"
category: ui-patterns
date: 2026-04-23
tags: [css-modules, scrollbar, shared-component, forwardref, typescript, animation-transition, deduplication, disabled-state, sse]
components: [components/ScrollArea.tsx, components/processing/InputPanel.tsx, components/processing/StreamView.tsx, app/processing/page.tsx]
problem_type: ui_improvement
severity: medium
status: solved
---

# Scroll, Animation Phase Consistency, and Shared UI Component Patterns

Patterns and fixes from the insidethe.ai processing page UI session (2026-04-23). Covers four recurring frontend problems: duplicate scrollbar CSS, layout shift between animation phases, disabled-vs-hidden button state, and speed floor accumulation at max speed.

---

## Pattern 1: Extract Scrollbar Styles to a `ScrollArea` Component

### Problem

WebKit and Firefox scrollbar rules were copy-pasted across `StreamView.module.css` and `InputPanel.module.css`. CSS Modules encourage component-scoped styles, which is correct for layout and visual rules — but utility-style resets like scrollbar overrides belong in one place.

### Solution

Create `components/ScrollArea.tsx` — a `forwardRef` wrapper that owns `overflow-y: auto` and all scrollbar CSS. Consumers pass their visual `className` alongside it.

**`components/ScrollArea.tsx`**
```tsx
import { forwardRef } from 'react'
import styles from './ScrollArea.module.css'

interface ScrollAreaProps {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(
  function ScrollArea({ children, className, style }, ref) {
    return (
      <div
        ref={ref}
        className={`${styles.root}${className ? ` ${className}` : ''}`}
        style={style}
      >
        {children}
      </div>
    )
  }
)

export default ScrollArea
```

**`components/ScrollArea.module.css`**
```css
.root {
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--line-strong) transparent;
}
.root::-webkit-scrollbar { width: 4px; }
.root::-webkit-scrollbar-track { background: transparent; }
.root::-webkit-scrollbar-thumb { background: var(--line-strong); border-radius: 2px; }
.root::-webkit-scrollbar-thumb:hover { background: var(--ink-quiet); }
```

**Usage:** Consumer keeps all visual/layout styles on its own class; `ScrollArea` owns only overflow and scrollbar rendering.
```tsx
<ScrollArea className={styles.codeBox} ref={responseBoxRef}>
  {children}
</ScrollArea>
```

Remove `scrollbar-width`, `scrollbar-color`, and all `::-webkit-scrollbar*` rules from any CSS module that adopts `ScrollArea`.

### Prevention

Any CSS rule appearing in more than one module file is a signal to extract a component. Scrollbar styling, focus rings, and custom selection colors are the most common offenders.

**Detection signal:** `grep -r "scrollbar-width" src/` — if it appears in more than one file, extract before merging.

---

## Pattern 2: Match DOM Structure Across Animation Phases to Prevent Layout Shift

### Problem

During the BPE merge animation, token chips had no ID label rendered above them. The tokenized phase adds a 7px ID label above every chip. Transitioning between phases caused the entire chip row to shift vertically — a jarring jump caused by the sudden introduction of label height.

### Root Cause

DOM structure was treated as an implementation detail of each phase independently, rather than a shared contract between phases. The element that "appears" in the transition was not reserved in the earlier phase.

### Solution

Wrap every merge-phase chip in the same `.embedTokenWrap` container used by tokenized tokens. Render a `.tokIdPlaceholder` span above each non-space chip (faint `—` at opacity 0.2). Space separators get an empty placeholder span to maintain identical row height. Change `.mergeStage` from `align-items: center` to `align-items: flex-start`.

```tsx
function renderMergeStage(stage: MergeItem[]) {
  return stage.map(({ t, sp, m }, idx) => (
    <div key={`merge-${idx}`} className={styles.embedTokenWrap}>
      <span className={styles.tokIdPlaceholder} aria-hidden="true">
        {sp ? '' : '—'}
      </span>
      <span
        className={[
          styles.ch,
          sp ? styles.chSpace : '',
          m ? styles.chMerged : '',
        ].filter(Boolean).join(' ')}
      >
        {t}
      </span>
    </div>
  ))
}
```

```css
.tokIdPlaceholder {
  font-family: var(--font-mono);
  font-size: 7px;
  letter-spacing: 0.1em;
  color: var(--ink-quiet);
  display: block;
  line-height: 1;
  margin-bottom: 2px;
  opacity: 0.2;
  min-height: 1em;
}

.mergeStage {
  align-items: flex-start; /* was: center */
}
```

**Key insight:** The fix is to make the merge-phase DOM structure identical to the tokenized phase — not to animate the height difference away. Invisible placeholder elements are cheaper and more reliable than height transition animations.

### Prevention

Before wiring any animated transition between two states, do a DOM diff. Both phases should produce the same bounding-box height and vertical rhythm.

**Detection signal:** Conditional rendering (`{condition && <Element />}`) inside components that participate in animated transitions. Prefer `visibility: hidden` / `opacity: 0` over conditional renders when the element contributes to layout.

---

## Pattern 3: Disabled vs Hidden Button State

### Problem

A copy button was conditionally rendered with `outputTokens.length > 0`. This hides the button entirely when there is nothing to copy, removing the affordance that the feature exists.

### Solution

Render always. Add `disabled={outputTokens.length === 0}`. Update the hover selector to `:hover:not(:disabled)`. Add an explicit disabled style.

```tsx
<button
  type="button"
  className={styles.copyBtn}
  disabled={outputTokens.length === 0}
  onClick={handleCopy}
>
  copy
</button>
```

```css
.copyBtn:hover:not(:disabled) {
  color: var(--ink);
  border-color: var(--line-strong);
}

.copyBtn:disabled {
  opacity: 0.3;
  cursor: default;
}
```

### Prevention

Default to disabled, not hidden. Only hide a control entirely if the action is permanently unavailable (e.g. role-gated). If the user would benefit from knowing the action exists before it is triggerable, show it disabled.

**Detection signal:** `{condition && <button>}` or `{condition ? <button> : null}` — ask "would the user benefit from seeing this button exists?" If yes, change to `disabled={!condition}`.

---

## Pattern 4: Speed Floor Accumulation at Max Speed

### Problem

Multiple delay functions each had a hard minimum floor (e.g. +60ms, +50ms, +100ms). At max speed (`speed >= 1`), these floors accumulated across BPE stage delays, embedding phase delay, and inter-pass delay — making max speed feel noticeably slow.

Specifically in `app/processing/page.tsx`:
- `layerDelay(1)` returned 60ms
- `stageDelay(1)` returned 50ms  
- Inter-pass timeout: `d + 100` = 160ms even when `d = 0`
- Embedding phase: `d + seqLenRef.current * 25 + 80` ≈ 250ms for a 5-word prompt

### Solution

Add an explicit `if (speed >= 1) return 0` guard to all delay functions, and remove the hard-coded additive constants at max speed.

```typescript
function layerDelay(speed: number): number {
  if (speed >= 1) return 0
  return Math.round((1 - speed) * 2440 + 60)
}

function stageDelay(speed: number): number {
  if (speed >= 1) return 0
  return Math.round((1 - speed) * 1100 + 50)
}
```

For inline timeouts with additive constants:
```typescript
// Inter-pass delay: remove the +100 at all speeds (layerDelay already provides buffer at lower speeds)
nextPassTimeoutRef.current = setTimeout(callback, d)

// Embedding delay: gate the seqLen multiplier on speed
animTimeoutRef.current = setTimeout(callback,
  speedRef.current >= 1 ? 0 : d + seqLenRef.current * 25 + 80
)
```

### Prevention

Any delay function that has a non-zero floor will accumulate with other delayed stages. When designing multi-stage animation timing, model the total delay at max speed explicitly — add up all minimums before shipping.

**Detection signal:** Delay functions with the form `Math.round((1 - speed) * N + M)` where M > 0. Each M is a floor that fires even at speed=1. Grep for `+ \d\d` inside setTimeout expressions.

---

## Related

- `docs/solutions/logic-errors/seq-len-mock-data-mismatch-residual-strip-2026-04-22.md` — the inactive placeholder height invariant (placeholder must match eventual active layout) is the same root cause as Pattern 2 above
- `docs/plans/2026-04-22-001-feat-websocket-client-integration-plan-phase-1.md` — `layerComponentDelay` formula and speed-gated dequeue pattern

## Stale References in AGENTS.md

The following sections in `AGENTS.md` are now out of date:
- **Repository structure diagram** — lists only 3 files under `components/processing/`; current branch adds 6+ more
- **`lib/websocket.ts` path** — hook actually lives at `hooks/useProcessingSocket.ts`
- **WebSocket protocol** — lists 4 layer components; implementation has 6 (`attn_write`, `mlp_write` added)
