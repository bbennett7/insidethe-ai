'use client';

import { useEffect, useRef } from 'react';
import { ACID_DARK, ACID_LIGHT, COOL } from '@/lib/canvasTheme';
import type { LayerData, LayerState } from '@/lib/processingTypes';
import { useTheme } from '@/lib/ThemeContext';

interface LayerCanvasProps {
  layerIndex: number;
  state: LayerState;
  data: LayerData;
  tokens?: string[];
  isDecoding?: boolean;
}

const CARD_W = 219;
const CARD_PAD = 12;
const CONTENT_W = CARD_W - CARD_PAD * 2;
const LABEL_H = 13;
const SEC_GAP = 10;
const BAR_H = 5;
const NUM_HEADS = 12;
const HEAD_COLS = 4;
const HEAD_ROWS = Math.ceil(NUM_HEADS / HEAD_COLS);
const HEAD_INNER_GAP = 3;
const HEAD_W = Math.floor((CONTENT_W - HEAD_INNER_GAP * (HEAD_COLS - 1)) / HEAD_COLS);
const HEAD_H = HEAD_W;
const ATTN_BLOCK_H = HEAD_ROWS * HEAD_H + (HEAD_ROWS - 1) * HEAD_INNER_GAP;
const MLP_COLS = 32;
const MLP_ROWS = Math.ceil(3072 / MLP_COLS);
const MLP_DIM = 3072;
const NEURON_CELL = Math.floor((CONTENT_W - (MLP_COLS - 1) * 1) / MLP_COLS);
const MLP_BLOCK_H = MLP_ROWS * NEURON_CELL + (MLP_ROWS - 1) * 1;
const RESID_CHIP_H = 18;
const RESID_CHIP_GAP = 3;
const RESID_STRIP_PAD = 4;
const RESID_PLACEHOLDER_H = RESID_CHIP_H + RESID_STRIP_PAD * 2;
// Monospace char width approximation for JetBrains Mono at 6.5px (used for height pre-calc)
const RESID_CHAR_W = 3.9;
const RESID_PAD_X = 5;
const RESID_CHIP_MIN_W = 14;

// Precomputed alpha LUTs — built once at module load, indexed by Math.round(value * 255).
// Eliminates Math.pow + toFixed + template-literal allocation inside the hot drawing loops.
const MLP_LUT_DARK = Array.from(
  { length: 256 },
  (_, i) => `rgba(${ACID_DARK},${(0.06 + Math.sqrt(i / 255) * 0.79).toFixed(3)})`
);
const MLP_LUT_LIGHT = Array.from(
  { length: 256 },
  (_, i) => `rgba(${ACID_LIGHT},${(0.06 + Math.sqrt(i / 255) * 0.79).toFixed(3)})`
);
const ATTN_LUT_DARK = Array.from({ length: 256 }, (_, i) => {
  const a = Math.round((0.04 + (i / 255) * 0.94) * 1000) / 1000;
  return `rgba(${ACID_DARK},${a})`;
});
const ATTN_LUT_LIGHT = Array.from({ length: 256 }, (_, i) => {
  const a = Math.round((0.04 + (i / 255) * 0.94) * 1000) / 1000;
  return `rgba(${ACID_LIGHT},${a})`;
});

function approxChipW(label: string): number {
  return Math.max(RESID_CHIP_MIN_W, Math.round(label.length * RESID_CHAR_W + RESID_PAD_X * 2));
}

function computeResidH(tokens: string[], isActive = false): number {
  if (!isActive || !Array.isArray(tokens) || tokens.length === 0) return RESID_PLACEHOLDER_H;
  const availW = CONTENT_W - RESID_STRIP_PAD * 2;
  let x = 0,
    rows = 1;
  for (const label of tokens) {
    const cw = approxChipW(label);
    if (x > 0 && x + RESID_CHIP_GAP + cw > availW) {
      rows++;
      x = cw;
    } else {
      x = x === 0 ? cw : x + RESID_CHIP_GAP + cw;
    }
  }
  return Math.max(
    RESID_PLACEHOLDER_H,
    RESID_STRIP_PAD * 2 + rows * RESID_CHIP_H + (rows - 1) * RESID_CHIP_GAP
  );
}

