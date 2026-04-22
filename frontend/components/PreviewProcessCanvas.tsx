'use client'

import { useEffect, useRef } from 'react'
import { ACID_DARK, ACID_LIGHT, canvasBg } from '@/lib/canvasTheme'
import { useTheme } from '@/lib/ThemeContext'
import styles from './PreviewProcessCanvas.module.css'

const N = 7
const TOKENS = ['the', 'cat', 'sat', 'on', 'the', 'soft', 'mat']

function makeWeights(): number[][] {
  return Array.from({ length: N }, (_, i) =>
    Array.from({ length: N }, (_, j) => {
      if (j > i) return 0
      if (j === i) return 0.1 + Math.random() * 0.25
      if (j === i - 1) return 0.3 + Math.random() * 0.45
      // Hero: mat→cat (row 6, col 1) — long-range semantic link
      if (i === 6 && j === 1) return 0.5 + Math.random() * 0.4
      // Secondary: mat→soft (row 6, col 5)
      if (i === 6 && j === 5) return 0.3 + Math.random() * 0.3
      // Attention sink at first token
      if (j === 0) return 0.04 + Math.random() * 0.1
      return Math.max(0, Math.random() * 0.28 - 0.05)
    })
  )
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function lerpWeights(
  cur: number[][],
  tgt: number[][],
  alpha: number
): number[][] {
  return cur.map((row, i) => row.map((v, j) => lerp(v, tgt[i][j], alpha)))
}

export default function PreviewProcessCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const weightsRef = useRef<number[][]>(makeWeights())
  const targetRef = useRef<number[][]>(makeWeights())
  const lastSwapRef = useRef<number>(0)

  const { isDark } = useTheme()
  const isDarkRef = useRef(isDark)
  isDarkRef.current = isDark

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    function resize() {
      if (!canvas) return
      const rect = canvas.parentElement?.getBoundingClientRect()
      if (!rect) return
      const dpr = devicePixelRatio
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
    }

    function draw() {
      if (!canvas || !ctx) return
      const W = canvas.width
      const H = canvas.height
      const dpr = devicePixelRatio
      const dark = isDarkRef.current

      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = canvasBg(dark)
      ctx.fillRect(0, 0, W, H)

      const pad = 28 * dpr
      const labelW = 32 * dpr
      const labelH = 22 * dpr
      const gridW = W - pad * 2 - labelW
      const gridH = H - pad * 2 - labelH
      const cw = gridW / N
      const ch = gridH / N
      const fontSize = Math.floor(Math.min(cw, ch) * 0.28)

      const weights = weightsRef.current

      weights.forEach((row, i) => {
        row.forEach((v, j) => {
          if (j > i) return
          const x = pad + labelW + j * cw
          const y = pad + labelH + i * ch
          const alpha = 0.03 + v * 0.88
          ctx.fillStyle = `rgba(${dark ? ACID_DARK : ACID_LIGHT},${alpha})`
          ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2)

          if (v > 0.38) {
            ctx.fillStyle = `rgba(10,10,10,${0.6 + v * 0.35})`
            ctx.font = `${fontSize}px "JetBrains Mono", monospace`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(v.toFixed(2), x + cw / 2, y + ch / 2)
          }
        })
      })

      ctx.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx.lineWidth = 0.5 * dpr
      for (let i = 0; i <= N; i++) {
        const x = pad + labelW + i * cw
        const y = pad + labelH + i * ch
        ctx.beginPath()
        ctx.moveTo(x, pad + labelH)
        ctx.lineTo(x, pad + labelH + gridH)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(pad + labelW, y)
        ctx.lineTo(pad + labelW + gridW, y)
        ctx.stroke()
      }

      ctx.fillStyle = 'rgba(160,160,160,0.8)'
      ctx.font = `${Math.floor(fontSize * 0.9)}px "JetBrains Mono", monospace`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      TOKENS.forEach((tok, i) => {
        ctx.fillText(
          tok,
          pad + labelW - 6 * dpr,
          pad + labelH + i * ch + ch / 2
        )
      })

      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      TOKENS.forEach((tok, j) => {
        ctx.fillText(
          tok,
          pad + labelW + j * cw + cw / 2,
          pad + labelH - 5 * dpr
        )
      })
    }

    let rafId: number

    function loop(ts: number) {
      if (ts - lastSwapRef.current > 2200) {
        targetRef.current = makeWeights()
        lastSwapRef.current = ts
      }
      weightsRef.current = lerpWeights(
        weightsRef.current,
        targetRef.current,
        0.03
      )
      draw()
      rafId = requestAnimationFrame(loop)
    }

    resize()
    rafId = requestAnimationFrame(loop)
    window.addEventListener('resize', resize)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className={styles.canvas} />
}
