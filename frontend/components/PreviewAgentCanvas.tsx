'use client'

import { useEffect, useRef } from 'react'
import { canvasBg } from '@/lib/canvasTheme'
import { useTheme } from '@/lib/ThemeContext'

export default function PreviewAgentCanvas() {
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

      const acid = isDark ? '#c4ff3d' : '#8fdc00'
      const acidRgb = isDark ? '196,255,61' : '143,220,0'

      // Node centers (normalized from 400×250 grid reference)
      const T = { x: 0.35 * W, y: 0.38 * H } // THINK
      const A = { x: 0.725 * W, y: 0.48 * H } // ACT
      const O = { x: 0.6125 * W, y: 0.8 * H } // OBSERVE
      const R = { x: 0.225 * W, y: 0.7 * H } // REFLECT

      const rThink = 0.07 * W
      const rOther = 0.055 * W

      // Arrowhead helper (filled triangle at curve endpoint)
      function arrowHead(x: number, y: number, dirX: number, dirY: number) {
        const len = Math.sqrt(dirX ** 2 + dirY ** 2)
        const nx = dirX / len
        const ny = dirY / len
        const s = 7 * dpr
        ctx!.beginPath()
        ctx!.moveTo(x, y)
        ctx!.lineTo(x - s * (nx + ny * 0.55), y - s * (ny - nx * 0.55))
        ctx!.lineTo(x - s * (nx - ny * 0.55), y - s * (ny + nx * 0.55))
        ctx!.closePath()
        ctx!.fill()
      }

      function drawArc(
        x1: number,
        y1: number,
        cpx: number,
        cpy: number,
        x2: number,
        y2: number,
        alpha: number,
        dashed = false
      ) {
        ctx!.save()
        ctx!.globalAlpha = alpha
        ctx!.strokeStyle = acid
        ctx!.fillStyle = acid
        ctx!.lineWidth = 1.4 * dpr
        ctx!.lineCap = 'round'
        if (dashed) ctx!.setLineDash([3 * dpr, 2 * dpr])
        ctx!.beginPath()
        ctx!.moveTo(x1, y1)
        ctx!.quadraticCurveTo(cpx, cpy, x2, y2)
        ctx!.stroke()
        ctx!.setLineDash([])
        // Arrowhead tangent = direction from control to endpoint
        arrowHead(x2, y2, x2 - cpx, y2 - cpy)
        ctx!.restore()
      }

      // Arrows — positions from SVG path data (normalized to 400×250)
      // THINK → ACT: M(172,95) Q(230,88) (270,105)
      drawArc(
        0.43 * W,
        0.38 * H,
        0.575 * W,
        0.352 * H,
        0.675 * W,
        0.42 * H,
        1.0
      )
      // ACT → OBSERVE: M(287,134) Q(285,175) (262,192)
      drawArc(
        0.7175 * W,
        0.536 * H,
        0.7125 * W,
        0.7 * H,
        0.655 * W,
        0.768 * H,
        0.85
      )
      // OBSERVE → REFLECT: M(228,205) Q(160,215) (111,188)
      drawArc(0.57 * W, 0.82 * H, 0.4 * W, 0.86 * H, 0.2775 * W, 0.752 * H, 0.7)
      // REFLECT → THINK: M(94,157) Q(100,110) (122,98) — dashed loop closure
      drawArc(
        0.235 * W,
        0.628 * H,
        0.25 * W,
        0.44 * H,
        0.305 * W,
        0.392 * H,
        0.55,
        true
      )

      // THINK node — large, acid-filled, with radial glow
      const glowGrad = ctx.createRadialGradient(
        T.x,
        T.y,
        0,
        T.x,
        T.y,
        rThink * 1.8
      )
      glowGrad.addColorStop(0, `rgba(${acidRgb},0.25)`)
      glowGrad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glowGrad
      ctx.beginPath()
      ctx.arc(T.x, T.y, rThink * 1.8, 0, Math.PI * 2)
      ctx.fill()

      ctx.beginPath()
      ctx.arc(T.x, T.y, rThink, 0, Math.PI * 2)
      ctx.fillStyle = acid
      ctx.fill()

      ctx.font = `italic 400 ${17 * dpr}px "Fraunces", "Times New Roman", serif`
      ctx.fillStyle = '#0a0a0a'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('think', T.x, T.y + dpr)

      // ACT node
      ctx.beginPath()
      ctx.arc(A.x, A.y, rOther, 0, Math.PI * 2)
      ctx.fillStyle = isDark ? '#131313' : '#2a2a2a'
      ctx.fill()
      ctx.strokeStyle = acid
      ctx.lineWidth = 1.2 * dpr
      ctx.stroke()
      ctx.font = `italic 300 ${13 * dpr}px "Fraunces", "Times New Roman", serif`
      ctx.fillStyle = isDark ? '#f4f1ea' : '#0a0a0a'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('act', A.x, A.y + dpr)

      // OBSERVE node
      ctx.beginPath()
      ctx.arc(O.x, O.y, rOther, 0, Math.PI * 2)
      ctx.fillStyle = isDark ? '#131313' : '#2a2a2a'
      ctx.fill()
      ctx.strokeStyle = `rgba(${acidRgb},0.6)`
      ctx.lineWidth = 1 * dpr
      ctx.stroke()
      ctx.font = `italic 300 ${12 * dpr}px "Fraunces", "Times New Roman", serif`
      ctx.fillStyle = isDark ? 'rgba(244,241,234,0.85)' : 'rgba(10,10,10,0.85)'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('observe', O.x, O.y + dpr)

      // REFLECT node
      ctx.beginPath()
      ctx.arc(R.x, R.y, rOther, 0, Math.PI * 2)
      ctx.fillStyle = isDark ? '#131313' : '#2a2a2a'
      ctx.fill()
      ctx.strokeStyle = `rgba(${acidRgb},0.4)`
      ctx.lineWidth = 1 * dpr
      ctx.stroke()
      ctx.font = `italic 300 ${12 * dpr}px "Fraunces", "Times New Roman", serif`
      ctx.fillStyle = isDark ? 'rgba(244,241,234,0.70)' : 'rgba(10,10,10,0.70)'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('reflect', R.x, R.y + dpr)

      // Arrow labels
      ctx.font = `${7 * dpr}px "JetBrains Mono", monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = `rgba(${acidRgb},0.7)`
      ctx.fillText('plan', W * 0.54, H * 0.328)
      ctx.fillStyle = `rgba(${acidRgb},0.6)`
      ctx.fillText('tool', W * 0.762, H * 0.672)
      ctx.fillStyle = `rgba(${acidRgb},0.5)`
      ctx.fillText('result', W * 0.44, H * 0.88)
      ctx.fillStyle = `rgba(${acidRgb},0.4)`
      ctx.fillText('loop', W * 0.23, H * 0.525)
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