function computeCanvasH(tokens: string[], isActive = false): number {
  const residH = computeResidH(tokens, isActive);
  return Math.ceil(
    CARD_PAD +
      LABEL_H +
      SEC_GAP / 2 +
      BAR_H +
      SEC_GAP +
      LABEL_H +
      SEC_GAP / 2 +
      ATTN_BLOCK_H +
      SEC_GAP +
      LABEL_H +
      SEC_GAP / 2 +
      residH +
      SEC_GAP +
      LABEL_H +
      SEC_GAP / 2 +
      BAR_H +
      SEC_GAP +
      LABEL_H +
      SEC_GAP / 2 +
      MLP_BLOCK_H +
      SEC_GAP +
      LABEL_H +
      SEC_GAP / 2 +
      residH +
      CARD_PAD
  );
}

function drawLayerCanvas(
  canvas: HTMLCanvasElement,
  state: LayerState,
  data: LayerData,
  isDark: boolean,
  tokens: string[] = [],
  isDecoding = false
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const W = canvas.width;
  const H = canvas.height;
  const s = dpr;

  ctx.clearRect(0, 0, W, H);

  const pad = CARD_PAD * s;
  const cw = CONTENT_W * s;
  let y = pad;

  const isActive = state === 'done' || state === 'processing';
  const c = ctx;

  const SEQ_LEN = data.attn[0]?.length ?? 6;

  // Acid color for ATTN + MLP sections
  const acidDoneA = isDark ? 'rgba(138,171,42,0.8)' : 'rgba(143,220,0,0.8)';
  const acidProcA = isDark ? 'rgba(196,255,61,0.8)' : 'rgba(143,220,0,0.9)';
  const labelOff = isDark ? 'rgba(85,85,85,0.7)' : 'rgba(130,130,130,0.8)';

  // LUT references for the hot drawing loops — picked once per draw call
  const mlpLut = isDark ? MLP_LUT_DARK : MLP_LUT_LIGHT;
  const attnLut = isDark ? ATTN_LUT_DARK : ATTN_LUT_LIGHT;
  // Precompute per-theme hint strings so they aren't rebuilt inside loops
  const attnHint = isDark ? `rgba(${ACID_DARK},0.10)` : `rgba(${ACID_LIGHT},0.10)`;
  const mlpHint = isDark ? `rgba(${ACID_DARK},0.07)` : `rgba(${ACID_LIGHT},0.07)`;

  // Cool color for LN + RESIDUAL sections (same in dark and light)
  const coolDoneA = `rgba(${COOL},0.75)`;
  const coolProcA = `rgba(${COOL},0.95)`;

  function drawLabel(text: string, color: string) {
    c.fillStyle = color;
    c.font = `${Math.round(8 * s)}px "JetBrains Mono", monospace`;
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillText(text, pad, y);
    y += LABEL_H * s;
  }

  function drawBar(fill: number) {
    const bh = BAR_H * s;
    c.fillStyle = 'rgba(255,255,255,0.06)';
    c.fillRect(pad, y, cw, bh);
    if (isActive && fill > 0) {
      c.fillStyle = state === 'processing' ? coolProcA : coolDoneA;
      c.fillRect(pad, y, cw * fill, bh);
    }
    y += bh + SEC_GAP * s;
  }

  // Per-token write magnitude strip — variable-width chips sized to token text
  function drawWriteStrip(writes: number[]) {
    const rh = RESID_CHIP_H * s;
    const gap = RESID_CHIP_GAP * s;
    const padX = RESID_PAD_X * s;
    const minW = RESID_CHIP_MIN_W * s;

    const sp = RESID_STRIP_PAD * s;
    const availCW = cw - sp * 2;

    if (!isActive || writes.length === 0) {
      // Draw grey background at the height the active layout would use (if tokens
      // are known) so the strip never visually shrinks between passes.
      let bh = RESID_PLACEHOLDER_H * s;
      if (tokens.length > 0) {
        c.font = `${Math.round(6.5 * s)}px "JetBrains Mono", monospace`;
        let cx = 0,
          rows = 1;
        for (const label of tokens) {
          const chipW = Math.max(minW, Math.round(c.measureText(label).width + padX * 2));
          if (cx > 0 && cx + gap + chipW > availCW) {
            rows++;
            cx = chipW;
          } else {
            cx = cx === 0 ? chipW : cx + gap + chipW;
          }
        }
        bh = Math.max(RESID_PLACEHOLDER_H * s, sp * 2 + rows * rh + (rows - 1) * gap);
      }
      c.fillStyle = 'rgba(255,255,255,0.06)';
      c.fillRect(pad, y, cw, bh);
      y += bh + SEC_GAP * s;
      return;
    }

    const T = writes.length;
    c.font = `${Math.round(6.5 * s)}px "JetBrains Mono", monospace`;

    // First pass: measure chip widths and compute total block height
    const chipWidths: number[] = [];
    let cx = 0,
      totalRows = 1;
    for (let i = 0; i < T; i++) {
      const label = tokens[i] ?? '';
      const chipW = Math.max(minW, Math.round(c.measureText(label).width + padX * 2));
      chipWidths.push(chipW);
      if (cx > 0 && cx + gap + chipW > availCW) {
        totalRows++;
        cx = chipW;
      } else {
        cx = cx === 0 ? chipW : cx + gap + chipW;
      }
    }
    const blockH = Math.max(
      RESID_PLACEHOLDER_H * s,
      sp * 2 + totalRows * rh + (totalRows - 1) * gap
    );

    // Draw full-width background behind all chips
    c.fillStyle = 'rgba(255,255,255,0.06)';
    c.fillRect(pad, y, cw, blockH);

    // Second pass: draw chips on top of background (inset by strip padding)
    cx = 0;
    let row = 0;
    const chipBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)';
    c.lineWidth = 1;
    for (let i = 0; i < T; i++) {
      const chipW = chipWidths[i];
      const label = tokens[i] ?? '';

      // During decode only the last position (new token) is being written to;
      // earlier positions are cached and no longer updated.
      const isCurrent = !isDecoding || i === T - 1;

      if (cx > 0 && cx + gap + chipW > availCW) {
        row++;
        cx = 0;
      }

      const rx = pad + sp + cx;
      const ry = y + sp + row * (rh + gap);
      const w = writes[i] ?? 0;

      if (isCurrent) {
        const a = Math.round((0.08 + w * 0.82) * 1000) / 1000;
        c.fillStyle = `rgba(${COOL},${a})`;
      } else {
        c.fillStyle = `rgba(${COOL},0.14)`;
      }
      c.fillRect(rx, ry, chipW, rh);

      c.strokeStyle = chipBorder;
      c.strokeRect(rx + 0.5, ry + 0.5, chipW - 1, rh - 1);

      if (label) {
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        if (isCurrent) {
          c.fillStyle = w > 0.5 ? 'rgba(8,8,8,0.85)' : `rgba(${COOL},0.65)`;
        } else {
          c.fillStyle = `rgba(${COOL},0.35)`;
        }
        c.fillText(label, rx + chipW / 2, ry + rh / 2);
      }

      cx += chipW + gap;
    }

    y += blockH + SEC_GAP * s;
  }

  const acidLabel = state === 'done' ? acidDoneA : state === 'processing' ? acidProcA : labelOff;
  const coolLabel = state === 'done' ? coolDoneA : state === 'processing' ? coolProcA : labelOff;

  // LN 1
  drawLabel('LN 1', coolLabel);
  drawBar(data.ln1);

  // ATTN
  drawLabel('ATTN', acidLabel);

  for (let h = 0; h < NUM_HEADS; h++) {
    const col = h % HEAD_COLS;
    const row = Math.floor(h / HEAD_COLS);
    const hx = pad + col * (HEAD_W + HEAD_INNER_GAP) * s;
    const hy = y + row * (HEAD_H + HEAD_INNER_GAP) * s;
    const hw = HEAD_W * s;
    const cellSz = hw / SEQ_LEN;
    const sz = cellSz - 1;

    if (!isActive) {
      // Entire head is one color — single fillStyle + N fillRects
      c.fillStyle = 'rgba(255,255,255,0.05)';
      for (let i = 0; i < SEQ_LEN; i++) {
        for (let j = 0; j <= i; j++) {
          c.fillRect(hx + j * cellSz, hy + i * cellSz, sz, sz);
        }
      }
      // Causal mask (upper triangle)
      c.fillStyle = 'rgba(255,255,255,0.015)';
      for (let i = 0; i < SEQ_LEN; i++) {
        for (let j = i + 1; j < SEQ_LEN; j++) {
          c.fillRect(hx + j * cellSz, hy + i * cellSz, sz, sz);
        }
      }
    } else if (!data.attn[h]) {
      // Data not arrived yet — hint across all non-masked cells, mask the upper triangle
      c.fillStyle = attnHint;
      for (let i = 0; i < SEQ_LEN; i++) {
        for (let j = 0; j <= i; j++) {
          c.fillRect(hx + j * cellSz, hy + i * cellSz, sz, sz);
        }
      }
      c.fillStyle = 'rgba(255,255,255,0.015)';
      for (let i = 0; i < SEQ_LEN; i++) {
        for (let j = i + 1; j < SEQ_LEN; j++) {
          c.fillRect(hx + j * cellSz, hy + i * cellSz, sz, sz);
        }
      }
    } else {
      // Data present — causal mask first (one fillStyle for all masked cells)
      c.fillStyle = 'rgba(255,255,255,0.015)';
      for (let i = 0; i < SEQ_LEN; i++) {
        for (let j = i + 1; j < SEQ_LEN; j++) {
          c.fillRect(hx + j * cellSz, hy + i * cellSz, sz, sz);
        }
      }
      // Data cells — LUT lookup, no string allocation
      const headRow = data.attn[h];
      for (let i = 0; i < SEQ_LEN; i++) {
        for (let j = 0; j <= i; j++) {
          const w = headRow[i]?.[j] ?? 0;
          c.fillStyle = attnLut[Math.min(255, Math.round(w * 255))];
          c.fillRect(hx + j * cellSz, hy + i * cellSz, sz, sz);
        }
      }
    }
  }

  y += (ATTN_BLOCK_H + SEC_GAP) * s;

  // RESIDUAL MID — how much attention wrote to each token's stream this layer
  drawLabel('RESIDUAL MID', coolLabel);
  drawWriteStrip(data.attn_write);

  // LN 2
  drawLabel('LN 2', coolLabel);
  drawBar(data.ln2);

  // MLP
  drawLabel('MLP', acidLabel);

  const ncell = NEURON_CELL * s;
  const ngap = 1 * s;
  const stride = ncell + ngap;
  const mlpOff = 'rgba(255,255,255,0.04)';

  if (!isActive) {
    // All neurons same color — one fillStyle for 3072 fillRects
    c.fillStyle = mlpOff;
    for (let n = 0; n < MLP_DIM; n++) {
      c.fillRect(
        pad + (n % MLP_COLS) * stride,
        y + Math.floor(n / MLP_COLS) * stride,
        ncell,
        ncell
      );
    }
  } else if (state === 'processing' && data.mlp.length === 0) {
    // All 3072 neurons activate simultaneously via matmul — show uniform
    // dim hint across every neuron while data is in transit
    c.fillStyle = mlpHint;
    for (let n = 0; n < MLP_DIM; n++) {
      c.fillRect(
        pad + (n % MLP_COLS) * stride,
        y + Math.floor(n / MLP_COLS) * stride,
        ncell,
        ncell
      );
    }
  } else {
    for (let n = 0; n < MLP_DIM; n++) {
      const act = data.mlp[n] ?? 0;
      const idx = Math.min(255, Math.round(act * 255));
      c.fillStyle = idx < 13 ? mlpOff : mlpLut[idx];
      c.fillRect(
        pad + (n % MLP_COLS) * stride,
        y + Math.floor(n / MLP_COLS) * stride,
        ncell,
        ncell
      );
    }
  }

  // RESIDUAL POST — how much the MLP wrote to each token's stream this layer
  y += MLP_BLOCK_H * s + SEC_GAP * s;
  drawLabel('RESIDUAL POST', coolLabel);
  drawWriteStrip(data.mlp_write);
}

