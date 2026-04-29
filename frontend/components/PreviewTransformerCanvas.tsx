'use client'

import { useEffect, useRef } from 'react'
import { ACID_DARK, ACID_LIGHT, canvasBg } from '@/lib/canvasTheme'
import { useTheme } from '@/lib/ThemeContext'

const LAYERS = 4
const HEADS = 6
const TOKENS = 6

// Fixed FFN bar heights per [layer][token] — visually varied but stable
const FFN_HEIGHTS = [
  [0.55, 0.82, 0.45, 0.91, 0.63, 0.38],
  [0.72, 0.48, 0.88, 0.34, 0.76, 0.59],
  [0.41, 0.93, 0.61, 0.78, 0.42, 0.85],
  [0.68, 0.37, 0.74, 0.52, 0.89, 0.46],
]

export default function PreviewTransformerCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { isDark } = useTheme()
  const isDarkRef = useRef(isDark)
  isDarkRef.current = isDark

  // biome-ignore lint/correctness/useExhaustiveDependencies: isDark is a trigger; draw() reads isDarkRef.current
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    function draw() {
      if (!canvas || !ctx) return
      const W = canvas.width
      const H = canvas.height
      const dpr = devicePixelRatio
      const dark = isDarkRef.current
      const acid = dark ? ACID_DARK : ACID_LIGHT

      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = canvasBg(dark)
      ctx.fillRect(0, 0, W, H)

      const padX = 22 * dpr
      const padTop = 18 * dpr
      const padBot = 18 * dpr
      const innerW = W - padX * 2
      const innerH = H - padTop - padBot

      const layerH = innerH / (LAYERS + 0.6)
      const layerGap = layerH * 0.14
      const blockH = layerH - layerGap
      const tokenW = innerW / TOKENS

      // Faint token column stripes
      for (let t = 0; t < TOKENS; t++) {
        const tx = padX + t * tokenW
        ctx.fillStyle = `rgba(${acid},${t % 2 === 0 ? 0.015 : 0.008})`
        ctx.fillRect(tx, padTop, tokenW, innerH)
      }

      for (let l = 0; l < LAYERS; l++) {
        const layerIdx = LAYERS - 1 - l
        const blockY = padTop + l * layerH

        // Residual bypass lines
        const lineX1 = padX + 6 * dpr
        const lineX2 = padX + innerW - 6 * dpr
        ctx.strokeStyle = `rgba(${acid},0.18)`
        ctx.lineWidth = 1.2 * dpr
        ctx.beginPath()
        ctx.moveTo(lineX1, blockY - layerGap / 2)
        ctx.lineTo(lineX1, blockY + blockH + layerGap / 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(lineX2, blockY - layerGap / 2)
        ctx.lineTo(lineX2, blockY + blockH + layerGap / 2)
        ctx.stroke()

        // Block background
        ctx.fillStyle = `rgba(${acid},0.06)`
        ctx.beginPath()
        ctx.roundRect(padX + 14 * dpr, blockY, innerW - 28 * dpr, blockH, 3 * dpr)
        ctx.fill()

        // Block border
        ctx.strokeStyle = `rgba(${acid},0.18)`
        ctx.lineWidth = 0.7 * dpr
        ctx.beginPath()
        ctx.roundRect(padX + 14 * dpr, blockY, innerW - 28 * dpr, blockH, 3 * dpr)
        ctx.stroke()

        const mhaH = blockH * 0.52
        const ffnY = blockY + mhaH + 4 * dpr
        const ffnH = blockH - mhaH - 4 * dpr

        // Attention head dots
        const headAreaX = padX + 22 * dpr
        const headAreaW = innerW - 44 * dpr
        const headDotR = Math.min(4.5 * dpr, (headAreaW / HEADS) * 0.38)
        const headY = blockY + mhaH * 0.45

        for (let h = 0; h < HEADS; h++) {
          const hx = headAreaX + (h + 0.5) * (headAreaW / HEADS)
          ctx.beginPath()
          ctx.arc(hx, headY, headDotR, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${acid},0.38)`
          ctx.fill()
        }

        // Static attention arcs
        for (let h1 = 0; h1 < HEADS; h1++) {
          for (let h2 = h1 + 1; h2 < HEADS; h2++) {
            if ((h1 + h2) % 3 !== 0) continue
            const x1 = headAreaX + (h1 + 0.5) * (headAreaW / HEADS)
            const x2 = headAreaX + (h2 + 0.5) * (headAreaW / HEADS)
            ctx.strokeStyle = `rgba(${acid},0.14)`
            ctx.lineWidth = 0.6 * dpr
            ctx.beginPath()
            ctx.moveTo(x1, headY)
            const cpY = headY - headDotR * 2.5 * (1 + Math.abs(x2 - x1) / (headAreaW * 0.5))
            ctx.quadraticCurveTo((x1 + x2) / 2, cpY, x2, headY)
            ctx.stroke()
          }
        }

        // MHA label
        ctx.fillStyle = `rgba(${acid},0.38)`
        ctx.font = `${Math.round(7.5 * dpr)}px "JetBrains Mono", monospace`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText('MHA', padX + 18 * dpr, blockY + 3.5 * dpr)

        // FFN bars
        const ffnBarW = (headAreaW - (TOKENS - 1) * 3 * dpr) / TOKENS
        for (let t = 0; t < TOKENS; t++) {
          const bx = headAreaX + t * (ffnBarW + 3 * dpr)
          const barH = FFN_HEIGHTS[l][t]
          const bh = ffnH * 0.55 * barH
          ctx.fillStyle = `rgba(${acid},0.28)`
          ctx.fillRect(bx, ffnY + ffnH - bh - 2 * dpr, ffnBarW, bh)
        }

        // FFN label
        ctx.fillStyle = `rgba(${acid},0.38)`
        ctx.fillText('FFN', padX + 18 * dpr, ffnY + 3 * dpr)

        // Layer number badge
        ctx.fillStyle = `rgba(${acid},0.38)`
        ctx.textAlign = 'right'
        ctx.fillText(`L${layerIdx + 1}`, padX + innerW - 18 * dpr, blockY + 3.5 * dpr)
      }

      // Residual connection arrows between layers
      for (let l = 0; l < LAYERS - 1; l++) {
        const y1 = padTop + l * layerH + blockH
        const y2 = padTop + (l + 1) * layerH
        const cx = padX + 6 * dpr
        ctx.strokeStyle = `rgba(${acid},0.2)`
        ctx.lineWidth = 1.2 * dpr
        ctx.beginPath()
        ctx.moveTo(cx, y1)
        ctx.lineTo(cx, y2)
        ctx.stroke()
        ctx.fillStyle = `rgba(${acid},0.2)`
        ctx.beginPath()
        ctx.moveTo(cx - 3 * dpr, y1 + (y2 - y1) * 0.5 - 3 * dpr)
        ctx.lineTo(cx, y1 + (y2 - y1) * 0.5 + 3 * dpr)
        ctx.lineTo(cx + 3 * dpr, y1 + (y2 - y1) * 0.5 - 3 * dpr)
        ctx.fill()
      }

      // Token embedding strip at bottom
      const stripY = padTop + LAYERS * layerH + 2 * dpr
      const stripH = padBot * 0.55
      for (let t = 0; t < TOKENS; t++) {
        const tx = padX + t * tokenW + tokenW * 0.1
        const tw = tokenW * 0.8
        ctx.fillStyle = `rgba(${acid},0.18)`
        ctx.fillRect(tx, stripY, tw, stripH)
      }
    }

    function resize() {
      if (!canvas) return
      const rect = canvas.parentElement?.getBoundingClientRect()
      if (!rect) return
      const dpr = devicePixelRatio
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      draw()
    }

    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [isDark])

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
}
