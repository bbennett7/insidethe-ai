'use client'

import { useEffect, useRef } from 'react'
import { ACID_DARK, ACID_LIGHT, COOL } from '@/lib/canvasTheme'
import type { LayerData, LayerState } from '@/lib/processingTypes'
import { useTheme } from '@/lib/ThemeContext'

interface LayerCanvasProps {
  layerIndex: number
  state: LayerState
  data: LayerData
  tokens?: string[]
  isDecoding?: boolean
}

const CARD_W = 219
const CARD_PAD = 12
const CONTENT_W = CARD_W - CARD_PAD * 2
const LABEL_H = 13
const SEC_GAP = 10
const BAR_H = 5
const NUM_HEADS = 12
const HEAD_COLS = 6
const HEAD_ROWS = Math.ceil(NUM_HEADS / HEAD_COLS)
const HEAD_INNER_GAP = 3
const HEAD_W = Math.floor(
  (CONTENT_W - HEAD_INNER_GAP * (HEAD_COLS - 1)) / HEAD_COLS
)
const HEAD_H = HEAD_W
const ATTN_BLOCK_H = HEAD_ROWS * HEAD_H + (HEAD_ROWS - 1) * HEAD_INNER_GAP
const MLP_COLS = 32
const MLP_ROWS = Math.ceil(3072 / MLP_COLS)
const MLP_DIM = 3072
const NEURON_CELL = Math.floor((CONTENT_W - (MLP_COLS - 1) * 1) / MLP_COLS)
const MLP_BLOCK_H = MLP_ROWS * NEURON_CELL + (MLP_ROWS - 1) * 1
const RESID_CHIP_H = 18
const RESID_CHIP_W = 28
const RESID_CHIP_GAP = 3
const RESID_PLACEHOLDER_H = RESID_CHIP_H + 6
const CHIPS_PER_ROW = Math.floor(CONTENT_W / (RESID_CHIP_W + RESID_CHIP_GAP))

function computeResidH(T: number, isActive = false): number {
  if (!isActive) return RESID_PLACEHOLDER_H
  const rows = Math.ceil(T / CHIPS_PER_ROW) || 1
  return rows * RESID_CHIP_H + (rows - 1) * RESID_CHIP_GAP
}

function computeCanvasH(seqLen: number, isActive = false): number {
  const residH = computeResidH(seqLen, isActive)
  return Math.ceil(
    CARD_PAD +
      LABEL_H + SEC_GAP / 2 + BAR_H + SEC_GAP +
      LABEL_H + SEC_GAP / 2 + ATTN_BLOCK_H + SEC_GAP +
      LABEL_H + SEC_GAP / 2 + residH + SEC_GAP +
      LABEL_H + SEC_GAP / 2 + BAR_H + SEC_GAP +
      LABEL_H + SEC_GAP / 2 + MLP_BLOCK_H + SEC_GAP +
      LABEL_H + SEC_GAP / 2 + residH +
      CARD_PAD
  )
}