export type LayerRegion = 'ln1' | 'attn' | 'residual_mid' | 'ln2' | 'mlp' | 'residual_post';

interface HitRegion {
  region: LayerRegion;
  yStart: number;
  yEnd: number;
}

/**
 * Returns the logical-pixel Y ranges (before DPR scaling) for each named region
 * in the canvas. Mirrors the draw order in drawLayerCanvas exactly so that
 * mouse hit-testing in LayerCard maps correctly to tooltip content.
 *
 * Drawing order:
 *   y starts at CARD_PAD
 *   drawLabel → y += LABEL_H
 *   drawBar   → y += BAR_H + SEC_GAP
 *   (attn grid drawn at y, then) y += ATTN_BLOCK_H + SEC_GAP
 *   drawWriteStrip → y += residH + SEC_GAP
 *   (repeat for LN2, MLP, RESIDUAL POST)
 */
function computeLayerHitRegions(tokens: string[], isActive = false): HitRegion[] {
  let y = CARD_PAD;

  const residH = computeResidH(tokens, isActive);

  const regions: HitRegion[] = [];

  // LN 1: label + bar (drawLabel then drawBar)
  const ln1Start = y;
  y += LABEL_H + BAR_H + SEC_GAP;
  regions.push({ region: 'ln1', yStart: ln1Start, yEnd: y });

  // ATTN: label + grid block
  const attnStart = y;
  y += LABEL_H + ATTN_BLOCK_H + SEC_GAP;
  regions.push({ region: 'attn', yStart: attnStart, yEnd: y });

  // RESIDUAL MID: label + write strip
  const residMidStart = y;
  y += LABEL_H + residH + SEC_GAP;
  regions.push({ region: 'residual_mid', yStart: residMidStart, yEnd: y });

  // LN 2: label + bar
  const ln2Start = y;
  y += LABEL_H + BAR_H + SEC_GAP;
  regions.push({ region: 'ln2', yStart: ln2Start, yEnd: y });

  // MLP: label + neuron grid
  const mlpStart = y;
  y += LABEL_H + MLP_BLOCK_H + SEC_GAP;
  regions.push({ region: 'mlp', yStart: mlpStart, yEnd: y });

  // RESIDUAL POST: label + write strip
  const residPostStart = y;
  y += LABEL_H + residH + CARD_PAD;
  regions.push({ region: 'residual_post', yStart: residPostStart, yEnd: y });

  return regions;
}

