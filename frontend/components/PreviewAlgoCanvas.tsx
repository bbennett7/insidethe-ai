'use client'

import { useEffect, useRef } from 'react'
import { canvasBg } from '@/lib/canvasTheme'
import { useTheme } from '@/lib/ThemeContext'

export default function PreviewAlgoCanvas() {
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

      // Subtle radial glow in top-right
      const bgGrad = ctx.createRadialGradient(W * 0.7, H * 0.3, 0, W * 0.7, H * 0.3, W * 0.6)
      bgGrad.addColorStop(0, isDark ? 'rgba(196,255,61,0.04)' : 'rgba(143,220,0,0.06)')
      bgGrad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, W, H)

      // Ellipse around central equation
      ctx.beginPath()
      ctx.ellipse(W * 0.5, H * 0.5, W * 0.235, H * 0.22, 0, 0, Math.PI * 2)
      ctx.strokeStyle = isDark ? 'rgba(196,255,61,0.5)' : 'rgba(143,220,0,0.6)'
      ctx.lineWidth = 0.8 * dpr
      ctx.stroke()

      // Pointer arrow: upper-left equation → center
      ctx.beginPath()
      ctx.moveTo(W * 0.37, H * 0.245)
      ctx.quadraticCurveTo(W * 0.39, H * 0.36, W * 0.415, H * 0.435)
      ctx.strokeStyle = isDark ? 'rgba(244,241,234,0.3)' : 'rgba(10,10,10,0.3)'
      ctx.lineWidth = 0.6 * dpr
      ctx.stroke()
      // Arrowhead
      ctx.beginPath()
      ctx.moveTo(W * 0.408, H * 0.432)
      ctx.lineTo(W * 0.42, H * 0.443)
      ctx.lineTo(W * 0.424, H * 0.428)
      ctx.strokeStyle = isDark ? 'rgba(244,241,234,0.3)' : 'rgba(10,10,10,0.3)'
      ctx.lineWidth = 0.6 * dpr
      ctx.stroke()

      // Connection between two bottom equations (dashed)
      ctx.beginPath()
      ctx.setLineDash([2 * dpr, 2 * dpr])
      ctx.moveTo(W * 0.3, H * 0.82)
      ctx.quadraticCurveTo(W * 0.45, H * 0.78, W * 0.6, H * 0.825)
      ctx.strokeStyle = isDark ? 'rgba(244,241,234,0.25)' : 'rgba(10,10,10,0.25)'
      ctx.lineWidth = 0.5 * dpr
      ctx.stroke()
      ctx.setLineDash([])

      // Scribbled underline under central equation
      ctx.beginPath()
      ctx.moveTo(W * 0.265, H * 0.605)
      ctx.quadraticCurveTo(W * 0.425, H * 0.625, W * 0.5, H * 0.6)
      ctx.quadraticCurveTo(W * 0.575, H * 0.578, W * 0.65, H * 0.605)
      ctx.strokeStyle = isDark ? 'rgba(196,255,61,0.6)' : 'rgba(143,220,0,0.7)'
      ctx.lineWidth = 0.8 * dpr
      ctx.stroke()

      // Strikethrough on top-right discarded equation
      ctx.beginPath()
      ctx.moveTo(W * 0.7, H * 0.205)
      ctx.lineTo(W * 0.965, H * 0.19)
      ctx.strokeStyle = isDark ? 'rgba(244,241,234,0.3)' : 'rgba(10,10,10,0.3)'
      ctx.lineWidth = 0.6 * dpr
      ctx.stroke()

      // Equation helper
      function eq(
        text: string,
        x: number,
        y: number,
        size: number,
        alpha: number,
        deg: number,
        accent = false
      ) {
        if (!ctx) return
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.translate(x, y)
        ctx.rotate((deg * Math.PI) / 180)
        ctx.font = `italic 300 ${size}px "Fraunces", "Times New Roman", serif`
        ctx.fillStyle = accent
          ? isDark
            ? '#c4ff3d'
            : '#8fdc00'
          : isDark
            ? 'rgba(244,241,234,1)'
            : 'rgba(10,10,10,1)'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText(text, 0, 0)
        ctx.restore()
      }

      // Top-left: chain rule (ghost)
      eq('∂L/∂w = ∂L/∂y · ∂y/∂w', W * 0.085, H * 0.112, 13 * dpr, 0.22, -4)

      // Top-right: discarded variant (muted, has strikethrough above)
      eq('y = Wx + b + ε', W * 0.7, H * 0.175, 12 * dpr, 0.28, 2)

      // Upper-middle: attention formula (medium weight)
      eq('Attn(Q,K,V) = softmax(QKᵀ/√d)V', W * 0.135, H * 0.272, 15 * dpr, 0.45, -2)

      // CENTER: softmax — hero, acid, largest
      eq('σ(xᵢ) = eˣⁱ / Σⱼ eˣʲ', W * 0.18, H * 0.425, 22 * dpr, 1.0, -1, true)

      // Right of center: cross-entropy (ghost)
      eq('H(p,q) = −Σ p(x)log q(x)', W * 0.555, H * 0.598, 12 * dpr, 0.28, 3)

      // Lower-left: gradient update rule
      eq('θt+1 = θt − η∇L(θt)', W * 0.08, H * 0.735, 14 * dpr, 0.45, 1.5)

      // Lower-right: layer norm (ghost)
      eq('LN(x) = γ(x−μ)/σ + β', W * 0.595, H * 0.775, 13 * dpr, 0.22, -2.5)

      // Margin annotation
      ctx.save()
      ctx.globalAlpha = 0.65
      ctx.translate(W * 0.52, H * 0.72)
      ctx.rotate((-5 * Math.PI) / 180)
      ctx.font = `600 ${14 * dpr}px "JetBrains Mono", monospace`
      ctx.fillStyle = isDark ? '#c4ff3d' : '#8fdc00'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText('→ the core!', 0, 0)
      ctx.restore()
    }

    draw()
    document.fonts.ready.then(draw)
    window.addEventListener('resize', draw)
    return () => window.removeEventListener('resize', draw)
  }, [isDark])

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
}
