'use client'

import posthog from 'posthog-js'
import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ScrollArea from '@/components/ScrollArea'
import type { Candidate, MergeItem, OutputToken, ProcessState, Token } from '@/lib/processingTypes'
import { positionTooltipEl } from '@/lib/tooltipPosition'
import EmbeddingStrip from './EmbeddingStrip'
import InfoTooltip from './InfoTooltip'
import styles from './InputPanel.module.css'
import {
  embeddingStripTooltip,
  inputTokenCountTooltip,
  outputTokenCountTooltip,
  tokenIdTooltip,
} from './tooltipContent'

interface InputPanelProps {
  onRun: (text: string) => void
  onCancel: () => void
  onReset: () => void
  state: ProcessState
  inputTokens: Token[]
  outputTokens: OutputToken[]
  embedVectors: Record<number, number[]>
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
  embedVectors,
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

  const showEmbeds = state === 'embedding' || state === 'computing' || state === 'done'

  // Measure after chips mount (showEmbeds flips true) — rAF on inputTokens alone fires
  // while chips aren't mounted yet, giving null refs and wrong fallback widths.
  useLayoutEffect(() => {
    if (!showEmbeds || inputTokens.length === 0) return
    const widths = chipRefs.current.slice(0, inputTokens.length).map((el) => el?.offsetWidth ?? 40)
    setChipWidths(widths)
  }, [inputTokens, showEmbeds])

  const showMerge = state === 'tokenizing'
  const showChips = showEmbeds || showMerge

  function renderMergeStage(stage: MergeItem[]) {
    return stage.map(({ t, sp, m }, idx) => (
      <div key={`merge-${idx}`} className={styles.embedTokenWrap}>
        <span className={styles.tokIdPlaceholder} aria-hidden="true">
          {sp ? '' : '—'}
        </span>
        <span
          className={[styles.ch, sp ? styles.chSpace : '', m ? styles.chMerged : '']
            .filter(Boolean)
            .join(' ')}
        >
          {t}
        </span>
      </div>
    ))
  }

  void showChips

