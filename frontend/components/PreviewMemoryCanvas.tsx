'use client'

import { useEffect, useRef } from 'react'
import { acidRgba, canvasBg } from '@/lib/canvasTheme'
import { useTheme } from '@/lib/ThemeContext'

export default function PreviewMemoryCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { isDark } = useTheme()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    function draw() {
      if (!canvas || !ctx) return
      const rect = canvas.parentElement?.getBoundingClientRect()
      if (!rect) return
      const dpr = devicePixelRatio
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`

      const W = canvas.width
      const H = canvas.height
      ctx.fillStyle = canvasBg(isDark)
      ctx.fillRect(0, 0, W, H)

      function rotText(
        text: string,
        x: number,
        y: number,
        size: number,
        alpha: number,
        deg: number,
        mono?: boolean
      ) {
        ctx!.save()
        ctx!.globalAlpha = alpha
        ctx!.translate(x, y)
        ctx!.rotate((deg * Math.PI) / 180)
        ctx!.font = mono
          ? `400 ${size}px "JetBrains Mono", monospace`
          : `italic 300 ${size}px "Fraunces", "Times New Roman", serif`
        ctx!.fillStyle = isDark ? 'rgba(244,241,234,1)' : 'rgba(10,10,10,1)'
        ctx!.textAlign = 'left'
        ctx!.textBaseline = 'top'
        ctx!.fillText(text, 0, 0)
        ctx!.restore()
      }

      const d = dpr

      // Six palimpsest layers, oldest (most faded) first
      rotText('remember when', -0.05 * W, 0.1 * H, 62 * d, 0.055, -8)
      rotText('a conversation we had', 0.1 * W, 0.4 * H, 30 * d, 0.1, -3)
      rotText('the mind of the model', 0.35 * W, 0.24 * H, 18 * d, 0.15, 4)
      rotText(
        'system · you are a helpful assistant…',
        0.07 * W,
        0.66 * H,
        9 * d,
        0.2,
        -1,
        true
      )
      rotText('what was said before', 0.22 * W, 0.54 * H, 22 * d, 0.26, 2)

      // Top layer: crisp text with acid-highlighted phrase
      ctx.save()
      ctx.translate(0.175 * W, 0.36 * H)
      ctx.rotate((-0.5 * Math.PI) / 180)

      const topPx = 26 * d
      ctx.font = `italic 400 ${topPx}px "Fraunces", "Times New Roman", serif`
      ctx.fillStyle = isDark ? 'rgba(244,241,234,0.9)' : 'rgba(10,10,10,0.85)'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText('and now, ', 0, 0)

      const prefixW = ctx.measureText('and now, ').width
      const hlPx = topPx * 0.68
      ctx.font = `500 ${hlPx}px "JetBrains Mono", monospace`
      const hlText = 'current thought'
      const hlW = ctx.measureText(hlText).width
      const hlH = hlPx * 1.3
      ctx.fillStyle = isDark ? '#c4ff3d' : '#8fdc00'
      ctx.fillRect(prefixW, topPx * 0.05, hlW + 8 * d, hlH)
      ctx.fillStyle = '#0a0a0a'
      ctx.textBaseline = 'top'
      ctx.fillText(hlText, prefixW + 4 * d, topPx * 0.05 + (hlH - hlPx) * 0.45)
      ctx.restore()

      // Depth annotation (right edge)
      const labels = [
        'depth 6 / recent',
        'depth 5',
        'depth 4',
        'depth 3',
        'depth 2',
        'depth 1 / oldest',
      ]
      const markerTop = 14 * d
      const markerStep = 14 * d
      ctx.font = `${8 * d}px "JetBrains Mono", monospace`
      ctx.fillStyle = isDark ? 'rgba(244,241,234,0.32)' : 'rgba(10,10,10,0.32)'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'top'
      labels.forEach((label, i) => {
        ctx.fillText(label, W - 8 * d, markerTop + i * markerStep)
      })

      // Vertical rule fading downward
      const ruleGrad = ctx.createLinearGradient(
        0,
        markerTop,
        0,
        markerTop + labels.length * markerStep
      )
      ruleGrad.addColorStop(0, isDark ? '#c4ff3d' : '#8fdc00')
      ruleGrad.addColorStop(1, 'rgba(196,255,61,0.04)')
      ctx.strokeStyle = ruleGrad
      ctx.lineWidth = d
      ctx.beginPath()
      ctx.moveTo(W - 3 * d, markerTop)
      ctx.lineTo(W - 3 * d, markerTop + labels.length * markerStep)
      ctx.stroke()
    }

    draw()
    document.fonts.ready.then(draw)
    window.addEventListener('resize', draw)
    return () => window.removeEventListener('resize', draw)
  }, [isDark])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  )
}