function drawLayerCanvas(
  canvas: HTMLCanvasElement,
  state: LayerState,
  data: LayerData,
  isDark: boolean,
  tokens: string[] = [],
  isDecoding = false
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const W = canvas.width
  const H = canvas.height
  const s = dpr

  ctx.clearRect(0, 0, W, H)

  const pad = CARD_PAD * s
  const cw = CONTENT_W * s
  let y = pad

  const isActive = state === 'done' || state === 'processing'
  const c = ctx

  const SEQ_LEN = data.attn[0]?.length ?? 6

  // Acid color for ATTN + MLP sections
  const acidActive = isDark ? ACID_DARK : ACID_LIGHT
  const acidDoneA = isDark ? 'rgba(138,171,42,0.8)' : 'rgba(143,220,0,0.8)'
  const acidProcA = isDark ? 'rgba(196,255,61,0.8)' : 'rgba(143,220,0,0.9)'
  const labelOff = isDark ? 'rgba(85,85,85,0.7)' : 'rgba(130,130,130,0.8)'

  // Cool color for LN + RESIDUAL sections (same in dark and light)
  const coolDoneA = `rgba(${COOL},0.75)`
  const coolProcA = `rgba(${COOL},0.95)`

  function drawLabel(text: string, color: string) {
    c.fillStyle = color
    c.font = `${Math.round(8 * s)}px "JetBrains Mono", monospace`
    c.textAlign = 'left'
    c.textBaseline = 'top'
    c.fillText(text, pad, y)
    y += LABEL_H * s
  }

  function drawBar(fill: number) {
    const bh = BAR_H * s
    c.fillStyle = 'rgba(255,255,255,0.06)'
    c.fillRect(pad, y, cw, bh)
    if (isActive && fill > 0) {
      c.fillStyle = state === 'processing' ? coolProcA : coolDoneA
      c.fillRect(pad, y, cw * fill, bh)
    }
    y += bh + SEC_GAP * s
  }

  // Per-token write magnitude strip — fixed-width chips that wrap to new rows
  function drawWriteStrip(writes: number[]) {
    if (!isActive) {
      const bh = RESID_PLACEHOLDER_H * s
      c.fillStyle = 'rgba(255,255,255,0.06)'
      c.fillRect(pad, y, cw, bh)
      y += bh + SEC_GAP * s
      return
    }

    const T = writes.length
    const rh = RESID_CHIP_H * s
    const cw_chip = RESID_CHIP_W * s
    const gap = RESID_CHIP_GAP * s

    for (let i = 0; i < T; i++) {
      const col = i % CHIPS_PER_ROW
      const row = Math.floor(i / CHIPS_PER_ROW)
      const rx = pad + col * (cw_chip + gap)
      const ry = y + row * (rh + gap)
      const w = writes[i] ?? 0

      // During decode only the last position (new token) is being written to;
      // earlier positions are cached and no longer updated.
      const isCurrent = !isDecoding || i === T - 1

      if (isCurrent) {
        const a = Math.round((0.08 + w * 0.82) * 1000) / 1000
        c.fillStyle = `rgba(${COOL},${a})`
      } else {
        c.fillStyle = `rgba(${COOL},0.14)`
      }
      c.fillRect(rx, ry, cw_chip, rh)

      const label = tokens[i]
      if (isActive && label) {
        c.font = `${Math.round(6.5 * s)}px "JetBrains Mono", monospace`
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        if (isCurrent) {
          c.fillStyle = w > 0.5 ? 'rgba(8,8,8,0.85)' : `rgba(${COOL},0.65)`
        } else {
          c.fillStyle = `rgba(${COOL},0.35)`
        }
        c.fillText(label, rx + cw_chip / 2, ry + rh / 2)
      }
    }

    const rows = Math.ceil(T / CHIPS_PER_ROW) || 1
    y += (rows * rh + (rows - 1) * gap) + SEC_GAP * s
  }

  const acidLabel = state === 'done' ? acidDoneA : state === 'processing' ? acidProcA : labelOff
  const coolLabel = state === 'done' ? coolDoneA : state === 'processing' ? coolProcA : labelOff

  // LN 1
  drawLabel('LN 1', coolLabel)
  drawBar(data.ln1)

  // ATTN
  drawLabel('ATTN', acidLabel)

  for (let h = 0; h < NUM_HEADS; h++) {
    const col = h % HEAD_COLS
    const row = Math.floor(h / HEAD_COLS)
    const hx = pad + col * (HEAD_W + HEAD_INNER_GAP) * s
    const hy = y + row * (HEAD_H + HEAD_INNER_GAP) * s
    const hw = HEAD_W * s
    const cellSz = hw / SEQ_LEN

    for (let i = 0; i < SEQ_LEN; i++) {
      for (let j = 0; j < SEQ_LEN; j++) {
        const cellX = hx + j * cellSz
        const cellY = hy + i * cellSz
        const sz = cellSz - 1

        if (j > i) {
          c.fillStyle = 'rgba(255,255,255,0.015)'
        } else if (!isActive) {
          c.fillStyle = 'rgba(255,255,255,0.05)'
        } else {
          const w = data.attn[h][i][j]
          if (state === 'processing' && h >= 7) {
            c.fillStyle = 'rgba(255,255,255,0.05)'
          } else {
            const a = Math.round((0.04 + w * 0.94) * 1000) / 1000
            c.fillStyle = `rgba(${acidActive},${a})`
          }
        }
        c.fillRect(cellX, cellY, sz, sz)
      }
    }
  }

  y += (ATTN_BLOCK_H + SEC_GAP) * s

  // RESIDUAL MID — how much attention wrote to each token's stream this layer
  drawLabel('RESIDUAL MID', coolLabel)
  drawWriteStrip(data.attn_write)

  // LN 2
  drawLabel('LN 2', coolLabel)
  drawBar(data.ln2)

  // MLP
  drawLabel('MLP', acidLabel)

  const ncell = NEURON_CELL * s
  const ngap = 1 * s
  const mlpOff = 'rgba(255,255,255,0.04)'

  for (let n = 0; n < MLP_DIM; n++) {
    const col = n % MLP_COLS
    const row = Math.floor(n / MLP_COLS)
    const nx = pad + col * (ncell + ngap)
    const ny = y + row * (ncell + ngap)

    if (!isActive) {
      c.fillStyle = mlpOff
    } else {
      const act = data.mlp[n]
      if (state === 'processing') {
        const processedRows = Math.floor(MLP_ROWS * 0.55)
        if (row < processedRows) {
          c.fillStyle =
            act < 0.02
              ? mlpOff
              : `rgba(${acidActive},${Math.round((0.06 + act * 0.88) * 1000) / 1000})`
        } else {
          c.fillStyle = mlpOff
        }
      } else {
        c.fillStyle =
          act < 0.02
            ? mlpOff
            : `rgba(${acidActive},${Math.round((0.06 + act * 0.88) * 1000) / 1000})`
      }
    }
    c.fillRect(nx, ny, ncell, ncell)
  }

  // RESIDUAL POST — how much the MLP wrote to each token's stream this layer
  y += MLP_BLOCK_H * s + SEC_GAP * s
  drawLabel('RESIDUAL POST', coolLabel)
  drawWriteStrip(data.mlp_write)
}

