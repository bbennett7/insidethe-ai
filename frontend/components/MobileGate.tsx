'use client'

import { useEffect, useRef } from 'react'
import { useTheme } from '@/lib/ThemeContext'
import styles from './MobileGate.module.css'
import Wordmark from './Wordmark'

export default function MobileGate() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { isDark } = useTheme()
  const isDarkRef = useRef(isDark)
  isDarkRef.current = isDark

  useEffect(() => {
    if (!window.matchMedia('(max-width: 768px)').matches) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    function resize() {
      if (!canvas) return
      canvas.width = window.innerWidth * devicePixelRatio
      canvas.height = window.innerHeight * devicePixelRatio
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
    }

    function draw(t: number) {
      if (!canvas || !ctx) return
      const W = canvas.width,
        H = canvas.height
      const dpr = devicePixelRatio
      const cx = W * 0.5,
        cy = H * 0.5
      const dark = isDarkRef.current

      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = dark ? '#0a0a0a' : '#f5f5f0'
      ctx.fillRect(0, 0, W, H)

      const spacing = 46 * dpr
      const lensR = Math.min(W, H) * 0.22
      const lensStrength = lensR * lensR * 1.1

      function lensPoint(x: number, y: number): [number, number] {
        const dx = x - cx,
          dy = y - cy
        const dist2 = dx * dx + dy * dy
        if (dist2 < 4) return [cx, cy]
        const dist = Math.sqrt(dist2)
        const ripple =
          0.13 * Math.sin(dist * 0.014 - t * 0.0018) + 0.06 * Math.sin(dist * 0.022 + t * 0.0009)
        const pull = (lensStrength / (dist2 + lensR * lensR * 0.12)) * (1 + ripple)
        return [x - dx * pull, y - dy * pull]
      }

      ctx.lineWidth = 0.9 * dpr
      const lineColor = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'

      for (let gx = cx % spacing; gx <= W + spacing; gx += spacing) {
        ctx.beginPath()
        let first = true
        for (let gy = -spacing; gy <= H + spacing; gy += 4) {
          const [px, py] = lensPoint(gx, gy)
          first ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
          first = false
        }
        ctx.strokeStyle = lineColor
        ctx.stroke()
      }

      for (let gy = cy % spacing; gy <= H + spacing; gy += spacing) {
        ctx.beginPath()
        let first = true
        for (let gx = -spacing; gx <= W + spacing; gx += 4) {
          const [px, py] = lensPoint(gx, gy)
          first ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
          first = false
        }
        ctx.strokeStyle = lineColor
        ctx.stroke()
      }

      const voidR = lensR * 0.55
      const vg = ctx.createRadialGradient(cx, cy, 0, cx, cy, voidR * 2.2)
      if (dark) {
        vg.addColorStop(0, 'rgba(10,10,10,1)')
        vg.addColorStop(0.45, 'rgba(10,10,10,1)')
        vg.addColorStop(0.75, 'rgba(10,10,10,0.55)')
        vg.addColorStop(1, 'rgba(10,10,10,0)')
      } else {
        vg.addColorStop(0, 'rgba(245,245,240,1)')
        vg.addColorStop(0.45, 'rgba(245,245,240,1)')
        vg.addColorStop(0.75, 'rgba(245,245,240,0.55)')
        vg.addColorStop(1, 'rgba(245,245,240,0)')
      }
      ctx.fillStyle = vg
      ctx.fillRect(0, 0, W, H)

      const ringR = voidR * 1.15
      const rg = ctx.createRadialGradient(cx, cy, ringR * 0.8, cx, cy, ringR * 1.6)
      rg.addColorStop(0, 'rgba(0,0,0,0)')
      if (dark) {
        rg.addColorStop(0.35, 'rgba(196,255,61,0.055)')
        rg.addColorStop(0.65, 'rgba(196,255,61,0.025)')
      } else {
        rg.addColorStop(0.35, 'rgba(143,220,0,0.1)')
        rg.addColorStop(0.65, 'rgba(143,220,0,0.05)')
      }
      rg.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = rg
      ctx.fillRect(0, 0, W, H)
    }

    let rafId: number
    function loop(ts: number) {
      draw(ts)
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

  return (
    <div className={styles.gate}>
      <canvas ref={canvasRef} className={styles.canvas} />

      <nav className={styles.nav}>
        <Wordmark size="sm" />
      </nav>

      <div className={styles.content}>
        <span className={styles.eyebrow}>Desktop required</span>
        <h1 className={styles.headline}>
          The machine needs
          <br />
          space <em>to think.</em>
        </h1>
        <p className={styles.body}>
          <span className={styles.acid}>insidethe.ai</span> is built for a wider screen - designed
          to be explored, not scrolled. Come back on a laptop or desktop to watch a language model
          run.
        </p>
      </div>

      <footer className={styles.footer}>
        <span>insidethe.ai · v01</span>
        <span>
          gpt-2 · <span className={styles.acid}>117M</span> params
        </span>
      </footer>
    </div>
  )
}
