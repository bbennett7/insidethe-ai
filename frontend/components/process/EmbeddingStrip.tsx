'use client'

import { useCallback, useEffect, useRef } from 'react'
import { NEGATIVE, POSITIVE } from '@/lib/canvasTheme'
import { seededRng } from '@/mocks/rng'

interface EmbeddingStripProps {
  tokenIndex: number
  width: number
  animating: boolean
  speedRef: React.MutableRefObject<number>
}

const EMBED_CELL_W = 4
const EMBED_CELL_H = 6
const EMBED_GAP = 1

function genEmbedVector(tokenIdx: number): Float32Array {
  const rng = seededRng(tokenIdx * 233 + 91)
  return Float32Array.from({ length: 768 }, () => {
    const v = rng() * 2 - 1
    return v * v * Math.sign(v)
  })
}

function drawEmbedSlot(
  ctx: CanvasRenderingContext2D,
  vector: Float32Array,
  offset: number,
  canvasW: number,
  canvasH: number,
  numCells: number,
  dpr: number
) {
  const stride = (EMBED_CELL_W + EMBED_GAP) * dpr
  const cellW = EMBED_CELL_W * dpr
  const frac = offset % 1

  ctx.clearRect(0, 0, canvasW, canvasH)
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, canvasW, canvasH)
  ctx.clip()
  ctx.translate(-frac * stride, 0)

  const startDim = Math.floor(offset)
  for (let c = 0; c <= numCells + 1; c++) {
    const dim = (startDim + c) % 768
    const v = vector[dim]
    const abs = Math.abs(v)
    const alpha = (0.1 + abs * 0.85).toFixed(3)
    ctx.fillStyle =
      v >= 0 ? `rgba(${POSITIVE},${alpha})` : `rgba(${NEGATIVE},${alpha})`
    ctx.fillRect(c * stride, 0, cellW, canvasH)
  }
  ctx.restore()
}

export default function EmbeddingStrip({
  tokenIndex,
  width,
  animating,
  speedRef,
}: EmbeddingStripProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const offsetRef = useRef<number>(tokenIndex * 47)
  const animIdRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)
  const vectorRef = useRef<Float32Array>(genEmbedVector(tokenIndex))

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const numCells = Math.floor(width / (EMBED_CELL_W + EMBED_GAP))
    drawEmbedSlot(
      ctx,
      vectorRef.current,
      offsetRef.current,
      canvas.width,
      canvas.height,
      numCells,
      dpr
    )
  }, [width])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(EMBED_CELL_H * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${EMBED_CELL_H}px`
    draw()
  }, [width, draw])

  useEffect(() => {
    if (!animating) {
      if (animIdRef.current !== null) {
        cancelAnimationFrame(animIdRef.current)
        animIdRef.current = null
      }
      lastTsRef.current = null
      return
    }

    function loop(ts: number) {
      const dt = Math.min(lastTsRef.current ? ts - lastTsRef.current : 16, 50)
      lastTsRef.current = ts
      const speed = speedRef.current
      const scroll = (speed * 0.007 + 0.0008) * dt
      offsetRef.current = (offsetRef.current + scroll) % 768
      draw()
      animIdRef.current = requestAnimationFrame(loop)
    }

    animIdRef.current = requestAnimationFrame(loop)

    return () => {
      if (animIdRef.current !== null) {
        cancelAnimationFrame(animIdRef.current)
        animIdRef.current = null
      }
      lastTsRef.current = null
    }
  }, [animating, draw, speedRef])

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: `${width}px`,
        height: `${EMBED_CELL_H}px`,
        marginTop: '4px',
        imageRendering: 'pixelated',
        borderRadius: '1px',
      }}
    />
  )
}
