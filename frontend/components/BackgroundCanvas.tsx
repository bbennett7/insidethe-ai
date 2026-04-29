'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from '@/lib/ThemeContext';
import styles from './BackgroundCanvas.module.css';

export default function BackgroundCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { isDark } = useTheme();
  const isDarkRef = useRef(isDark);
  isDarkRef.current = isDark;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cachedW = 0,
      cachedH = 0,
      cachedDark = true;
    let voidGrd: CanvasGradient | null = null;
    let ringGrd: CanvasGradient | null = null;

    function buildGradients(W: number, H: number, cx: number, cy: number, dark: boolean) {
      if (!ctx) return;
      const lensR = Math.min(W, H) * 0.22;
      const voidR = lensR * 0.55;
      const ringR = voidR * 1.15;

      voidGrd = ctx.createRadialGradient(cx, cy, 0, cx, cy, voidR * 2.2);
      if (dark) {
        voidGrd.addColorStop(0, 'rgba(10,10,10,1)');
        voidGrd.addColorStop(0.45, 'rgba(10,10,10,1)');
        voidGrd.addColorStop(0.75, 'rgba(10,10,10,0.55)');
        voidGrd.addColorStop(1, 'rgba(10,10,10,0)');
      } else {
        voidGrd.addColorStop(0, 'rgba(245,245,240,1)');
        voidGrd.addColorStop(0.45, 'rgba(245,245,240,1)');
        voidGrd.addColorStop(0.75, 'rgba(245,245,240,0.55)');
        voidGrd.addColorStop(1, 'rgba(245,245,240,0)');
      }

      ringGrd = ctx.createRadialGradient(cx, cy, ringR * 0.8, cx, cy, ringR * 1.6);
      ringGrd.addColorStop(0, 'rgba(0,0,0,0)');
      if (dark) {
        ringGrd.addColorStop(0.35, 'rgba(196,255,61,0.055)');
        ringGrd.addColorStop(0.65, 'rgba(196,255,61,0.025)');
      } else {
        ringGrd.addColorStop(0.35, 'rgba(143,220,0,0.1)');
        ringGrd.addColorStop(0.65, 'rgba(143,220,0,0.05)');
      }
      ringGrd.addColorStop(1, 'rgba(0,0,0,0)');
    }

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth * devicePixelRatio;
      canvas.height = window.innerHeight * devicePixelRatio;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      cachedW = cachedH = 0;
      voidGrd = ringGrd = null;
    }

    function drawBg(t: number) {
      if (!canvas || !ctx) return;

      const W = canvas.width;
      const H = canvas.height;
      const dpr = devicePixelRatio;
      const cx = W * 0.5;
      const cy = H * 0.5;
      const dark = isDarkRef.current;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = dark ? '#0a0a0a' : '#f5f5f0';
      ctx.fillRect(0, 0, W, H);

      const spacing = 46 * dpr;
      const lensR = Math.min(W, H) * 0.22;
      const lensStrength = lensR * lensR * 1.1;

      function lensPoint(x: number, y: number): [number, number] {
        const dx = x - cx;
        const dy = y - cy;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < 4) return [cx, cy];
        const dist = Math.sqrt(dist2);
        const wave = 0.04 * Math.sin(dist * 0.009 - t * 0.0005);
        const pull = (lensStrength / (dist2 + lensR * lensR * 0.12)) * (1 + wave);
        return [x - dx * pull, y - dy * pull];
      }

      ctx.lineWidth = 0.9 * dpr;
      const lineAlpha = 0.1;
      const lineColor = dark ? `rgba(255,255,255,${lineAlpha})` : `rgba(0,0,0,${lineAlpha})`;

      for (let gx = cx % spacing; gx <= W + spacing; gx += spacing) {
        ctx.beginPath();
        let first = true;
        for (let gy = -spacing; gy <= H + spacing; gy += 4) {
          const [px, py] = lensPoint(gx, gy);
          if (first) {
            ctx.moveTo(px, py);
            first = false;
          } else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = lineColor;
        ctx.stroke();
      }

      for (let gy = cy % spacing; gy <= H + spacing; gy += spacing) {
        ctx.beginPath();
        let first = true;
        for (let gx = -spacing; gx <= W + spacing; gx += 4) {
          const [px, py] = lensPoint(gx, gy);
          if (first) {
            ctx.moveTo(px, py);
            first = false;
          } else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = lineColor;
        ctx.stroke();
      }

      if (W !== cachedW || H !== cachedH || dark !== cachedDark) {
        buildGradients(W, H, cx, cy, dark);
        cachedW = W;
        cachedH = H;
        cachedDark = dark;
      }

      if (voidGrd) {
        ctx.fillStyle = voidGrd;
        ctx.fillRect(0, 0, W, H);
      }
      if (ringGrd) {
        ctx.fillStyle = ringGrd;
        ctx.fillRect(0, 0, W, H);
      }
    }

    let rafId: number;
    let paused = false;

    function loop(ts: number) {
      if (!paused) drawBg(ts);
      rafId = requestAnimationFrame(loop);
    }

    function onVisibility() {
      paused = document.hidden;
    }

    let resizeTimer: ReturnType<typeof setTimeout>;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 100);
    }

    resize();
    rafId = requestAnimationFrame(loop);

    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.canvas} />;
}
