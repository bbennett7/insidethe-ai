'use client'

import { forwardRef, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type {
  Candidate,
  MergeItem,
  OutputToken,
  ProcessState,
  Token,
} from '@/lib/processingTypes'
import EmbeddingStrip from './EmbeddingStrip'
import styles from './InputPanel.module.css'

interface InputPanelProps {
  onRun: (text: string) => void
  onCancel: () => void
  onReset: () => void
  state: ProcessState
  inputTokens: Token[]
  outputTokens: OutputToken[]
  mergeStageIndex: number
  mergeStages: MergeItem[][]
  isStepMode: boolean
  onToggleMode: (mode: 'stream' | 'step') => void
  speed: number
  onSpeedChange: (v: number) => void
  onStepNext: () => void
  awaitingStep: boolean
  speedRef: React.MutableRefObject<number>
}

export default function InputPanel({
  onRun,
  onCancel,
  onReset,
  state,
  inputTokens,
  outputTokens,
  mergeStageIndex,
  mergeStages,
  isStepMode,
  onToggleMode,
  speed,
  onSpeedChange,
  onStepNext,
  awaitingStep,
  speedRef,
}: InputPanelProps) {
  const [text, setText] = useState('')
  const [chipWidths, setChipWidths] = useState<number[]>([])
  const chipRefs = useRef<(HTMLSpanElement | null)[]>([])

  const measureChips = useCallback(() => {
    const widths = chipRefs.current.map((el) => el?.offsetWidth ?? 40)
    setChipWidths(widths)
  }, [])

  useEffect(() => {
    if (inputTokens.length > 0) {
      requestAnimationFrame(measureChips)
    }
  }, [inputTokens, measureChips])

  const showEmbeds =
    state === 'embedding' || state === 'computing' || state === 'done'
  const showMerge = state === 'tokenizing'
  const showChips = showEmbeds || showMerge

  function renderMergeStage(stage: MergeItem[]) {
    return stage.map(({ t, sp, m }, idx) => (
      <span
        key={idx}
        className={[
          styles.ch,
          sp ? styles.chSpace : '',
          m ? styles.chMerged : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {t}
      </span>
    ))
  }

  void showChips

  return (
    <div className={styles.panel}>
      {/* 1. Prompt */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Prompt</span>
          {(state === 'idle' || state === 'done') && outputTokens.length > 0 && (
            <button type="button" className={styles.btnReset} onClick={onReset}>
              Reset ×
            </button>
          )}
        </div>
        <div className={styles.promptBox}>
          <textarea
            className={styles.textarea}
            rows={3}
            placeholder="The cat sat on the mat"
            value={text}
            maxLength={50}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && (state === 'idle' || state === 'done')) {
                e.preventDefault()
                onRun(text || 'The cat sat on the mat')
              }
            }}
            disabled={state !== 'idle' && state !== 'done'}
          />
          <div className={styles.promptControls}>
            <span
              className={`${styles.charCount}${text.length >= 45 ? ` ${styles.charCountNear}` : ''}`}
            >
              {text.length} / 50
            </span>
            {state === 'idle' || state === 'done' ? (
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => onRun(text || 'The cat sat on the mat')}
              >
                Run →
              </button>
            ) : (
              <button
                type="button"
                className={styles.btnCancel}
                onClick={onCancel}
              >
                Cancel ×
              </button>
            )}
          </div>
        </div>
        <p className={styles.promptHint}>
          50 chars max — short prompts are easier to visualize.
        </p>
      </div>

      {/* 2. Playback */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Playback</span>
        </div>
        <div className={styles.playback}>
          <div className={styles.playbackRow}>
            <span className={styles.playbackLabel}>Speed</span>
            <input
              type="range"
              className={styles.speedSlider}
              min={0.01}
              max={1}
              step={0.01}
              value={speed}
              onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
            />
            <span className={styles.speedValue}>{speed.toFixed(2)}</span>
          </div>
          <div className={styles.playbackRow}>
            <span className={styles.playbackLabel}>Mode</span>
            <div className={styles.modeToggle}>
              <button
                type="button"
                className={`${styles.modeBtn}${!isStepMode ? ` ${styles.modeBtnActive}` : ''}`}
                disabled={state !== 'idle' && state !== 'done'}
                onClick={() => onToggleMode('stream')}
              >
                Stream
              </button>
              <button
                type="button"
                className={`${styles.modeBtn}${isStepMode ? ` ${styles.modeBtnActive}` : ''}`}
                disabled={state !== 'idle' && state !== 'done'}
                onClick={() => onToggleMode('step')}
              >
                Step
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Input tokens */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Input Tokens</span>
        </div>
        <div className={styles.tokenChips}>
          {showMerge && mergeStages[mergeStageIndex] && (
            <div className={styles.mergeWrap}>
              <div className={styles.mergeStage}>
                {renderMergeStage(mergeStages[mergeStageIndex])}
              </div>
            </div>
          )}

          {showEmbeds &&
            inputTokens.map((tok, i) => (
              <div key={tok.id} className={styles.embedTokenWrap}>
                <span
                  ref={(el) => {
                    chipRefs.current[i] = el
                  }}
                  className={styles.tok}
                >
                  <span className={styles.tokId}>{tok.id}</span>
                  {tok.text}
                </span>
                {chipWidths[i] !== undefined && (
                  <EmbeddingStrip
                    tokenIndex={i}
                    width={chipWidths[i]}
                    animating={state === 'embedding'}
                    speedRef={speedRef}
                  />
                )}
              </div>
            ))}

          {state === 'tokenizing' && (
            <div className={styles.phaseLabelWrap}>
              <span className={styles.dotBlink} />
              <span>merging…</span>
            </div>
          )}
        </div>
      </div>

      {/* 4. Output tokens */}
      <div className={`${styles.section} ${styles.sectionLast}`}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Output Tokens</span>
          {awaitingStep && (
            <button type="button" className={styles.btnNextInline} onClick={onStepNext}>
              Next token →
            </button>
          )}
        </div>
        <div className={styles.outputSection}>
          {(state === 'tokenizing' || state === 'embedding') && (
            <div className={styles.computingPlaceholder}>
              <span
                className={`${styles.dotBlink} ${styles.dotQuiet}`}
                style={{ animationName: 'none' }}
              />
              <span>waiting…</span>
            </div>
          )}

          {state === 'computing' && outputTokens.length === 0 && (
            <div className={styles.computingPlaceholder}>
              <span className={styles.dotBlink} />
              <span>computing…</span>
            </div>
          )}

          {outputTokens.length > 0 && (
            <div className={styles.outputTokens}>
              {outputTokens.map((tok, i) => (
                <OutputChipWithTooltip key={i} tok={tok} />
              ))}
            </div>
          )}

          {state === 'computing' && outputTokens.length > 0 && (
            <div className={styles.computingPlaceholder}>
              <span className={styles.dotBlink} />
              <span>computing…</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function OutputChipWithTooltip({ tok }: { tok: OutputToken }) {
  const [mounted, setMounted] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)))
  }, [])

  // Position and show tooltip via direct DOM manipulation — zero React renders per mousemove
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const el = tooltipRef.current
    if (!el) return
    const pad = 14
    let x = e.clientX + pad
    let y = e.clientY - pad
    const tw = el.offsetWidth || 160
    const th = el.offsetHeight || 120
    if (x + tw > window.innerWidth - pad) x = e.clientX - tw - pad
    if (y + th > window.innerHeight - pad) y = e.clientY - th - pad
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    el.style.opacity = '1'
  }, [])

  const handleMouseLeave = useCallback(() => {
    const el = tooltipRef.current
    if (el) el.style.opacity = '0'
  }, [])

  const maxProb = tok.candidates[0]?.probability ?? 1

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover-only tooltip trigger — no interactive role needed
    <span
      className={styles.outputTok}
      style={{ opacity: mounted ? 1 : 0, transition: 'opacity 200ms' }}
      onMouseEnter={handleMouseMove}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <span className={styles.tokId}>{tok.id}</span>
      {tok.text}
      <CandidateTooltip
        ref={tooltipRef}
        candidates={tok.candidates}
        maxProb={maxProb}
      />
    </span>
  )
}

const CandidateTooltip = forwardRef<
  HTMLDivElement,
  {
    candidates: Candidate[]
    maxProb: number
  }
>(function CandidateTooltip({ candidates, maxProb }, ref) {
  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) return null

  return createPortal(
    <div ref={ref} className={styles.tooltip}>
      <div className={styles.tooltipName}>{candidates[0]?.text}</div>
      <div className={styles.tooltipId}>ID {candidates[0]?.id}</div>
      {candidates.map((c, i) => (
        <div key={i} className={styles.tooltipRow}>
          <span
            className={`${styles.tooltipToken}${i === 0 ? ` ${styles.tooltipTokenTop}` : ''}`}
          >
            {c.text}
          </span>
          <div className={styles.tooltipBarWrap}>
            <div
              className={styles.tooltipBar}
              style={{ width: `${Math.round((c.probability / maxProb) * 100)}%` }}
            />
          </div>
          <span className={styles.tooltipProb}>{c.probability.toFixed(2)}</span>
        </div>
      ))}
    </div>,
    document.body
  )
})