export { computeCanvasH, computeLayerHitRegions, drawLayerCanvas };

export default function LayerCanvas({
  layerIndex: _layerIndex,
  state,
  data,
  tokens = [],
  isDecoding = false,
}: LayerCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const dataRef = useRef(data);
  const tokensRef = useRef(tokens);
  const isDecodingRef = useRef(isDecoding);
  stateRef.current = state;
  dataRef.current = data;
  tokensRef.current = tokens;
  isDecodingRef.current = isDecoding;

  // Preserve the last active canvas height so layers don't jump/collapse
  // when transitioning back to inactive between passes.
  // INVARIANT: this ref is ONLY mutated inside useEffect (post-commit), never
  // during render, to avoid React StrictMode double-invoke clobbering it.
  const lastCanvasHRef = useRef<number>(0);

  // Preserve last computed LayerData so attention heads and residual strips
  // continue showing their patterns between decode passes (not reset to blank).
  const lastActiveDataRef = useRef<LayerData | null>(null);

  const { isDark } = useTheme();
  const isDarkRef = useRef(isDark);
  isDarkRef.current = isDark;

  // Pure read: returns the height to use given the current saved ref value.
  // Never mutates lastCanvasHRef — safe to call during render.
  function readStableH(toks: string[], active: boolean): number {
    if (active && toks.length > 0) {
      // Active pass: use the computed height directly (ref will be updated in effect).
      return computeCanvasH(toks, active);
    }
    if (toks.length > 0 && lastCanvasHRef.current > 0) {
      // Inactive but tokens still present: hold the last saved height.
      return lastCanvasHRef.current;
    }
    // True reset (tokens empty) or no saved height yet: use placeholder.
    return computeCanvasH(toks, active);
  }

  // Mutating update: must only be called from useEffect (after commit).
  function commitStableH(toks: string[], active: boolean): number {
    if (active && toks.length > 0) {
      const h = computeCanvasH(toks, active);
      lastCanvasHRef.current = h;
      return h;
    }
    if (toks.length > 0 && lastCanvasHRef.current > 0) {
      return lastCanvasHRef.current;
    }
    // True reset.
    lastCanvasHRef.current = 0;
    return computeCanvasH(toks, active);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once DPR listener; all values accessed via refs
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function applySize() {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const st = stateRef.current;
      const active = st === 'done' || st === 'processing';
      const h = commitStableH(tokensRef.current, active);
      canvas.width = Math.round(CARD_W * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${CARD_W}px`;
      canvas.style.height = `${h}px`;
      const preserved = lastActiveDataRef.current;
      const drawSt =
        st === 'inactive' && tokensRef.current.length > 0 && preserved !== null ? 'done' : st;
      const drawData =
        drawSt === 'done' && st === 'inactive' && preserved !== null ? preserved : dataRef.current;
      drawLayerCanvas(
        canvas,
        drawSt,
        drawData,
        isDarkRef.current,
        tokensRef.current,
        isDecodingRef.current
      );
    }

    let mql: MediaQueryList;
    function subscribe() {
      mql = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mql.addEventListener('change', onDprChange, { once: true });
    }
    function onDprChange() {
      applySize();
      subscribe();
    }

    applySize();
    subscribe();

    return () => mql?.removeEventListener('change', onDprChange);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: commitStableH is a local function, not a dep
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const active = state === 'done' || state === 'processing';
    const h = commitStableH(tokens, active);
    canvas.width = Math.round(CARD_W * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${CARD_W}px`;
    canvas.style.height = `${h}px`;
    if (state === 'done' && data.attn.length > 0) {
      lastActiveDataRef.current = data;
    } else if (tokens.length === 0) {
      lastActiveDataRef.current = null;
    }
    const preserved = lastActiveDataRef.current;
    const drawSt = state === 'inactive' && tokens.length > 0 && preserved !== null ? 'done' : state;
    const drawData =
      drawSt === 'done' && state === 'inactive' && preserved !== null ? preserved : data;
    drawLayerCanvas(canvas, drawSt, drawData, isDark, tokens, isDecoding);
  }, [state, data, isDark, tokens, isDecoding]);

  const active = state === 'done' || state === 'processing';
  const canvasH = readStableH(tokens, active);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`Layer visualization — ${state}`}
      style={{
        display: 'block',
        width: `${CARD_W}px`,
        height: `${canvasH}px`,
      }}
    />
  );
}
