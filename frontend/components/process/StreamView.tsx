'use client'

import { useEffect, useRef } from 'react'
import type { StreamFrame } from '@/lib/processingTypes'
import styles from './StreamView.module.css'

function renderJson(payload: Record<string, unknown>) {
  const entries = Object.entries(payload)
  return (
    <>
      <span className={styles.jp}>{'{'}</span>
      {entries.map(([k, v], i) => (
        <span key={k}>
          <span className={styles.jk}>"{k}"</span>
          <span className={styles.jp}>: </span>
          {typeof v === 'string' ? (
            <span className={styles.jvs}>"{v}"</span>
          ) : (
            <span className={styles.jvn}>{String(v)}</span>
          )}
          {i < entries.length - 1 && <span className={styles.jp}>, </span>}
        </span>
      ))}
      <span className={styles.jp}>{'}'}</span>
    </>
  )
}

interface StreamViewProps {
  frames: StreamFrame[]
}

export default function StreamView({ frames }: StreamViewProps) {
  const feedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = feedRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [frames])

  return (
    <div className={styles.panel}>
      <div className={styles.feed} ref={feedRef}>
        {frames.length === 0 ? (
          <span className={styles.empty}>stream frames appear here</span>
        ) : (
          frames.map((frame) => (
            <div key={frame.num} className={styles.frame}>
              <div className={styles.gutter}>
                <div className={styles.num}>
                  #{String(frame.num).padStart(3, '0')}
                </div>
                <div className={styles.ts}>
                  {frame.ms < 1000
                    ? `+${frame.ms}ms`
                    : `+${(frame.ms / 1000).toFixed(2)}s`}
                </div>
              </div>
              <div className={styles.body}>
                <div className={styles.dir}>← recv</div>
                <div className={styles.json}>{renderJson(frame.payload)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
