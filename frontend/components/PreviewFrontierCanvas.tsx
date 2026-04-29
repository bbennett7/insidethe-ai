'use client';

import { useEffect, useRef } from 'react';
import { acidRgba, canvasBg } from '@/lib/canvasTheme';
import { useTheme } from '@/lib/ThemeContext';

export default function PreviewFrontierCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { isDark } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function draw() {
      if (!canvas || !ctx) return;
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      const dpr = devicePixelRatio;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const W = canvas.width;
      const H = canvas.height;
      ctx.fillStyle = canvasBg(isDark);
      ctx.fillRect(0, 0, W, H);

      const padL = 40 * dpr;
      const padR = 20 * dpr;
      const padT = 24 * dpr;
      const padB = 20 * dpr;
      const chartW = W - padL - padR;
      const chartH = H - padT - padB;

      // Axes
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 0.6 * dpr;
      ctx.beginPath();
      ctx.moveTo(padL, padT);
      ctx.lineTo(padL, H - padB);
      ctx.moveTo(padL, H - padB);
      ctx.lineTo(W - padR, H - padB);
      ctx.stroke();

      // Soft horizontal gridlines
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 0.5 * dpr;
      [0.25, 0.5, 0.75].forEach((f) => {
        const y = padT + chartH * (1 - f);
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(W - padR, y);
        ctx.stroke();
      });

      // Exponential curve: [fractionX, fractionY] fy=0 at baseline, fy=1 at top
      const raw: [number, number][] = [
        [0, 0.01],
        [0.12, 0.01],
        [0.25, 0.02],
        [0.38, 0.03],
        [0.5, 0.05],
        [0.6, 0.09],
        [0.68, 0.18],
        [0.76, 0.35],
        [0.84, 0.58],
        [0.9, 0.78],
        [0.95, 0.92],
        [0.99, 0.99],
      ];
      const pts: [number, number][] = raw.map(([fx, fy]) => [
        padL + fx * chartW,
        padT + chartH * (1 - fy),
      ]);
      const last = pts[pts.length - 1];

      // Area fill under curve
      const fillGrad = ctx.createLinearGradient(0, padT, 0, H - padB);
      fillGrad.addColorStop(0, acidRgba(isDark, 0.22));
      fillGrad.addColorStop(1, acidRgba(isDark, 0));
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        const [x1, y1] = pts[i - 1];
        const [x2, y2] = pts[i];
        ctx.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2);
      }
      ctx.lineTo(last[0], last[1]);
      ctx.lineTo(last[0], H - padB);
      ctx.lineTo(pts[0][0], H - padB);
      ctx.closePath();
      ctx.fillStyle = fillGrad;
      ctx.fill();

      function buildPath() {
        if (!ctx) return;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          const [x1, y1] = pts[i - 1];
          const [x2, y2] = pts[i];
          ctx.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2);
        }
        ctx.lineTo(last[0], last[1]);
      }

      // Glow pass
      ctx.save();
      ctx.filter = `blur(${2.5 * dpr}px)`;
      ctx.strokeStyle = acidRgba(isDark, 0.5);
      ctx.lineWidth = 2.5 * dpr;
      ctx.lineCap = 'round';
      buildPath();
      ctx.stroke();
      ctx.restore();

      // Crisp curve
      ctx.strokeStyle = isDark ? '#c4ff3d' : '#8fdc00';
      ctx.lineWidth = 1.8 * dpr;
      ctx.lineCap = 'round';
      buildPath();
      ctx.stroke();

      // Terminal dot with glow ring
      ctx.save();
      ctx.filter = `blur(${2 * dpr}px)`;
      ctx.beginPath();
      ctx.arc(last[0], last[1], 5 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = isDark ? '#c4ff3d' : '#8fdc00';
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(last[0], last[1], 4 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = isDark ? '#c4ff3d' : '#8fdc00';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(last[0], last[1], 9 * dpr, 0, Math.PI * 2);
      ctx.strokeStyle = acidRgba(isDark, 0.4);
      ctx.lineWidth = 0.8 * dpr;
      ctx.stroke();
    }

    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [isDark]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
}