  return (
    <div className={styles.panel}>
      {/* 1. Prompt */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Prompt</span>
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
              if (e.key === 'Enter' && !e.shiftKey && state === 'idle' && text.trim()) {
                e.preventDefault()
                onRun(text)
              }
            }}
            disabled={state !== 'idle'}
          />
          <div className={styles.promptControls}>
            <span
              className={`${styles.charCount}${text.length >= 45 ? ` ${styles.charCountNear}` : ''}`}
            >
              {text.length} / 50
            </span>
            {state === 'idle' ? (
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => {
                  posthog.capture('processing_run')
                  onRun(text)
                }}
                disabled={!text.trim()}
              >
                Run →
              </button>
            ) : state === 'done' ? (
              <button
                type="button"
                className={styles.btnCancel}
                onClick={() => {
                  setText('')
                  onReset()
                }}
              >
                Reset
              </button>
            ) : (
              <button type="button" className={styles.btnCancel} onClick={onCancel}>
                Cancel ×
              </button>
            )}
          </div>
        </div>
        <p className={styles.promptHint}>50 chars max — short prompts are easier to visualize.</p>
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
          <InfoTooltip content={inputTokenCountTooltip()} labelHint>
            <span className={styles.eyebrow}>Input Tokens</span>
          </InfoTooltip>
        </div>
        {(state === 'tokenizing' ||
          state === 'embedding' ||
          state === 'computing' ||
          state === 'done') && (
          <div className={styles.phaseLabelWrap}>
            {state === 'tokenizing' ? (
              <span className={styles.dotBlink} />
            ) : (
              <span className={styles.dotDone} />
            )}
            <span>{state === 'tokenizing' ? 'merging…' : 'tokenized'}</span>
          </div>
        )}
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
              <div key={`inp-${i}-${tok.id}`} className={styles.embedTokenWrap}>
                <InfoTooltip content={tokenIdTooltip()}>
                  <span className={styles.tokId}>{tok.id}</span>
                </InfoTooltip>
                <span
                  ref={(el) => {
                    chipRefs.current[i] = el
                  }}
                  className={styles.tok}
                >
                  {tok.text}
                </span>
                <InfoTooltip content={embeddingStripTooltip()}>
                  <EmbeddingStrip
                    tokenIndex={i}
                    vector={embedVectors[i] ?? null}
                    width={chipWidths[i] ?? 40}
                    animating={showEmbeds}
                    speedRef={speedRef}
                  />
                </InfoTooltip>
              </div>
            ))}
        </div>
      </div>

      {/* 4. Output tokens */}
      <div className={`${styles.section} ${styles.sectionOutput}`}>
        <div className={styles.sectionHeader}>
          <InfoTooltip content={outputTokenCountTooltip()} labelHint>
            <span className={styles.eyebrow}>Output Tokens</span>
          </InfoTooltip>
          {awaitingStep && (
            <button type="button" className={styles.btnNextInline} onClick={onStepNext}>
              Next token →
            </button>
          )}
        </div>
        {(state === 'tokenizing' || state === 'embedding') && (
          <div className={styles.computingPlaceholder}>
            <span
              className={`${styles.dotBlink} ${styles.dotQuiet}`}
              style={{ animationName: 'none' }}
            />
            <span>waiting…</span>
          </div>
        )}
        {state === 'computing' && (
          <div className={styles.computingPlaceholder}>
            <span className={styles.dotBlink} />
            <span>computing…</span>
          </div>
        )}
        {state === 'done' && awaitingStep && (
          <div className={styles.computingPlaceholder}>
            <span
              className={`${styles.dotBlink} ${styles.dotQuiet}`}
              style={{ animationName: 'none' }}
            />
            <span>idle</span>
          </div>
        )}
        <ScrollArea className={styles.outputScrollable}>
          <div className={styles.outputSection}>
            {outputTokens.length > 0 && (
              <div className={styles.outputTokens}>
                {outputTokens.map((tok, i) => (
                  <OutputChipWithTooltip key={`out-${i}-${tok.id}`} tok={tok} />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
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

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const el = tooltipRef.current
    if (!el) return
    positionTooltipEl(el, e.clientX, e.clientY)
    el.style.opacity = '1'
  }, [])

  const handleMouseLeave = useCallback(() => {
    const el = tooltipRef.current
    if (el) el.style.opacity = '0'
  }, [])

  const maxProb = tok.candidates[0]?.probability ?? 1

  return (
    <div
      className={styles.outputTokWrap}
      style={{ opacity: mounted ? 1 : 0, transition: 'opacity 200ms' }}
    >
      <span className={styles.tokId}>{tok.id}</span>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: hover-only tooltip trigger — no interactive role needed */}
      <span
        className={styles.outputTok}
        onMouseEnter={handleMouseMove}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {tok.text}
        <CandidateTooltip ref={tooltipRef} candidates={tok.candidates} maxProb={maxProb} />
      </span>
    </div>
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
      <div className={styles.tooltipSection}>
        <span>top candidates</span>
        <span className={styles.tooltipSectionHint}>tokens the model considered here</span>
      </div>
      <div className={styles.tooltipColHeaders}>
        <span className={styles.tooltipColToken}>token</span>
        <span className={styles.tooltipColBar} />
        <span className={styles.tooltipColPLabel}>p</span>
      </div>
      {candidates.map((c, i) => (
        <div key={`cand-${i}-${c.id}`} className={styles.tooltipRow}>
          <span className={`${styles.tooltipToken}${i === 0 ? ` ${styles.tooltipTokenTop}` : ''}`}>
            {c.text}
          </span>
          <div className={styles.tooltipBarWrap}>
            <div
              className={styles.tooltipBar}
              style={{
                width: `${Math.round((c.probability / maxProb) * 100)}%`,
              }}
            />
          </div>
          <span className={styles.tooltipProb}>{c.probability.toFixed(2)}</span>
        </div>
      ))}
    </div>,
    document.body
  )
})