export { computeCanvasH, drawLayerCanvas }

export default function LayerCanvas({
  layerIndex: _layerIndex,
  state,
  data,
  tokens = [],
  isDecoding = false,
}: LayerCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef(state)
  const dataRef = useRef(data)
  const tokensRef = useRef(tokens)
  const isDecodingRef = useRef(isDecoding)
  stateRef.current = state
  dataRef.current = data
  tokensRef.current = tokens
  isDecodingRef.current = isDecoding

  const { isDark } = useTheme()
  const isDarkRef = useRef(isDark)
  isDarkRef.current = isDark

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    function applySize() {
      if (!canvas) return
      const dpr = window.devicePixelRatio || 1
      const T = dataRef.current.attn[0]?.length ?? 6
      const active = stateRef.current === 'done' || stateRef.current === 'processing'
      const h = computeCanvasH(T, active)
      canvas.width = Math.round(CARD_W * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${CARD_W}px`
      canvas.style.height = `${h}px`
      drawLayerCanvas(
        canvas,
        stateRef.current,
        dataRef.current,
        isDarkRef.current,
        tokensRef.current,
        isDecodingRef.current
      )
    }

    let mql: MediaQueryList
    function subscribe() {
      mql = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      mql.addEventListener('change', onDprChange, { once: true })
    }
    function onDprChange() {
      applySize()
      subscribe()
    }

    applySize()
    subscribe()

    return () => mql?.removeEventListener('change', onDprChange)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const T = data.attn[0]?.length ?? 6
    const active = state === 'done' || state === 'processing'
    const h = computeCanvasH(T, active)
    canvas.width = Math.round(CARD_W * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = `${CARD_W}px`
    canvas.style.height = `${h}px`
    drawLayerCanvas(canvas, state, data, isDark, tokens, isDecoding)
  }, [state, data, isDark, tokens, isDecoding])

  const active = state === 'done' || state === 'processing'
  const canvasH = computeCanvasH(data.attn[0]?.length ?? 6, active)

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
  )
}
