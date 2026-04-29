'use client'

import { useEffect, useRef } from 'react'
import { useTheme } from '@/lib/ThemeContext'

export default function PreviewChipCanvas() {
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

      // PCB background
      ctx.fillStyle = isDark ? '#0c0c0e' : '#222224'
      ctx.fillRect(0, 0, W, H)

      // PCB dot grid texture
      ctx.fillStyle = isDark ? 'rgba(196,255,61,0.035)' : 'rgba(255,255,255,0.05)'
      const ds = 6 * dpr
      for (let x = ds / 2; x < W; x += ds) {
        for (let y = ds / 2; y < H; y += ds) {
          ctx.beginPath()
          ctx.arc(x, y, 0.25 * dpr, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // PCB outer border
      ctx.strokeStyle = 'rgba(196,255,61,0.15)'
      ctx.lineWidth = 0.6 * dpr
      ctx.strokeRect(0.05 * W, 0.08 * H, 0.9 * W, 0.84 * H)

      // Mounting holes (4 corner pairs)
      const holes: [number, number][] = [
        [0.115 * W, 0.18 * H],
        [0.185 * W, 0.18 * H],
        [0.815 * W, 0.18 * H],
        [0.885 * W, 0.18 * H],
        [0.115 * W, 0.82 * H],
        [0.185 * W, 0.82 * H],
        [0.815 * W, 0.82 * H],
        [0.885 * W, 0.82 * H],
      ]
      const hr = 6 * dpr
      holes.forEach(([hx, hy]) => {
        const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr)
        g.addColorStop(0, isDark ? '#c4ff3d' : '#8fdc00')
        g.addColorStop(0.4, isDark ? '#8faf2b' : '#6a9020')
        g.addColorStop(1, '#4a5a18')
        ctx.beginPath()
        ctx.arc(hx, hy, hr, 0, Math.PI * 2)
        ctx.fillStyle = g
        ctx.fill()
        ctx.beginPath()
        ctx.arc(hx, hy, hr * 0.45, 0, Math.PI * 2)
        ctx.fillStyle = '#0a0a0c'
        ctx.fill()
      })

      // HBM panel geometry
      const hbmW = 0.135 * W
      const hbmH = 0.54 * H
      const hbmY = (H - hbmH) / 2
      const leftX = 0.088 * W
      const rightX = W - 0.088 * W - hbmW

      function drawHbm(x: number, y: number, w: number, h: number) {
        ctx!.save()
        ctx!.beginPath()
        ctx!.rect(x, y, w, h)
        ctx!.clip()
        const stripeW = 3 * dpr
        for (let sx = x; sx < x + w; sx += stripeW) {
          ctx!.fillStyle = isDark ? '#c4ff3d' : '#8fdc00'
          ctx!.fillRect(sx, y, stripeW - 0.4 * dpr, h)
          ctx!.fillStyle = 'rgba(10,10,10,0.25)'
          ctx!.fillRect(sx, y, 0.3 * dpr, h)
          ctx!.fillRect(sx + stripeW - 0.6 * dpr, y, 0.3 * dpr, h)
        }
        const gloss = ctx!.createLinearGradient(x, y, x + w, y + h)
        gloss.addColorStop(0, 'rgba(255,255,255,0.25)')
        gloss.addColorStop(0.5, 'rgba(255,255,255,0)')
        gloss.addColorStop(1, 'rgba(0,0,0,0.15)')
        ctx!.fillStyle = gloss
        ctx!.fillRect(x, y, w, h)
        ctx!.restore()
        ctx!.strokeStyle = 'rgba(10,10,10,0.4)'
        ctx!.lineWidth = 0.4 * dpr
        ctx!.strokeRect(x, y, w, h)
      }

      drawHbm(leftX, hbmY, hbmW, hbmH)
      drawHbm(rightX, hbmY, hbmW, hbmH)

      // Connector pins on HBM top/bottom edges
      ctx.fillStyle = isDark ? 'rgba(196,255,61,0.6)' : 'rgba(143,220,0,0.6)'
      const pinW = 0.6 * dpr
      const pinH = 1.5 * dpr
      const pinStep = 3 * dpr
      ;[leftX, rightX].forEach((hx) => {
        for (let px = hx + 1.5 * dpr; px + pinW < hx + hbmW; px += pinStep) {
          ctx.fillRect(px, hbmY - pinH - 0.5 * dpr, pinW, pinH)
          ctx.fillRect(px, hbmY + hbmH + 0.5 * dpr, pinW, pinH)
        }
      })

      // Compute die substrate
      const dieX = leftX + hbmW + 0.03 * W
      const dieW = rightX - dieX - 0.03 * W
      const dieH = 0.68 * H
      const dieY = (H - dieH) / 2

      const subGrad = ctx.createLinearGradient(0, dieY, 0, dieY + dieH)
      subGrad.addColorStop(0, '#2a3d2a')
      subGrad.addColorStop(1, '#1a2a1a')
      ctx.fillStyle = subGrad
      ctx.fillRect(dieX, dieY, dieW, dieH)
      ctx.strokeStyle = 'rgba(196,255,61,0.35)'
      ctx.lineWidth = 0.6 * dpr
      ctx.strokeRect(dieX, dieY, dieW, dieH)

      // Silicon panels: 3-column layout matching H100 reference
      const panelGrad = ctx.createLinearGradient(0, dieY, 0, dieY + dieH)
      panelGrad.addColorStop(0, '#e8e5dc')
      panelGrad.addColorStop(0.5, '#f4f1ea')
      panelGrad.addColorStop(1, '#c8c5bd')

      const pd = 0.065 * dieW
      const cw = (dieW - 4 * pd) / 3
      const c0 = dieX + pd
      const c1 = dieX + 2 * pd + cw
      const c2 = dieX + 3 * pd + 2 * cw

      // [x, y, w, h] — all absolute canvas coords
      const panels: [number, number, number, number][] = [
        // Left column
        [c0, dieY + 0.058 * dieH, cw, 0.35 * dieH],
        [c0, dieY + 0.45 * dieH, cw, 0.295 * dieH],
        [c0, dieY + 0.785 * dieH, cw, 0.165 * dieH],
        // Center column (thinner, more panels)
        [c1, dieY + 0.058 * dieH, cw, 0.13 * dieH],
        [c1, dieY + 0.208 * dieH, cw, 0.18 * dieH],
        [c1, dieY + 0.418 * dieH, cw, 0.13 * dieH],
        [c1, dieY + 0.578 * dieH, cw, 0.375 * dieH],
        // Right column (mirror of left)
        [c2, dieY + 0.058 * dieH, cw, 0.35 * dieH],
        [c2, dieY + 0.45 * dieH, cw, 0.295 * dieH],
        [c2, dieY + 0.785 * dieH, cw, 0.165 * dieH],
      ]

      panels.forEach(([px, py, pw, ph]) => {
        ctx.fillStyle = panelGrad
        ctx.fillRect(px, py, pw, ph)
        ctx.strokeStyle = 'rgba(10,10,10,0.3)'
        ctx.lineWidth = 0.3 * dpr
        ctx.strokeRect(px, py, pw, ph)
      })

      // Center mark
      const cx = dieX + dieW / 2
      const cy = dieY + dieH / 2
      ctx.beginPath()
      ctx.arc(cx, cy, 7 * dpr, 0, Math.PI * 2)
      ctx.strokeStyle = '#0a0a0a'
      ctx.lineWidth = 1 * dpr
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cx, cy, 3.5 * dpr, 0, Math.PI * 2)
      ctx.fillStyle = isDark ? '#c4ff3d' : '#8fdc00'
      ctx.fill()

      // Solder bumps along die top/bottom edges
      ctx.fillStyle = isDark ? 'rgba(196,255,61,0.5)' : 'rgba(143,220,0,0.5)'
      const bStep = 3 * dpr
      for (let bx = dieX + 1.5 * dpr; bx + 0.5 * dpr < dieX + dieW; bx += bStep) {
        ctx.fillRect(bx, dieY - dpr, 0.5 * dpr, dpr)
        ctx.fillRect(bx, dieY + dieH, 0.5 * dpr, dpr)
      }

      // Surface highlight
      const hlGrad = ctx.createLinearGradient(0, 0, W, H)
      hlGrad.addColorStop(0, 'rgba(255,255,255,0.04)')
      hlGrad.addColorStop(1, 'rgba(0,0,0,0.3)')
      ctx.globalAlpha = 0.5
      ctx.fillStyle = hlGrad
      ctx.fillRect(0, 0, W, H)
      ctx.globalAlpha = 1
    }

    draw()
    window.addEventListener('resize', draw)
    return () => window.removeEventListener('resize', draw)
  }, [isDark])

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
}
